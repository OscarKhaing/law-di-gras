import { z } from "zod";

// The page index: what a model read on each page of a case document. Browser-safe.

/** One page of a document, as indexed. `page` is the page of the whole document, first page = 1. */
export const PageNote = z.object({
  page: z.number().describe("Position of the page in this file, first page = 1"),
  kind: z
    .string()
    .describe("What the page is: daily treatment note, MRI report, billing ledger, operative report, pleading, letter, photo ID, fax cover, blank"),
  provider: z.string().describe("Provider or author named on the page; empty string when none"),
  date: z.string().describe("Date of service or of the page, YYYY-MM-DD; empty string when none"),
  facts: z
    .array(z.object({ text: z.string(), quote: z.string().describe("A few words copied exactly from the page; empty string when illegible") }))
    .describe("Up to four facts a personal injury lawyer needs from this page: diagnosis, finding, procedure, restriction, prior condition, missed visit, amount billed. None for covers and blanks"),
});
export type PageNote = z.infer<typeof PageNote>;

/** What the model returns for one part (at most 25 pages) of a document. */
export const PartReading = z.object({
  pages: z.array(PageNote),
  clientPhotoPage: z.number().describe("Page showing a photo ID of the client; 0 when none"),
});
export type PartReading = z.infer<typeof PartReading>;

/**
 * One part as stored in `document_digests.digest`: the reading with its pages renumbered to pages
 * of the whole document, plus what the code found out about the part itself.
 */
export type PartDigest = PartReading & {
  /** Last page of the part; the first is the row's `from_page`. */
  toPage: number;
  /** Whether these pages have a text layer, so a quote can be highlighted in them. */
  hasText: boolean;
  /** Where in Storage the photograph cut from `clientPhotoPage` is kept; null when there is none. */
  photoPath: string | null;
};

/** What the source panel needs to show one page of a document. */
export type DocumentSource = {
  name: string;
  /** A signed URL the browser can open, and the page to open it at (parts are separate files). */
  url: string;
  viewerPage: number;
  /** False for a scan: the page opens but a quote cannot be highlighted in it. */
  hasText: boolean;
  /** What was read on that page, shown beside it. Null when the document has not been indexed. */
  note: PageNote | null;
};
