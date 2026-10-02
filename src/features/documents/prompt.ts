// Prompts for the page index: a model looks at each page of a case document and says what it is.
// This is an index, not a transcription: enough for a lawyer to know what is on a page and for the
// brief to cite it. What the model returns is PartReading in schema.ts.

export const SYSTEM =
  "You index the pages of documents in a personal injury law firm's case file, so that a lawyer can find what matters without reading every page. " +
  "Report only what is printed or written on the page in front of you. Never guess, never fill a gap from general knowledge, and never carry a fact from one page to another.";

/**
 * Instructions for one part of a document. `pageCount` is the number of pages in the file sent;
 * `client` is the client's name from the case file, when known, so their photo ID can be told apart.
 */
export function instructions(pageCount: number, client?: string) {
  return [
    `This file holds ${pageCount} consecutive ${pageCount === 1 ? "page" : "pages"} of one document from the case file. It may be a scan, and it may start or end in the middle of a record.`,
    ...(client ? [`The firm's client is ${client}.`] : []),
    "",
    `A band has been added above each page that reads "PAGE n OF ${pageCount}". That n is the page's number here. Every other page number, fax header, filing stamp or Bates stamp printed on a page is to be ignored.`,
    `Return one entry for every page, in order: ${pageCount} ${pageCount === 1 ? "entry" : "entries"}, with "page" running from 1 to ${pageCount}. Before writing an entry, look at the band on the page you are describing, so that each fact is filed under the page it is printed on.`,
    "",
    "For each page:",
    "- kind: what the page is, in two to four lowercase words, for example: daily treatment note, initial evaluation, MRI report, x-ray report, operative report, emergency room record, discharge summary, prescription, billing ledger, itemized bill, insurance form, lien notice, pleading, discovery response, expert report, letter, authorization, photo ID, fax cover, blank.",
    "- provider: who the page is from, as named on it (letterhead, header or signature): the medical office, hospital, doctor, law office, court or insurer. An empty string when the page names none.",
    "- date: the date the page is about, as YYYY-MM-DD: the date of service or visit for a medical page, the statement date for a bill, the date a letter, affidavit or filing was written or signed (not the date of the events it tells of). Not a date of birth, a print date, a fax date or a court's filing stamp. An empty string when the page has none.",
    "- facts: at most four, and only what a personal injury lawyer would need from this page: a diagnosis, an imaging or examination finding, a procedure or surgery, an injection or medication, a work restriction or disability rating, a reported pain level or loss of function, an earlier injury, accident or condition of the same body part, a missed or cancelled visit, a discharge or referral, an amount billed, paid, adjusted or still owed, a lien; on a legal page, what is claimed, admitted, denied, demanded or ordered, and any deadline. Give specifics: which body part and side, which spinal level, which amount.",
    "  - text: the fact in one short sentence. Keep an abbreviation as the page has it unless you are sure what it stands for, and keep left and right exactly as written.",
    "  - quote: one unbroken run of three to twelve words copied exactly from the page that supports the fact, with the page's own spelling and punctuation. Never join words from separate places. An empty string when you cannot read the words exactly.",
    "- Give no facts for a fax cover, a blank page, or a form with nothing specific to this case on it.",
    "- When a page continues the page before it, still describe it from what is on it.",
    "- When handwriting or a poor scan cannot be read, say so in kind (for example: illegible handwritten note) and give only the facts you can read.",
    "",
    "clientPhotoPage: the position in this file of a page that shows a government photo ID (driver's license, state ID card or passport) with a photograph of the client on it; 0 when there is none.",
  ].join("\n");
}
