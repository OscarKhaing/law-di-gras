import { SECTIONS } from "./schema";

// The drafting model sees only what server.ts puts in `ProviderMaterial`. That allowlist is the
// control; this prompt is the second line, not the first.

/** One thing the drafting model may read, with the ref a line can cite. */
export type MaterialItem = { ref: string; date: string; title: string; text: string; detail?: string };

/** Everything the drafting model is given about a case, for one provider. Built in code, never the whole file. */
export type ProviderMaterial = {
  today: string;
  firm: string;
  patient: string;
  provider: MaterialItem;
  /** People who belong to the provider's practice. */
  staff: MaterialItem[];
  status: string;
  stage: string;
  stages: string[];
  tasks: MaterialItem[];
  messages: MaterialItem[];
  calendar: MaterialItem[];
  /** What the firm holds from this provider, per document: kinds of pages and the dates they span. */
  held: MaterialItem[];
  /** Other treating providers, as bare facts. */
  others: MaterialItem[];
  /** Coverage figures. */
  coverage: MaterialItem[];
};

export const SYSTEM = `You draft a short case update that a personal injury law firm sends to the office of a medical provider who is treating the firm's client. The readers are the provider's billing and lien staff. They are not lawyers and they are not on the firm's side of the case.

An attorney checks every line before anything is sent, and switches lines on or off one by one. Your job is to give the attorney accurate, plain lines to choose from.

Rules:
- Use only the material in the request. If the material does not say something, do not write it. Never guess a date, an amount or an outcome.
- One plain sentence per line, in everyday words, written from the firm to the office ("We have your records through March 2024", "Please send the itemised bill"). Call the client "your patient". No legal jargon, no abbreviations a billing office would not know: say "the records you last sent us", not "your last production".
- Facts only. Give no view on who was at fault, what the case is worth, how strong it is, whether anyone is believable, or what the firm plans to do. Say nothing about negotiation, offers, strategy or the firm's internal work.
- Do not predict when the case will end or when anyone will be paid.
- Write a date the way a letter would: "May 5, 2026", not "2026-05-05".
- Every line cites the refs it rests on, in "evidence". Use only refs that appear in the material. Copy a short quote exactly from that entry when one supports the line; otherwise leave the quote empty.
- Do not repeat a fact in two lines. Fewer, accurate lines are better than many. If a section has nothing in the material, write no line for it.`;

const SECTION_GUIDE = `Sections (use these exact names in "section"):
- status: the case is open and which stage it is at. One line, or two if the stage needs a few words of plain explanation. Not the attorney's call.
- needs: what the firm is asking this office for, from open tasks and from messages with the office: one line per request, saying what is asked for and, when the material says so, when it was asked. Not the attorney's call.
- on file: what the firm already holds from this office: the kinds of records and bills and the dates they cover, from the material on what the firm holds and from messages in which the office sent something. Not the attorney's call.
- movement: what has happened recently between the firm and this office, or on the calendar with this office: one line each, newest first, at most four. Mark a line as the attorney's call when it is about timing.
- coverage: the insurance coverage figures given. Always the attorney's call.
- attendance: whether the patient kept or missed appointments with this office, only where the material says so. Always the attorney's call.
- other treatment: other providers who have treated the patient, one line each: the provider's name and the kind of care, and nothing else. Say "has also been treated by"; the material does not say whether that care continues, what was found or what was billed. Always the attorney's call.

Set "yourCall" to true for any line that states an amount, the patient's attendance, another provider's treatment, or timing.`;

function block(heading: string, items: MaterialItem[], empty: string) {
  if (!items.length) return `## ${heading}\n${empty}`;
  const rows = items.map((item) => {
    const head = [`[${item.ref}]`, item.date, item.title].filter(Boolean).join(" ");
    return [head, item.detail, item.text].filter(Boolean).join("\n");
  });
  return `## ${heading}\n${rows.join("\n\n")}`;
}

/** The request for one provider's update. Only what is in `material` reaches the model. */
export function buildPrompt(material: ProviderMaterial) {
  return [
    `Draft the update for the office of ${material.provider.title}.`,
    `Today is ${material.today}. The firm is ${material.firm || "the law firm"}. The patient is ${material.patient}.`,
    `The sections, in order: ${SECTIONS.join(", ")}.`,
    SECTION_GUIDE,
    "# Material",
    block("The provider", [material.provider, ...material.staff], "No entry."),
    `## The case\nStatus: ${material.status || "not stated"}\nCurrent stage: ${material.stage || "not stated"}\nThe firm's stages, in order: ${material.stages.join(", ") || "not stated"}\nThe stage comes from the matter itself, which has no ref: leave the evidence of a status line empty.`,
    block("Tasks that name this office (open, or completed recently)", material.tasks, "None."),
    block("Emails and calls with this office", material.messages, "None."),
    block("Calendar entries that name this office", material.calendar, "None."),
    block("What the firm holds from this office", material.held, "Nothing has been indexed from this office yet. Write no line for the section."),
    block("Other treating providers", material.others, "None known."),
    block("Coverage", material.coverage, "No figures."),
  ].join("\n\n");
}
