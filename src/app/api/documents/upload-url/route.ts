import { z } from "zod";
import { createUploadUrl } from "@/features/documents/server";
import { errorResponse, parseJson } from "@/server/http";

const Body = z.object({ fileName: z.string().min(1) });

// Step 1 of an upload: returns { path, uploadUrl }. The browser PUTs the file to uploadUrl,
// then sends `path` to /api/documents/extract.
export async function POST(request: Request) {
  const body = await parseJson(request, Body);
  if ("response" in body) return body.response;
  try {
    return Response.json(await createUploadUrl(body.data.fileName));
  } catch (err) {
    return errorResponse(err);
  }
}
