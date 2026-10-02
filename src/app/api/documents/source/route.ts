import { z } from "zod";
import { documentSource } from "@/features/documents/server";
import { errorResponse, parseJson } from "@/server/http";

// The first time a long document is opened it is cut into parts, which takes longer than a lookup.
export const maxDuration = 300;

const Body = z.object({
  matterId: z.number().int().positive(),
  ref: z.string().regex(/^D\d+$/),
  page: z.number().int().positive(),
});

// Where the browser can open one page of a case document, and what was read on that page.
export async function POST(request: Request) {
  const body = await parseJson(request, Body);
  if ("response" in body) return body.response;
  try {
    return Response.json(await documentSource(body.data.matterId, body.data.ref, body.data.page));
  } catch (err) {
    return errorResponse(err);
  }
}
