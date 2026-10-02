import type { CheckedBrief, CheckedEvidence } from "@/features/brief/schema";
import { firmCosts, firmSpend, lastClientContact, overdue, upcoming, type CaseFile, type Entry } from "@/features/cases/schema";
import type { PageNote } from "@/features/documents/schema";
import { NOT_IN_FILE, PARTS } from "./schema";

// The instructions for answering a question about a case. They are about personal injury files in
// general: nothing here may describe a particular case.

export const SYSTEM = `You answer questions from a lawyer or case manager at a personal injury firm about one of the firm's case files, the way a careful paralegal who has just read the file would answer across a desk.

You are given material taken from the firm's case management system for one matter: what the firm's own brief of the case already settled, what was computed from the file, custom fields, people, and the notes, emails, phone calls, tasks, calendar entries, expenses and document pages that bear on the question. Each item starts with a ref in square brackets, such as [N12], [M45], [T3], [E7], [X2], [D9], [F4] or [P3]. A page of a document is written like "D9 p.12".

Rules:
- Answer only from the material. If it does not answer the question, the answer is exactly: "${NOT_IN_FILE}" with no evidence. Never fill a gap from general knowledge or by guessing.
- No advice, no prediction, no opinion on what the firm should do. Report what the file says, and when two items disagree, say that they disagree.
- The answer is read aloud, so it is short: at most four sentences and 80 words in all. A longer answer is a failure. With more than three things to report, say how many there are, name the two or three that matter most in a few words each, and stop: the reader opens the part you name for the rest. Plain complete sentences. No lists, no markdown, no headings, no refs or square brackets in the answer, no "according to the file". Start with the answer itself.
- Say dates the way a person says them, such as "February 11th". Leave the year out of a date in the current year. Say how long ago when that helps. Write amounts as figures with a dollar sign, such as $1,250, never in words.
- Keep to the file's own wording for whose something is. Name the holder of a policy or a limit, the owner of a record or the cause of something only when an item you cite names them in so many words; otherwise use the item's own term, such as "the defendant's".
- Mind today's date. Something dated before today has happened or was due then: never call it scheduled or coming up. If the file does not say whether it took place, say that it was set for that date.
- A phone call lists the people on it, in no particular order. Who rang whom, and who asked or said what, is only in the text of the entry: repeat it as the text has it, and if the text does not say, say only that they spoke.
- Every claim in the answer rests on evidence: the refs it comes from, in the evidence list and nowhere else. For a page of a document write the ref and page, like "D9 p.12". Use refs exactly as given, and never invent one. At most six.
- A quote is copied character for character from the item it is attributed to, at most 25 words, with no ellipsis and nothing added. If you cannot quote exactly, leave the quote empty and keep the ref.
- Prefer the item that records the fact first hand over a summary of it. What was computed from the file (overdue, coming up, last spoke to the client, the firm's costs) is exact: use it rather than counting yourself.
- An expense marked "charge, not paid by the firm" is a bill recorded on the matter; it is not the firm's own spending.
- part names where in the case to read more, one of: ${PARTS.join(", ")}. overview: where the case stands. todo: who the firm is waiting on, tasks, deadlines, decisions. money: value, coverage, bills, liens, offers. time: time spent on the case. timeline: what happened and when, and who spoke to whom. medical: injuries, treatment, providers. flags: weaknesses and contradictions. file: one particular entry. Leave it empty when the file does not say.`;

const KIND_LABEL: Record<Entry["kind"], string> = {
  field: "custom field",
  contact: "person",
  note: "note",
  email: "email",
  call: "phone call",
  task: "task",
  event: "calendar entry",
  expense: "expense",
  document: "document",
};

const money = (amount: number) => `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** The people on a phone call, in alphabetical order so that the order says nothing about who placed it. */
const onCall = (entry: Entry) => {
  const ends = [entry.facts.from, entry.facts.to].filter(Boolean).map(String);
  return (ends.length ? ends : entry.people).sort().join(", ") || "not recorded";
};

/** A text short enough to sit inside a line of the computed facts. */
const clipped = (text: string, length = 500) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length)} …` : flat;
};

