import { z } from "zod";
import { extractDocument, isDocumentPath, loadDocument } from "@/features/documents/server";
import { errorResponse, parseJson } from "@/server/http";

export const maxDuration = 300;

// Stop the model call before Vercel stops the function, so the caller gets our error, not a bare 504.
const MODEL_DEADLINE_MS = 270_000;

// `path` is an object in the documents bucket, normally one returned by /api/documents/upload-url.
const Body = z.object({ path: z.string().refine(isDocumentPath, "Not a document path.") });

// Step 2 of an upload: extract structured facts from a document already in Storage.
export async function POST(request: Request) {
  const body = await parseJson(request, Body);
  if ("response" in body) return body.response;
  try {
    const file = await loadDocument(body.data.path);
    return Response.json(await extractDocument(file, AbortSignal.timeout(MODEL_DEADLINE_MS)));
  } catch (err) {
    return errorResponse(err);
  }
}
