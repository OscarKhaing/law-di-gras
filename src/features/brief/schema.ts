// The brief: what a model writes about a case, every statement tied to the entries it rests on.
// Browser-safe. This is the contract between the pipeline (lane 1) and the brief page (lane 2).
//
// No field is optional or nullable: an empty string or 0 means "the file does not say". That keeps
// the schema inside the structured-output limits. The SDK does not enforce enums, so `kind`, `lane`
// and `weight` are plain strings and are normalised in server.ts.

import { z } from "zod";
import { Evidence, type CaseFile } from "@/features/cases/schema";
import type { ShareStatus } from "@/features/shares/schema";

export const MONEY_KINDS = ["value", "coverage", "specials", "wage loss", "lien", "offer", "demand", "other"] as const;
export const LANES = ["treatment", "case", "negotiation", "client"] as const;

export const Brief = z.object({
  bottomLine: z.object({
    text: z.string().describe("One or two sentences: where the case stands today and the one thing it turns on"),
    evidence: Evidence,
  }),
  incident: z.object({
    text: z.string().describe("One sentence: what happened to the client"),
    date: z.string().describe("YYYY-MM-DD"),
    evidence: Evidence,
  }),
  glance: z
    .array(z.object({ label: z.string(), value: z.string(), evidence: Evidence }))
    .describe("Four to six facts a lawyer checks first: treatment status, liability, venue and index number, claim number, insurer"),
  money: z
    .array(
      z.object({
        label: z.string(),
        amount: z.number().describe("US dollars"),
        kind: z.string().describe(`One of: ${MONEY_KINDS.join(", ")}`),
        note: z.string().describe("Any caveat the file attaches to the figure; empty string when none"),
        evidence: Evidence,
      }),
    )
    .describe("Every figure that bears on what the case is worth and what can be recovered"),
  moments: z
    .array(
      z.object({
        date: z.string().describe("YYYY-MM-DD"),
        title: z.string().describe("What happened, in under twelve words"),
        why: z.string().describe("One sentence on why someone picking up the file must know it"),
        lane: z.string().describe(`One of: ${LANES.join(", ")}`),
        evidence: Evidence,
      }),
    )
    .describe("The ten moments that matter most, oldest first. Not routine correspondence"),
  waiting: z
    .array(
      z.object({
        on: z.string().describe("Who the firm is waiting on"),
        what: z.string(),
        since: z.string().describe("YYYY-MM-DD the firm first asked; empty string when unknown"),
        asked: z.number().describe("How many times the firm has asked; 0 when unknown"),
        evidence: Evidence,
      }),
    )
    .describe("Things the case is waiting on someone outside the firm for"),
  decisions: z
    .array(
      z.object({
        what: z.string(),
        by: z.string().describe("YYYY-MM-DD it must be decided by; empty string when the file gives none"),
        evidence: Evidence,
      }),
    )
    .describe("Decisions the file says the attorney still has to make"),
  flags: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string().describe("What disagrees with what, or what is missing, and why it matters"),
        weight: z.string().describe("high, medium or low"),
        evidence: Evidence.describe("For a contradiction, one piece of evidence for each side"),
      }),
    )
    .describe("Weaknesses, contradictions inside the file, and things nobody has done"),
  injuries: z
    .array(
      z.object({
        injury: z.string(),
        state: z.string().describe("Treatment so far and where it stands; empty string when the file does not say"),
        evidence: Evidence,
      }),
    )
    .describe("Primary injuries and procedures, most serious first"),
  people: z
    .array(
      z.object({
        contact: z.string().describe('The ref of the contact, e.g. "P7"'),
        role: z.string().describe("Their part in the case, in a few words"),
        treating: z.boolean().describe("True for a medical provider who has treated the client"),
        did: z.string().describe("What they have done on the case; for a provider, the care given and whether it continues"),
        holds: z.string().describe("For a provider: what records and bills the firm holds from them; otherwise empty"),
        owes: z.string().describe("What they still owe the firm; empty string when nothing"),
        evidence: Evidence,
      }),
    )
    .describe("Everyone on the case other than the client and the firm"),
});
export type Brief = z.infer<typeof Brief>;

/** Evidence after the check in code: whether the ref exists and the quote really is in its source. */
export type CheckedEvidence = { source: string; quote: string; found: boolean };

type Checked<T> = T extends { evidence: unknown } ? Omit<T, "evidence"> & { evidence: CheckedEvidence[] } : T;

/** The brief as stored and shown: the same shape, with every piece of evidence checked. */
export type CheckedBrief = {
  [K in keyof Brief]: Brief[K] extends (infer Item)[] ? Checked<Item>[] : Checked<Brief[K]>;
};

/** A brief with how it was made. `current` is false when Clio has changed since it was written. */
export type StoredBrief = {
  brief: CheckedBrief;
  fingerprint: string;
  current: boolean;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  createdAt: string;
};

/** What every section of the brief page receives. */
export type SectionProps = {
  file: CaseFile;
  stored: StoredBrief;
  shares: ShareStatus[];
  /** What indexing the documents cost; null when none has been indexed. */
  index: IndexUsage | null;
  /** Today as YYYY-MM-DD, fixed on the server so every section agrees. */
  today: string;
};

export type IndexUsage = { model: string; documents: number; pages: number; inputTokens: number; outputTokens: number };