/** The first line of an entry: its ref, what it is, its date, its title and the details of its kind. */
function head(entry: Entry): string {
  const parts = [`[${entry.ref}]`, KIND_LABEL[entry.kind]];
  if (entry.date) parts.push(entry.date);
  if (entry.title) parts.push(`"${entry.title}"`);
  const facts = entry.facts;
  if (entry.kind === "email") parts.push(`from ${facts.from || "unknown"} to ${facts.to || "unknown"}`);
  // A call is logged with a sender and a receiver, but only its text says who rang whom.
  if (entry.kind === "call") parts.push(`people on the call: ${onCall(entry)}`);
  if (entry.kind === "task") parts.push(`status ${facts.status}${facts.priority ? `, priority ${facts.priority}` : ""}, due ${entry.date || "no date"}`);
  if (entry.kind === "event" && facts.location) parts.push(`at ${facts.location}`);
  if (entry.kind === "expense") parts.push(`${money(Number(facts.amount) || 0)}${facts.billable === false ? " (charge, not paid by the firm)" : " (paid by the firm)"}`);
  if (entry.kind === "document") parts.push(`in folder "${facts.folder ?? ""}"${facts.pages ? `, ${facts.pages} pages` : ""}`);
  if (entry.kind === "note" && entry.people.length) parts.push(`by ${entry.people.join(", ")}`);
  return parts.join(" ");
}

/** An entry with the text given for it (the whole of it, or the passage nearest the question). */
export function describe(entry: Entry, text = entry.text): string {
  return text ? `${head(entry)}\n${text}` : head(entry);
}

/** A person on the case, on one line. */
function describeContact(entry: Entry): string {
  const facts = entry.facts;
  const parts = [`[${entry.ref}] "${entry.title}"`, facts.isClient ? "the client" : `role: ${facts.role || entry.text || "not stated"}`];
  if (entry.people.length) parts.push(`at ${entry.people.join(", ")}`);
  if (facts.phone) parts.push(`phone ${facts.phone}`);
  if (facts.email) parts.push(`email ${facts.email}`);
  return parts.join(", ");
}

function describePage(ref: string, note: PageNote): string {
  const top = [`${ref} p.${note.page}`, note.kind, note.provider, note.date].filter(Boolean).join(" | ");
  const facts = note.facts.map((fact) => `  - ${fact.text}${fact.quote ? ` ("${fact.quote}")` : ""}`).join("\n");
  return facts ? `${top}\n${facts}` : top;
}

/** The sources of a statement of the brief, with the passages it quoted, so they can be cited again. */
const cited = (evidence: CheckedEvidence[]) => {
  const items = evidence.map((item) => (item.quote && item.found ? `${item.source} "${item.quote}"` : item.source));
  return items.length ? ` [sources: ${items.join("; ")}]` : "";
};

