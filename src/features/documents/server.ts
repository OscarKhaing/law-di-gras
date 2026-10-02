import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts } from "pdf-lib";
import type { IndexUsage } from "@/features/brief/schema";
import type { Entry } from "@/features/cases/schema";
import { getCaseFile } from "@/features/cases/server";
import { extract } from "@/server/llm";
import { supabase } from "@/server/supabase";
import { instructions, SYSTEM } from "./prompt";
import { PartReading, type DocumentSource, type PageNote, type PartDigest } from "./schema";

// The page index of a case's documents. A document copied from Clio into Storage is cut into parts
// of at most 25 pages; each part is kept as its own small file (so the browser's viewer opens it
// quickly) and read once by a model, which says what is on each page. One row of
// `document_digests` per part, so indexing a long scan can stop and resume.

// Private Supabase Storage bucket holding the case's documents (scripts/create-bucket.ts).
export const BUCKET = "documents";

/**
 * Whether `path` may be read from the bucket. Every segment must start with a letter, digit,
 * underscore or dash, which rules out "..", "?" and "%": the Storage client builds its URL from
 * the path as given, so "../" would otherwise reach other buckets and APIs with our secret key.
 */
export function isDocumentPath(path: string) {
  return /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/.test(path);
}

const INDEX_MODEL = "claude-haiku-4-5";
const PART_PAGES = 25;
// A request may be 32 MB and the file goes in base64, so a part sent to the model stays under this.
const PART_BYTES = 22_000_000;
const LINK_SECONDS = 3600;

// ---- Storage ----

function checked(path: string) {
  if (!isDocumentPath(path)) throw new Error(`"${path}" is not a path in the documents bucket.`);
  return path;
}

