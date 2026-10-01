import { z } from "zod";

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
