import { extract, type LlmFile } from "@/server/llm";
import { DEFAULT_INSTRUCTIONS, SYSTEM } from "./prompt";
import { DocumentSummary } from "./schema";

/** Extract the key facts from one document. Called by the API route and by scripts. */
export function extractDocument(file: LlmFile, instructions?: string) {
  return extract(DocumentSummary, {
    system: SYSTEM,
    prompt: instructions?.trim() || DEFAULT_INSTRUCTIONS,
    files: [file],
  });
}
