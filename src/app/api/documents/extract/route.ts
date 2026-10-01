import { z } from "zod";
import { extractDocument, loadDocument } from "@/features/documents/server";
import { errorResponse, parseJson } from "@/server/http";

export const maxDuration = 300;

// A path returned by /api/documents/upload-url.
const Body = z.object({
  path: z.string().regex(/^uploads\/[\w-]+\/[\w.-]+$/, "Not an upload path."),
});

// Step 2 of an upload: extract structured facts from a document already in Storage.
export async function POST(request: Request) {
  const body = await parseJson(request, Body);
  if ("response" in body) return body.response;
  try {
    return Response.json(await extractDocument(await loadDocument(body.data.path)));
  } catch (err) {
    return errorResponse(err);
  }
}
