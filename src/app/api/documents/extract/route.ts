import { extractDocument } from "@/features/documents/server";
import { badRequest, errorResponse } from "@/server/http";
import { fileFromUpload } from "@/server/llm";

export const maxDuration = 60;

// multipart/form-data: `file` (PDF, image or text) and optional `instructions`.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return badRequest("Send multipart/form-data with a `file` field.");

  const instructions = form?.get("instructions");
  try {
    const result = await extractDocument(
      await fileFromUpload(file),
      typeof instructions === "string" ? instructions : undefined,
    );
    return Response.json({ fileName: file.name, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}
