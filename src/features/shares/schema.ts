// An update the firm shares with one treating provider. Browser-safe.
// The firm side works on an UpdateDraft; publishing freezes the switched-on lines into a
// ProviderUpdate, which is the only thing the provider's page can ever read.

import { z } from "zod";
import { Evidence } from "@/features/cases/schema";

export const SECTIONS = ["status", "coverage", "needs", "attendance", "on file", "other treatment", "movement"] as const;

/** What the model drafts for the attorney to check. */
export const UpdateDraft = z.object({
  lines: z.array(
    z.object({
      section: z.string().describe(`One of: ${SECTIONS.join(", ")}`),
      text: z
        .string()
        .describe("One plain sentence for the provider's office. Facts only: no view on liability, value, credibility or tactics"),
      yourCall: z
        .boolean()
        .describe("True when an attorney should decide before this leaves the firm: amounts, attendance, other providers' treatment, timing"),
      evidence: Evidence,
    }),
  ),
});
export type UpdateDraft = z.infer<typeof UpdateDraft>;

/** A drafted line as the attorney edits it: `share` is the switch, and starts off for `yourCall` lines. */
export type DraftLine = UpdateDraft["lines"][number] & { id: string; share: boolean };

/** `shares.payload`: frozen at publish. No refs, no Clio ids, nothing the attorney switched off. */
export type ProviderUpdate = {
  firm: string;
  /** Who at the firm to call or write to. */
  contactLine: string;
  patient: string;
  provider: string;
  stage: string;
  stages: string[];
  lines: { id: string; section: string; text: string }[];
  publishedAt: string;
  expiresAt: string;
};

/** What the firm sees about an update it shared. */
export type ShareStatus = {
  id: string;
  contactRef: string;
  contactName: string;
  publishedAt: string;
  expiresAt: string;
  revoked: boolean;
  opens: number;
  lastOpenedAt: string | null;
  /** What the provider wrote back. It lives in our database; nothing is written to Clio. */
  replies: { lineId: string | null; text: string; at: string }[];
};
