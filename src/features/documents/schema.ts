import { z } from "zod";

// What gets extracted from a document. FIELDS is the main thing to change for a new use case:
// the prompt, the model's output format and the review screen all follow this list.

export type FieldSpec = {
  label: string;
  description: string;
  /** True when a document can hold several of these; the model returns one entry per item. */
  list?: boolean;
};

export const FIELDS: FieldSpec[] = [
  { label: "Client", description: "Full name of the injured person (the patient or claimant)" },
  { label: "Date of incident", description: "Date of the event that caused the injury, as YYYY-MM-DD" },
  { label: "Incident", description: "One sentence on what happened and how the person was hurt" },
  { label: "Diagnosis", description: "Each injury or diagnosis attributed to the incident", list: true },
  {
    label: "Treatment",
    description: "Each visit, test or procedure, as: date (YYYY-MM-DD), what was done, provider",
    list: true,
  },
  { label: "Charge", description: "Each billed amount, as: amount, what it was for", list: true },
  { label: "Total charges", description: "The total amount billed, as the document states it" },
  {
    label: "Gap in treatment",
    description: "Each period of 30 days or more with no treatment, as: start date to end date",
    list: true,
  },
  { label: "Prior conditions", description: "Earlier injuries or conditions affecting the same body parts" },
  { label: "Work impact", description: "Time off work or work restrictions caused by the injury" },
];

export const ExtractedField = z.object({
  label: z.string().describe("Label of the requested field this entry answers, exactly as quoted in the list"),
  value: z
    .string()
    .describe("The value as the document states it; an empty string when the document does not contain it"),
  evidence: z
    .string()
    .nullable()
    .describe("A short verbatim quote from the document that supports the value; null when there is none"),
  page: z
    .number()
    .nullable()
    .describe(
      "Position in the file of the page the quote is on, counting the first page as 1; not a number printed on the page; null when unknown",
    ),
  concern: z
    .string()
    .nullable()
    .describe("One sentence saying why a person should double-check this entry; null when there is no reason"),
});

export const DocumentExtraction = z.object({
  documentType: z
    .string()
    .describe("e.g. police report, medical record, medical bill, intake form, correspondence"),
  summary: z.string().describe("Two or three sentences a case manager could read at a glance"),
  fields: z.array(ExtractedField),
});

export type ExtractedField = z.infer<typeof ExtractedField>;
export type DocumentExtraction = z.infer<typeof DocumentExtraction>;

/**
 * A field a person must look at before the document can be approved: the model raised a concern,
 * or gave a value with no quote to back it. A field with an empty value was simply not found.
 */
export function needsReview(field: ExtractedField) {
  return field.value !== "" && (field.concern !== null || field.evidence === null);
}