/** What the brief already settled, one statement a line, each with the refs it rests on. */
export function settledLines(brief: CheckedBrief): string[] {
  const lines: string[] = [];
  if (brief.bottomLine.text) lines.push(`Where the case stands: ${brief.bottomLine.text}${cited(brief.bottomLine.evidence)}`);
  if (brief.incident.text) lines.push(`What happened${brief.incident.date ? ` on ${brief.incident.date}` : ""}: ${brief.incident.text}${cited(brief.incident.evidence)}`);
  for (const figure of brief.money) {
    lines.push(`Money, ${figure.kind}: ${figure.label}, ${money(figure.amount)}${figure.note ? ` (${figure.note})` : ""}${cited(figure.evidence)}`);
  }
  lines.push(
    brief.waiting.length === 0
      ? "The firm is waiting on: nobody, as far as the brief found."
      : `Requests the firm is still waiting on: ${brief.waiting.length} in all, each on its own line below.`,
  );
  for (const item of brief.waiting) {
    const asked = [item.since ? `first asked ${item.since}` : "", item.asked > 0 ? `asked ${item.asked} time${item.asked === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ");
    lines.push(`The firm is waiting on ${item.on}: ${item.what}${asked ? ` (${asked})` : ""}${cited(item.evidence)}`);
  }
  for (const item of brief.decisions) lines.push(`For the attorney to decide${item.by ? ` by ${item.by}` : ""}: ${item.what}${cited(item.evidence)}`);
  for (const flag of brief.flags) lines.push(`Red flag (${flag.weight}): ${flag.title}${cited(flag.evidence.map((item) => ({ ...item, quote: "" })))}`);
  return lines;
}

/** What code computes from the file, each with the entries it was computed from. */
export function computedLines(file: CaseFile, today: string, until: string): string[] {
  const lines: string[] = [];
  const late = overdue(file, today);
  lines.push(
    late.length
      ? `Overdue tasks (${late.length}): ${late.map((task) => `[${task.ref}] "${task.title}" due ${task.date}`).join("; ")}`
      : "Overdue tasks: none.",
  );
  const next = upcoming(file, today, until);
  lines.push(
    next.length
      ? `Coming up from ${today} to ${until} (${next.length}): ${next.map((entry) => `[${entry.ref}] ${KIND_LABEL[entry.kind]} "${entry.title}" on ${entry.date}`).join("; ")}`
      : `Coming up from ${today} to ${until}: nothing.`,
  );
  const spoke = lastClientContact(file);
  lines.push(
    spoke
      ? `The last time anyone spoke to the client (the latest phone call the client took part in): ${spoke.date}, [${spoke.ref}] "${spoke.title}", people on the call: ${onCall(spoke)}. The entry reads: ${clipped(spoke.text) || "nothing more"}`
      : "The last time anyone spoke to the client: the file records no phone call with the client.",
  );
  const costs = firmCosts(file);
  lines.push(
    costs.length
      ? `The firm's own costs on the case: ${money(firmSpend(file))} over ${costs.length} expense${costs.length === 1 ? "" : "s"} (${costs.map((cost) => `[${cost.ref}]`).join(", ")})`
      : "The firm's own costs on the case: none recorded.",
  );
  return lines;
}

/** What the model is shown for one question. */
export type Material = {
  today: string;
  file: CaseFile;
  question: string;
  settled: string[];
  computed: string[];
  fields: Entry[];
  contacts: Entry[];
  /** The entries nearest the question, each with the passage of its text to show. */
  entries: { entry: Entry; text: string }[];
  /** The pages nearest the question, grouped under their document. */
  pages: { entry: Entry; notes: PageNote[] }[];
  /** For "catch me up": when the reader last had the file, and everything new since, in full. */
  since: { cutoff: string; visited: boolean; entries: Entry[] } | null;
};

export function buildPrompt(material: Material): string {
  const { file, today, since } = material;
  const parts: string[] = [
    `Today is ${today}. The current year is ${today.slice(0, 4)}.`,
    `MATTER ${file.number}: ${file.description}`,
    `Practice area: ${file.practiceArea}. Status: ${file.status}. Stage: ${file.stage} (stages in order: ${file.stages.join(", ")}).`,
    `Opened ${file.openDate || "date not recorded"}. Limitation date ${file.limitationDate || "not recorded"}. Client: ${file.client.name} [${file.client.ref}]. The file was last read from the case management system on ${file.syncedAt.slice(0, 10)}.`,
  ];
  if (material.settled.length) parts.push("\n===== WHAT THE FIRM'S BRIEF OF THIS CASE ALREADY SETTLED =====", material.settled.join("\n"));
  parts.push("\n===== COMPUTED FROM THE FILE =====", material.computed.join("\n"));
  if (material.fields.length) parts.push("\n===== CUSTOM FIELDS =====", material.fields.map((entry) => `[${entry.ref}] "${entry.title}": ${entry.text}`).join("\n"));
  if (material.contacts.length) parts.push("\n===== PEOPLE =====", material.contacts.map(describeContact).join("\n"));
  if (since) {
    parts.push(
      `\n===== ${since.visited ? "NEW SINCE THE READER LAST HAD THIS FILE" : "DATED IN THE LAST THIRTY DAYS"} (SINCE ${since.cutoff}), NEWEST FIRST =====`,
      since.entries.length ? since.entries.map((entry) => describe(entry)).join("\n\n") : "Nothing has been added to the file or dated since then.",
    );
  }
  if (material.entries.length) {
    parts.push(
      "\n===== ENTRIES OF THE FILE NEAREST THE QUESTION =====",
      "A long entry is shown in part.",
      material.entries.map(({ entry, text }) => describe(entry, text)).join("\n\n"),
    );
  }
  if (material.pages.length) {
    parts.push(
      "\n===== PAGES OF THE DOCUMENTS NEAREST THE QUESTION =====",
      "Each line is one page: ref and page, what the page is, who it is from, its date, then facts read on it with the words they were read from.",
      material.pages.map(({ entry, notes }) => `--- [${entry.ref}] "${entry.title}"\n${notes.map((note) => describePage(entry.ref, note)).join("\n")}`).join("\n\n"),
    );
  }
  parts.push(
    "\n===== THE QUESTION =====",
    material.question,
    since
      ? since.visited
        ? `\nThe reader last had this file on ${since.cutoff}. Say what is new since then, drawn only from the section of new entries, the most important first, and leave out what they already knew. Name the date they last had the file, or say "earlier today" when it is today's date. If that section is empty, say that nothing has been added to the file since then, and nothing more.`
        : `\nThere is no record of this reader having opened this file before, so tell them what happened in the last thirty days, since ${since.cutoff}, and say that this is what you are doing. Draw only from the section of entries dated in that time, the most important first. If that section is empty, say that nothing in the file is dated in the last thirty days, and nothing more.`
      : "\nAnswer it from the material above, briefly, with the evidence it rests on.",
  );
  return parts.join("\n");
}
