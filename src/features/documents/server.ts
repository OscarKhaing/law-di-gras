import { extract, type LlmFile } from "@/server/llm";
import { supabase } from "@/server/supabase";
import { buildInstructions, SYSTEM } from "./prompt";
import { DocumentExtraction, FIELDS, type ExtractedField } from "./schema";

// Private Supabase Storage bucket holding uploaded source documents.
const BUCKET = "documents";

/**
 * A one-time URL the browser can PUT a file to. Uploads go straight to Storage because
 * Vercel rejects request bodies over 4.5 MB.
 */
export async function createUploadUrl(fileName: string) {
  const safeName = fileName.replace(/[^\w.-]+/g, "_").slice(-100);
  const path = `uploads/${crypto.randomUUID()}/${safeName}`;
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  return { path: data.path, uploadUrl: data.signedUrl };
}

/** Read an uploaded document back from Storage. */
export async function loadDocument(path: string): Promise<LlmFile> {
  const { data, error } = await supabase().storage.from(BUCKET).download(path);
  if (error) throw error;
  return {
    name: path.slice(path.lastIndexOf("/") + 1),
    mediaType: data.type,
    bytes: Buffer.from(await data.arrayBuffer()),
  };
}

/** Extract the fields listed in schema.ts from one document. Called by the API route and by scripts. */
export async function extractDocument(file: LlmFile) {
  const result = await extract(DocumentExtraction, {
    system: SYSTEM,
    prompt: buildInstructions(),
    files: [file],
  });
  return { ...result, data: { ...result.data, fields: tidy(result.data.fields) } };
}

// Longest first, so a label is never mistaken for a shorter one it starts with.
const LABELS = FIELDS.map((spec) => spec.label).sort((a, b) => b.length - a.length);

/**
 * Turn the model's entries into what the review screen shows: the requested fields in FIELDS
 * order, each with the entries found for it, or one blank entry when the document has none.
 */
function tidy(entries: ExtractedField[]): ExtractedField[] {
  const found = new Map<string, ExtractedField[]>(FIELDS.map((spec) => [spec.label, []]));
  for (const entry of entries) {
    // The model sometimes repeats the description after the label, so match on how it starts.
    const said = entry.label.trim().replace(/^["'“]+/, "").toLowerCase();
    const label = LABELS.find((candidate) => said.startsWith(candidate.toLowerCase()));
    const value = entry.value.trim();
    if (!label || !value) continue;
    const evidence = entry.evidence?.trim() || null;
    found.get(label)!.push({
      label,
      value,
      evidence,
      page: evidence && entry.page != null && entry.page >= 1 ? Math.round(entry.page) : null,
      concern: entry.concern?.trim() || null,
    });
  }
  return [...found].flatMap(([label, list]) =>
    list.length ? list : [{ label, value: "", evidence: null, page: null, concern: null }],
  );
}
