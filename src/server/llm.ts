import "server-only";
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

/** Convert a browser upload (a `File` from `request.formData()`) into an `LlmFile`. */
export async function fileFromUpload(file: File): Promise<LlmFile> {
  return {
    name: file.name,
    mediaType: file.type || "text/plain",
    bytes: Buffer.from(await file.arrayBuffer()),
  };
}

export type LlmRequest = {
  prompt: string;
  system?: string;
  files?: LlmFile[];
  maxTokens?: number;
  model?: string;
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
  // Anything else is treated as plain text.
  return {
    type: "text",
    text: `<document name="${file.name}">\n${file.bytes.toString("utf8")}\n</document>`,
  };
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

/** One prompt in, full text out. */
export async function complete(req: LlmRequest) {
  const message = await anthropic().messages.create(params(req, 16000));
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  return { text, ...meta(message) };
}

/** Prompt (plus optional PDF/image/text files) in, JSON matching `schema` out. */
export async function extract<T extends z.ZodType>(schema: T, req: LlmRequest) {
  const message = await anthropic().messages.parse({
    ...params(req, 16000),
    output_config: { format: zodOutputFormat(schema) },
  });
  if (message.parsed_output == null) {
    throw new LlmError(
      `Model returned no parsable output (stop_reason: ${message.stop_reason}).`,
      502,
    );
  }
  return { data: message.parsed_output, ...meta(message) };
}

/** Text chunks as they are generated, ready to hand to `new Response(...)`. */
export function streamText(req: LlmRequest): ReadableStream<Uint8Array> {
  const stream = anthropic().messages.stream(params(req, 32000));
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
  const result = await complete({
    prompt: "Reply with the single word: ok",
    maxTokens: 16,
  });
  return { reply: result.text.trim(), model: result.model, latencyMs: Date.now() - started };
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
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, type: "rate_limit_error", message: "Rate limited by Anthropic. Retry shortly." };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 502, type: "connection_error", message: "Could not reach the Anthropic API." };
  }
  if (err instanceof Anthropic.APIError) {
    // err.message is "<status> <raw JSON body>"; prefer the API's own message when the body has one.
    const body = err.error as { error?: { message?: unknown } } | undefined;
    const apiMessage = body?.error?.message;
    return {
      status: err.status ?? 500,
      type: err.type ?? "api_error",
      message: typeof apiMessage === "string" ? apiMessage : err.message,
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
