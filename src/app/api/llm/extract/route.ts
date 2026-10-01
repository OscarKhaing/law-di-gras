import { badRequest } from "@/lib/api";
import { errorResponse, extract } from "@/lib/llm";
import { DocumentSummary } from "@/lib/schemas";

export const maxDuration = 60;

const SYSTEM =
  "You extract structured facts from documents handled by a personal injury law firm. " +
  "Only report what the document states. If something is absent or unclear, leave it out and add a flag instead of guessing.";

// multipart/form-data: `file` (PDF, image or text) and optional `instructions`.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return badRequest("Send multipart/form-data with a `file` field.");

  const instructions = form?.get("instructions");
  try {
    const result = await extract(DocumentSummary, {
      system: SYSTEM,
      prompt:
        typeof instructions === "string" && instructions.trim()
          ? instructions
          : "Extract the key facts from this document.",
      files: [
        {
          name: file.name,
          mediaType: file.type || "text/plain",
          bytes: Buffer.from(await file.arrayBuffer()),
        },
      ],
    });
    return Response.json({ fileName: file.name, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}
