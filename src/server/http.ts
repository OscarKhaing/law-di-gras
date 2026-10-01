import { z } from "zod";
import { describeError } from "@/server/llm";

// Request and response helpers for route handlers. Every API error has the shape
// `{ error: { type, message } }`, which `fetchJson` in src/lib turns into a thrown Error.

/** Parse a JSON request body against a schema, or return a 400 response. */
export async function parseJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: Response }> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (parsed.success) return { data: parsed.data };
  return { response: badRequest(z.prettifyError(parsed.error)) };
}

export function badRequest(message: string): Response {
  return Response.json({ error: { type: "invalid_request", message } }, { status: 400 });
}

/** Turn anything a route handler caught into an error response. */
export function errorResponse(err: unknown): Response {
  const { status, type, message } = describeError(err);
  console.error(`[api] ${type}: ${message}`);
  return Response.json({ error: { type, message } }, { status });
}
