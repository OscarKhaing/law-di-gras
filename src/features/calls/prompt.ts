import type { CallLog } from "./schema";

export const SUMMARY_SYSTEM = `You write the note a personal injury firm keeps after a phone call.
You are given a transcript made by a machine, so words may be misheard. Write exactly two plain
sentences: the first says what was discussed, the second says what was agreed or what happens next
(or that nothing was agreed). Use only what the transcript says. No heading, no list, no quotation.`;

export function summaryPrompt(call: CallLog): string {
  const lines = call.transcript
    .map((line) => `${line.speaker === "firm" ? call.placedBy : call.contactName}: ${line.text}`)
    .join("\n");
  return `A call from ${call.placedBy} at the firm to ${call.contactName}.\n\n<transcript>\n${lines}\n</transcript>`;
}
