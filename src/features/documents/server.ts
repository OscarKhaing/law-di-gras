import { extract, type LlmFile } from "@/server/llm";
import { supabase } from "@/server/supabase";
import { buildInstructions, SYSTEM } from "./prompt";
import { DocumentExtraction, FIELDS, type ExtractedField } from "./schema";

// Private Supabase Storage bucket holding uploaded source documents (scripts/create-bucket.ts).
export const BUCKET = "documents";

/**
 * Whether `path` may be read from the bucket. Every segment must start with a letter, digit,
 * underscore or dash, which rules out "..", "?" and "%": the Storage client builds its URL from
 * the path as given, so "../" would otherwise reach other buckets and APIs with our secret key.
 */
export function isDocumentPath(path: string) {
  return /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/.test(path);
}

/**
 * A one-time URL the browser can PUT a file to. Uploads go straight to Storage because
 * Vercel rejects request bodies over 4.5 MB.
 */
export async function createUploadUrl(fileName: string) {
  const safeName = fileName.replace(/[^\w.-]+/g, "_").slice(-100).replace(/^\.+/, "") || "file";
  const path = `uploads/${crypto.randomUUID()}/${safeName}`;
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  return { path: data.path, uploadUrl: data.signedUrl };
}

/** Read an uploaded document back from Storage. Call only with a path that passes isDocumentPath. */
export async function loadDocument(path: string): Promise<LlmFile> {
  const { data, error } = await supabase().storage.from(BUCKET).download(path);
  if (error) throw error;
  return {
    name: path.slice(path.lastIndexOf("/") + 1),
    mediaType: data.type.split(";")[0], // drop any "; charset=..." parameter
    bytes: Buffer.from(await data.arrayBuffer()),
  };
}

/**
 * Extract the fields listed in schema.ts from one document. Called by the API route and by scripts.
 * Pass `signal` to stop the model call early, as the route does to stay inside its time limit.
 */
export async function extractDocument(file: LlmFile, signal?: AbortSignal) {
  const result = await extract(DocumentExtraction, {
    system: SYSTEM,
    prompt: buildInstructions(),
    files: [file],
    signal,
  });
  return { ...result, data: { ...result.data, fields: tidy(result.data.fields) } };
}

/** The requested label an entry answers, or null. The model sometimes repeats the description after it. */
function requestedLabel(said: string) {
  const text = said.trim().replace(/^["'“]+/, "").toLowerCase();
  const match = FIELDS.find(({ label }) => {
    const wanted = label.toLowerCase();
    return text === wanted || [":", " (", '"', "”"].some((next) => text.startsWith(wanted + next));
  });
  return match?.label ?? null;
}

/**
 * Turn the model's entries into what the review screen shows: the requested fields in FIELDS
 * order, each with the entries found for it, or one blank entry when the document has none.
 * Nothing the model reported is dropped: an entry under a label we did not ask for is kept and flagged.
 */
function tidy(entries: ExtractedField[]): ExtractedField[] {
  const found = new Map<string, ExtractedField[]>(FIELDS.map((spec) => [spec.label, []]));
  for (const entry of entries) {
    const value = entry.value.trim();
    const evidence = entry.evidence?.trim() || null;
    let concern = entry.concern?.trim() || null;
    if (!value && !concern) continue; // not found, and nothing to say about it

    let label = requestedLabel(entry.label);
    if (!label) {
      label = entry.label.trim();
      concern ??= "This is not one of the requested fields.";
    }
    if (!found.has(label)) found.set(label, []);
    found.get(label)!.push({
      label,
      value,
      evidence,
      page: evidence && entry.page != null && entry.page >= 1 ? Math.round(entry.page) : null,
      concern,
    });
  }
  return [...found].flatMap(([label, list]) =>
    list.length ? list : [{ label, value: "", evidence: null, page: null, concern: null }],
  );
}
