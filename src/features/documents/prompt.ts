import { FIELDS } from "./schema";

// Prompts for document extraction. What to extract is the FIELDS list in schema.ts; this file
// controls how the model is told to go about it.

export const SYSTEM =
  "You extract facts from documents handled by a personal injury law firm so that a case manager can verify them against the source. " +
  "Report only what the document states or what follows directly from it. Never guess or fill a gap from general knowledge.";

export function buildInstructions() {
  return [
    "Extract these fields from the document. Each line gives a label, then what to extract for it:",
    "",
    ...FIELDS.map((f) => `- "${f.label}"${f.list ? " (one entry per item)" : ""}: ${f.description}`),
    "",
    "Rules:",
    '- Return the fields in the order above. For a field marked "one entry per item", return a separate entry for every item, in document order.',
    "- evidence: a short quote copied word for word from the document that supports the value.",
    "- page: the position in the file of the page the quote is on, counting the first page as 1. Ignore page numbers and stamps printed on the pages.",
    "- If the document does not contain a field, return one entry for it with an empty value and null evidence, page and concern.",
    "- concern: one sentence when a person should double-check the entry, for example when the document is ambiguous, two places disagree, a total does not equal the sum of its line items, or the text is hard to read. Otherwise null.",
  ].join("\n");
}