async function download(path: string) {
  const { data, error } = await supabase().storage.from(BUCKET).download(checked(path));
  if (error) throw new Error(`Could not read ${path} from Storage: ${error.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

async function upload(path: string, bytes: Uint8Array | string, contentType: string) {
  const { error } = await supabase().storage.from(BUCKET).upload(checked(path), bytes, { contentType, upsert: true });
  if (error) throw new Error(`Could not store ${path}: ${error.message}`);
}

async function signedUrl(path: string) {
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUrl(checked(path), LINK_SECONDS);
  if (error) throw new Error(`Could not open ${path}: ${error.message}`);
  return data.signedUrl;
}

// ---- Splitting ----

/** Pages `from` to `to` of a document (first page = 1) as a PDF of their own. */
export type Part = { from: number; to: number; hasText: boolean; bytes: Uint8Array };

/** Whether any of these pages uses a font, which a page that is only a scanned image does not. */
function hasTextLayer(pdf: PDFDocument, firstIndex: number, lastIndex: number) {
  for (let index = firstIndex; index <= lastIndex; index++) {
    const fonts = pdf.getPage(index).node.Resources()?.lookup(PDFName.of("Font"));
    if (fonts instanceof PDFDict && fonts.keys().length > 0) return true;
  }
  return false;
}

/**
 * Cut a PDF into parts of at most 25 pages. A short document is one part: the file as it is.
 * A part too large to send to the model in one request is halved until it fits.
 */
export async function splitPdf(bytes: Uint8Array): Promise<{ pages: number; parts: Part[] }> {
  const whole = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const pages = whole.getPageCount();
  if (pages <= PART_PAGES && bytes.length <= PART_BYTES) {
    return { pages, parts: [{ from: 1, to: pages, hasText: hasTextLayer(whole, 0, pages - 1), bytes }] };
  }
  const parts: Part[] = [];
  const cut = async (from: number, to: number) => {
    const part = await PDFDocument.create();
    const indices = Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i);
    for (const page of await part.copyPages(whole, indices)) part.addPage(page);
    const saved = await part.save();
    if (saved.length > PART_BYTES && to > from) {
      const middle = Math.floor((from + to) / 2);
      await cut(from, middle);
      await cut(middle + 1, to);
      return;
    }
    parts.push({ from, to, hasText: hasTextLayer(whole, from - 1, to - 1), bytes: saved });
  };
  for (let from = 1; from <= pages; from += PART_PAGES) await cut(from, Math.min(from + PART_PAGES - 1, pages));
  return { pages, parts };
}

/** Which parts a document was cut into and where each is kept. Stored beside the parts. */
type Manifest = { pages: number; parts: { from: number; to: number; hasText: boolean; path: string }[] };

// A document version never changes, so neither does its manifest.
const manifests = new Map<string, Manifest>();

/** The folder beside a document that holds its parts: the document's path without its extension. */
function folderOf(storagePath: string) {
  return storagePath.replace(/\.[A-Za-z0-9]+$/, "");
}

/**
 * The parts of a document in Storage, cutting and storing them the first time. The original is
 * downloaded only then; afterwards the manifest alone says where every part is. `held` has the
 * bytes of parts cut in this call, so the caller need not download them again.
 */
async function partsOf(storagePath: string): Promise<{ manifest: Manifest; held: Map<number, Uint8Array> }> {
  const held = new Map<number, Uint8Array>();
  const known = manifests.get(storagePath);
  if (known) return { manifest: known, held };

  const manifestPath = `${folderOf(storagePath)}/parts.json`;
  const stored = await supabase().storage.from(BUCKET).download(checked(manifestPath));
  if (!stored.error) {
    const manifest = JSON.parse(await stored.data.text()) as Manifest;
    manifests.set(storagePath, manifest);
    return { manifest, held };
  }

  const { pages, parts } = await splitPdf(await download(storagePath));
  const single = parts.length === 1 && parts[0].from === 1 && parts[0].to === pages;
  const manifest: Manifest = {
    pages,
    parts: parts.map(({ from, to, hasText }) => ({
      from,
      to,
      hasText,
      // A document that is one part is shown from the original file.
      path: single ? storagePath : `${folderOf(storagePath)}/p${pad(from)}-${pad(to)}.pdf`,
    })),
  };
  for (const part of parts) held.set(part.from, part.bytes);
  if (!single) {
    await Promise.all(parts.map((part, index) => upload(manifest.parts[index].path, part.bytes, "application/pdf")));
  }
  // Written last: a manifest in Storage means every part it names is there.
  await upload(manifestPath, JSON.stringify(manifest), "application/json");
  manifests.set(storagePath, manifest);
  return { manifest, held };
}

const pad = (page: number) => String(page).padStart(4, "0");

// ---- Reading ----

// At most four model calls at a time, across every document being indexed.
const MAX_READING = 4;
let reading = 0;
const waiting: (() => void)[] = [];

async function limited<T>(job: () => Promise<T>): Promise<T> {
  if (reading >= MAX_READING) await new Promise<void>((go) => waiting.push(go));
  else reading++;
  try {
    return await job();
  } finally {
    // Hand the slot straight to the next in line, if there is one.
    const next = waiting.shift();
    if (next) next();
    else reading--;
  }
}

const isoDate = (text: string) => (/^\d{4}-\d{2}-\d{2}$/.test(text.trim()) ? text.trim() : "");

const BAND = 30;

/**
 * A copy of a part with "PAGE n OF N" printed in a band added above each page. Without it the
 * model loses count in a long run of similar pages and puts a fact on the page before or after.
 * Only the model sees this copy; the stored part is the pages as they are.
 */
async function numbered(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const count = pdf.getPageCount();
  pdf.getPages().forEach((page, index) => {
    const { x, y, width, height } = page.getMediaBox();
    page.setMediaBox(x, y, width, height + BAND);
    page.setCropBox(x, y, width, height + BAND);
    page.drawText(`PAGE ${index + 1} OF ${count}`, { x: x + 12, y: y + height + 8, size: 16, font });
  });
  return pdf.save();
}

/**
 * Have the model index one part. It numbers pages from 1 within the part; what is returned has
 * pages of the whole document. Entries for pages the part does not have are dropped, and a page
 * the model skipped is simply absent.
 */
export async function readPart(name: string, part: Part, client?: string) {
  const count = part.to - part.from + 1;
  const result = await limited(async () => {
    const started = Date.now();
    const reply = await extract(PartReading, {
      system: SYSTEM,
      prompt: instructions(count, client),
      files: [{ name, mediaType: "application/pdf", bytes: Buffer.from(await numbered(part.bytes)) }],
      model: INDEX_MODEL,
    });
    return { ...reply, seconds: Math.round((Date.now() - started) / 1000) };
  });

  const seen = new Set<number>();
  const pages: PageNote[] = [];
  for (const note of [...result.data.pages].sort((a, b) => a.page - b.page)) {
    const page = Math.round(note.page);
    if (page < 1 || page > count || seen.has(page)) continue;
    seen.add(page);
    pages.push({
      page: page + part.from - 1,
      kind: note.kind.trim(),
      provider: note.provider.trim(),
      date: isoDate(note.date),
      facts: note.facts
        .map((fact) => ({ text: fact.text.trim(), quote: fact.quote.trim() }))
        .filter((fact) => fact.text !== "")
        .slice(0, 4),
    });
  }
  const photo = Math.round(result.data.clientPhotoPage);
  const reading: PartReading = { pages, clientPhotoPage: photo >= 1 && photo <= count ? photo + part.from - 1 : 0 };
  return { reading, model: result.model, usage: result.usage, seconds: result.seconds };
}

/**
 * The photograph on one page of a PDF (first page = 1): the largest JPEG embedded in the page,
 * taken out as it is. Null when the page has no JPEG of its own.
 */
export async function photoOnPage(bytes: Uint8Array, page: number): Promise<Uint8Array | null> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  if (page < 1 || page > pdf.getPageCount()) return null;
  const images = pdf.getPage(page - 1).node.Resources()?.lookup(PDFName.of("XObject"));
  if (!(images instanceof PDFDict)) return null;
  let largest: Uint8Array | null = null;
  for (const [, value] of images.entries()) {
    const stream = pdf.context.lookup(value);
    if (!(stream instanceof PDFRawStream)) continue;
    if (stream.dict.lookup(PDFName.of("Subtype")) !== PDFName.of("Image")) continue;
    // Only a stream whose one filter is DCTDecode holds a JPEG file as it stands.
    let filter = stream.dict.lookup(PDFName.of("Filter"));
    if (filter instanceof PDFArray && filter.size() === 1) filter = filter.lookup(0);
    if (filter !== PDFName.of("DCTDecode")) continue;
    if (!largest || stream.contents.length > largest.length) largest = stream.contents;
  }
  return largest;
}

// ---- The case's documents ----

type CaseDocument = { entry: Entry; client: string; documentId: number; version: string; storagePath: string; isPdf: boolean };

async function caseDocument(matterId: number, ref: string): Promise<CaseDocument> {
  const file = await getCaseFile(matterId);
  if (!file) throw new Error(`Case ${matterId} has not been read from Clio yet.`);
  const entry = file.entries.find((candidate) => candidate.kind === "document" && candidate.ref === ref);
  if (!entry) throw new Error(`Case ${matterId} has no document ${ref}.`);
  const storagePath = String(entry.facts.storagePath ?? "");
  if (!storagePath || !isDocumentPath(storagePath)) throw new Error(`${ref} has not been copied from Clio yet.`);
  return {
    entry,
    client: file.client.name,
    documentId: Number(entry.clioId),
    version: String(entry.facts.versionId),
    storagePath,
    isPdf: entry.facts.contentType === "application/pdf" || /\.pdf$/i.test(storagePath),
  };
}

/** What happened to one part while a document was indexed; `read` is null when it was already stored. */
export type PartReport = {
  ref: string;
  from: number;
  to: number;
  read: { seconds: number; inputTokens: number; outputTokens: number } | null;
};

/**
 * Index one document of a case: split it into parts, have a model read each, store the page notes.
 * Parts that already have a row are skipped, so a run that stopped part-way picks up where it left off.
 */
export async function indexDocument(
  matterId: number,
  ref: string,
  onPart?: (report: PartReport) => void,
): Promise<{ ref: string; pages: number }> {
  const document = await caseDocument(matterId, ref);
  if (!document.isPdf) throw new Error(`${ref} is not a PDF (${document.entry.facts.contentType}); only PDFs are indexed.`);
  const { manifest, held } = await partsOf(document.storagePath);

  const stored = await supabase()
    .from("document_digests")
    .select("from_page")
    .eq("document_id", document.documentId)
    .eq("version", document.version);
  if (stored.error) throw stored.error;
  const done = new Set(stored.data.map((row) => row.from_page as number));

  const results = await Promise.allSettled(
    manifest.parts.map(async (part) => {
      if (done.has(part.from)) return onPart?.({ ref, from: part.from, to: part.to, read: null });
      const bytes = held.get(part.from) ?? (await download(part.path));
      const { reading, model, usage, seconds } = await readPart(document.entry.title, { ...part, bytes }, document.client);

      let photoPath: string | null = null;
      if (reading.clientPhotoPage) {
        const jpeg = await photoOnPage(bytes, reading.clientPhotoPage - part.from + 1);
        if (jpeg) {
          photoPath = `${folderOf(document.storagePath)}/photo-p${pad(reading.clientPhotoPage)}.jpg`;
          await upload(photoPath, jpeg, "image/jpeg");
        }
      }

      const digest: PartDigest = { ...reading, toPage: part.to, hasText: part.hasText, photoPath };
      const { error } = await supabase().from("document_digests").upsert({
        document_id: document.documentId,
        version: document.version,
        from_page: part.from,
        digest,
        model,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
      });
      if (error) throw error;
      onPart?.({ ref, from: part.from, to: part.to, read: { seconds, ...usage } });
    }),
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
  return { ref, pages: manifest.pages };
}

type DigestRow = { entry: Entry; fromPage: number; digest: PartDigest; model: string; inputTokens: number; outputTokens: number };

/** Every stored part of the case's documents as they are now (an older version's rows are left out). */
async function caseDigests(matterId: number): Promise<DigestRow[]> {
  const file = await getCaseFile(matterId);
  const documents = (file?.entries ?? []).filter((entry) => entry.kind === "document");
  if (documents.length === 0) return [];
  const { data, error } = await supabase()
    .from("document_digests")
    .select("document_id, version, from_page, digest, model, input_tokens, output_tokens")
    .in("document_id", documents.map((entry) => Number(entry.clioId)))
    .order("from_page");
  if (error) throw error;
  const current = new Map(documents.map((entry) => [`${entry.clioId}:${entry.facts.versionId}`, entry]));
  return data.flatMap((row) => {
    const entry = current.get(`${row.document_id}:${row.version}`);
    if (!entry) return [];
    return [{
      entry,
      fromPage: row.from_page as number,
      digest: row.digest as PartDigest,
      model: row.model as string,
      inputTokens: row.input_tokens as number,
      outputTokens: row.output_tokens as number,
    }];
  });
}

/** Every indexed page of a case's documents, by document ref. */
export async function getPageNotes(matterId: number): Promise<Record<string, PageNote[]>> {
  const notes: Record<string, PageNote[]> = {};
  for (const { entry, digest } of await caseDigests(matterId)) (notes[entry.ref] ??= []).push(...digest.pages);
  for (const pages of Object.values(notes)) pages.sort((a, b) => a.page - b.page);
  return notes;
}

/** What the source panel needs to show `page` of a document. */
export async function documentSource(matterId: number, ref: string, page: number): Promise<DocumentSource> {
  const document = await caseDocument(matterId, ref);
  const name = document.entry.title;
  if (!document.isPdf) {
    return { name, url: await signedUrl(document.storagePath), viewerPage: 1, hasText: false, note: null };
  }
  const { manifest } = await partsOf(document.storagePath);
  const part = manifest.parts.find((candidate) => page >= candidate.from && page <= candidate.to);
  if (!part) throw new Error(`${ref} has ${manifest.pages} pages; there is no page ${page}.`);
  const [url, row] = await Promise.all([
    signedUrl(part.path),
    supabase()
      .from("document_digests")
      .select("digest")
      .eq("document_id", document.documentId)
      .eq("version", document.version)
      .eq("from_page", part.from)
      .maybeSingle(),
  ]);
  if (row.error) throw row.error;
  const digest = row.data?.digest as PartDigest | undefined;
  return {
    name,
    url,
    viewerPage: page - part.from + 1,
    hasText: part.hasText,
    note: digest?.pages.find((note) => note.page === page) ?? null,
  };
}

/** A signed URL for the client's photograph, taken from their photo ID; null when there is none. */
export async function clientPhotoUrl(matterId: number): Promise<string | null> {
  const found = (await caseDigests(matterId))
    .filter((row) => row.digest.photoPath && isDocumentPath(row.digest.photoPath))
    // An ID filed on its own is a surer picture than a page inside a long record.
    .sort((a, b) => Number(a.entry.facts.bytes) - Number(b.entry.facts.bytes));
  return found.length ? signedUrl(found[0].digest.photoPath!) : null;
}

/** What indexing a case's documents cost in total; null when none has been indexed. */
export async function indexUsage(matterId: number): Promise<IndexUsage | null> {
  const rows = await caseDigests(matterId);
  if (rows.length === 0) return null;
  return {
    model: rows[0].model,
    documents: new Set(rows.map((row) => row.entry.ref)).size,
    pages: rows.reduce((sum, row) => sum + row.digest.toPage - row.fromPage + 1, 0),
    inputTokens: rows.reduce((sum, row) => sum + row.inputTokens, 0),
    outputTokens: rows.reduce((sum, row) => sum + row.outputTokens, 0),
  };
}
