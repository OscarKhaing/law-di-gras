// "Ask about this case": a question put to the file, and a short answer tied to its sources.
// Browser-safe: the answer's shape, the parts of a case it can point to, and nothing else.

import { z } from "zod";
import type { CheckedEvidence } from "@/features/brief/schema";
import { Evidence } from "@/features/cases/schema";

/** The parts of a case an answer can send the reader to, by the id the case page opens them with. */
export const PARTS = ["overview", "todo", "money", "time", "timeline", "medical", "flags", "file"] as const;
export type Part = (typeof PARTS)[number];

/** Each part as the case's own menu names it. */
export const PART_LABEL: Record<Part, string> = {
  overview: "Overview",
  todo: "To do",
  money: "Money",
  time: "Time on desk",
  timeline: "Timeline",
  medical: "Medical",
  flags: "Red flags",
  file: "Full file",
};

export const isPart = (value: string): value is Part => (PARTS as readonly string[]).includes(value);

/** What the file answers when it holds nothing on the question. Shown and spoken as it is. */
export const NOT_IN_FILE = "The file does not say.";

/** What the model returns. No field is optional or nullable: an empty string means "none". */
export const Answer = z.object({
  answer: z
    .string()
    .describe(`At most 80 words, in plain sentences fit to be read aloud: no lists, no markdown, no refs. "${NOT_IN_FILE}" when the material does not answer the question`),
  evidence: Evidence.describe("The entries and pages the answer rests on, at most six; empty when the file does not say"),
  part: z.string().describe(`The part of the case to open for more, one of: ${PARTS.join(", ")}; empty string when none fits`),
});
export type Answer = z.infer<typeof Answer>;

/** An answer after its evidence was checked against the file. */
export type AskResult = {
  answer: string;
  evidence: CheckedEvidence[];
  /** A part of the case, or "" when the answer points to none. */
  part: string;
  seconds: number;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
};

/** What the bar sends. `today` is the reader's own day; `viewer` and `catchUp` ask what is new since their last visit. */
export const AskRequest = z.object({
  question: z.string().trim().min(3, "Ask a question of at least three characters.").max(500, "Keep the question under 500 characters."),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  viewer: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  catchUp: z.boolean().optional(),
});
