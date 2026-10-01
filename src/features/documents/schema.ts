import { z } from "zod";

// What the model returns for one document. The same type flows to the API response and the UI,
// so changing a field here is the only edit needed to change what gets extracted.
export const DocumentSummary = z.object({
  documentType: z
    .string()
    .describe("e.g. police report, medical record, medical bill, intake form, correspondence"),
  summary: z.string().describe("Two or three sentences a case manager could read at a glance"),
  people: z.array(
    z.object({
      name: z.string(),
      role: z.string().describe("e.g. client, defendant, provider, adjuster, witness"),
    }),
  ),
  dates: z.array(
    z.object({
      date: z.string().describe("ISO 8601 date when it can be determined, otherwise as written"),
      event: z.string(),
      page: z.number().nullable().describe("1-indexed page the fact appears on, null if unknown"),
    }),
  ),
  amounts: z.array(
    z.object({
      label: z.string(),
      amountUsd: z.number(),
      page: z.number().nullable().describe("1-indexed page the fact appears on, null if unknown"),
    }),
  ),
  flags: z
    .array(z.string())
    .describe("Missing information, inconsistencies, or anything a human should check"),
});

export type DocumentSummary = z.infer<typeof DocumentSummary>;
