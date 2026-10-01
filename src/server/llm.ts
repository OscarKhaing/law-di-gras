import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

// Every LLM call in the app goes through this file.
// Haiku 4.5 by default so demo calls return quickly; set LLM_MODEL to override.
export const MODEL = process.env.LLM_MODEL ?? "claude-haiku-4-5";

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export type LlmFile = { name: string; mediaType: string; bytes: Buffer };

export type LlmRequest = {
  prompt: string;
  system?: string;
  files?: LlmFile[];
  maxTokens?: number;
  model?: string;
  /** Stops the call when aborted. Routes use it to stay inside their time limit; scripts leave it out. */
  signal?: AbortSignal;
};

let client: Anthropic | undefined;

function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new LlmError(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (and to the Vercel project's env vars).",
    );
  }
  return (client ??= new Anthropic());
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

function fileBlock(file: LlmFile): Anthropic.ContentBlockParam {
  if (file.mediaType === "application/pdf") {
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: file.bytes.toString("base64"),
      },
    };
  }
  if ((IMAGE_TYPES as readonly string[]).includes(file.mediaType)) {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: file.mediaType as ImageType,
        data: file.bytes.toString("base64"),
      },
    };
  }
  if (file.mediaType.startsWith("text/") || file.mediaType === "application/json") {
    return {
      type: "text",
      text: `<document name="${file.name}">\n${file.bytes.toString("utf8")}\n</document>`,
    };
  }
  throw new LlmError(
    `Unsupported file type "${file.mediaType}". Use a PDF, an image (JPEG, PNG, GIF, WebP) or a text file.`,
    415,
  );
}

function params(req: LlmRequest, defaultMaxTokens: number) {
  return {
    model: req.model ?? MODEL,
    max_tokens: req.maxTokens ?? defaultMaxTokens,
    ...(req.system ? { system: req.system } : {}),
    messages: [
      {
        role: "user" as const,
        // Files go before the prompt text.
        content: [
          ...(req.files ?? []).map(fileBlock),
          { type: "text" as const, text: req.prompt },
        ],
      },
    ],
  };
}

function meta(message: Anthropic.Message) {
  return {
    model: message.model,
    stopReason: message.stop_reason,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}

// Larger models put thinking blocks before the text, so select by type, never by position.
function textOf(message: Anthropic.Message) {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/** A reply is only usable when the model finished on its own. */
function assertComplete(message: Anthropic.Message) {
  if (message.stop_reason === "refusal") {
    const why = message.stop_details?.explanation ?? "No reason was given.";
    throw new LlmError(`${message.model} declined this request. ${why}`, 422);
  }
  if (message.stop_reason === "max_tokens" || message.stop_reason === "model_context_window_exceeded") {
    throw new LlmError(
      `The reply was cut off (${message.stop_reason}) after ${message.usage.output_tokens} output tokens. Ask for less, or raise maxTokens.`,
      502,
    );
  }
}

/** One prompt in, full text out. */
export async function complete(req: LlmRequest) {
  const message = await anthropic().messages.create(params(req, 16000), { signal: req.signal });
  assertComplete(message);
  return { text: textOf(message), ...meta(message) };
}

/** Prompt (plus optional PDF/image/text files) in, JSON matching `schema` out. */
export async function extract<T extends z.ZodType>(schema: T, req: LlmRequest) {
  const format = zodOutputFormat(schema);
  // Streamed, so a long answer is not cut off by an HTTP timeout. Only the schema is sent, not the
  // SDK's parser, so a cut-off or declined reply is reported as such instead of as a parse error.
  const message = await anthropic()
    .messages.stream(
      { ...params(req, 32000), output_config: { format: { type: format.type, schema: format.schema } } },
      { signal: req.signal },
    )
    .finalMessage();
  assertComplete(message);
  try {
    return { data: format.parse(textOf(message)) as z.infer<T>, ...meta(message) };
  } catch (err) {
    throw new LlmError(`The model's output did not match the schema. ${describeError(err).message}`, 502);
  }
}

/** Text chunks as they are generated, ready to hand to `new Response(...)`. */
export function streamText(req: LlmRequest): ReadableStream<Uint8Array> {
  const stream = anthropic().messages.stream(params(req, 32000), { signal: req.signal });
  const encoder = new TextEncoder();
  let cancelled = false;
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        assertComplete(await stream.finalMessage());
      } catch (err) {
        if (cancelled) return;
        // Headers are already sent, so surface the failure in the text itself.
        controller.enqueue(
          encoder.encode(`\n\n[LLM error: ${describeError(err).message}]`),
        );
      }
      controller.close();
    },
    cancel() {
      cancelled = true;
      stream.abort();
    },
  });
}

/** Smallest possible round trip, used by /api/health and the check script. */
export async function ping() {
  const started = Date.now();
  // Thinking counts toward max_tokens on the larger models, so leave room for it before the reply.
  const result = await complete({ prompt: "Reply with the single word: ok", maxTokens: 2048 });
  const reply = result.text.trim();
  if (!reply) throw new LlmError(`${result.model} returned an empty reply.`, 502);
  return { reply, model: result.model, latencyMs: Date.now() - started };
}

export function describeError(err: unknown): { status: number; type: string; message: string } {
  if (err instanceof LlmError) {
    return { status: err.status, type: "llm_error", message: err.message };
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return {
      status: 401,
      type: "authentication_error",
      message: "Anthropic rejected the API key. Check ANTHROPIC_API_KEY.",
    };
  }
  if (err instanceof Anthropic.APIUserAbortError) {
    return {
      status: 504,
      type: "timeout",
      message:
        "The model did not finish within the time limit. Use a shorter document, or run it with scripts/extract-file.ts, which has no limit.",
    };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 502, type: "connection_error", message: "Could not reach the Anthropic API." };
  }
  if (err instanceof Anthropic.APIError && err.status === 413) {
    // Rejected at the edge, with no JSON body to quote.
    return {
      status: 413,
      type: "request_too_large",
      message: "The request is over the model's 32 MB limit. Use a smaller file or split it.",
    };
  }
  if (err instanceof Anthropic.APIError) {
    // err.message is "<status> <raw JSON body>"; prefer the API's own message when the body has one,
    // without the request path it puts in front of validation errors ("messages.0.content.0...: ").
    const body = err.error as { error?: { message?: unknown } } | undefined;
    const apiMessage = body?.error?.message;
    return {
      status: err.status ?? 500,
      type: err.type ?? "api_error",
      message: typeof apiMessage === "string" ? apiMessage.replace(/^messages(\.\w+)+: /, "") : err.message,
    };
  }
  // Anything else, including Supabase errors, which are not always Error instances.
  const message = (err as { message?: unknown } | null)?.message;
  return {
    status: 500,
    type: "internal_error",
    message: typeof message === "string" ? message : String(err),
  };
}
