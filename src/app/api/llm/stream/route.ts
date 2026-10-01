import { z } from "zod";
import { errorResponse, parseJson } from "@/server/http";
import { streamText } from "@/server/llm";

export const maxDuration = 60;

const Body = z.object({
  prompt: z.string().min(1),
  system: z.string().optional(),
});

// Responds with plain text chunks; read it with `response.body.getReader()`.
export async function POST(request: Request) {
  const body = await parseJson(request, Body);
  if ("response" in body) return body.response;
  try {
    return new Response(streamText(body.data), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
