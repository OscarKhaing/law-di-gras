// A case as read from Clio. Browser-safe: types and small pure functions only.
// This is the contract between the three lanes; change it only with the others' agreement.

import { z } from "zod";

export type EntryKind = "note" | "email" | "call" | "task" | "event" | "expense" | "document" | "field" | "contact";

/**
 * One thing in the file: a note, an email, a task, a document, a custom field, a person.
 * Every kind has the same shape, so the screens, the prompts and the source panel treat them alike.
 */
export type Entry = {
  /** Short stable name the model cites and the screens open: N12, M45, T3, E7, X2, D9, F4, P3. */
  ref: string;
  kind: EntryKind;
  clioId: string;
  etag: string;
  /** The day the entry is about (note date, sent date, due date, start, received), YYYY-MM-DD; "" if none. */
  date: string;
  /** Subject, task name, event summary, field name, file name, or a person's name. */
  title: string;
  /** Body, detail, description, field value. For a contact: their role on the case. */
  text: string;
  /** Names involved: author, sender, receivers, assignee, attendees. */
  people: string[];
  /**
   * Kind-specific details. Known keys:
   * task: status ("pending" | "complete" ...), priority, completedAt
   * event: startAt, endAt, location
   * expense: amount, billable (false for a charge recorded on the matter that the firm did not pay
   *   itself, such as a provider's bill)
   * email, call: from, to (names, comma separated)
   * document: folder, pages, bytes, versionId, storagePath, contentType
   * field: fieldType
   * contact: role, isClient, isCompany, email, phone
   */
  facts: Record<string, string | number | boolean>;
  /** Clio's own timestamps, used for "since you last opened". */
  createdAt: string;
  updatedAt: string;
};

export type CaseFile = {
  matterId: number;
  /** Clio's display number, e.g. "00001-Name". */
  number: string;
  description: string;
  status: string;
  /** The current stage and, in order, every stage Clio has for this practice area. */
  stage: string;
  stages: string[];
  practiceArea: string;
  openDate: string;
  limitationDate: string;
  client: { ref: string; name: string };
  /** The firm, from the Clio account and the user who connected it. */
  firm: { name: string; user: string; email: string };
  entries: Entry[];
  syncedAt: string;
  /** Changes whenever anything in Clio changes; a brief is cached against it. */
  fingerprint: string;
};

/**
 * A case is kept under its Clio matter id. The same number negated names a second, separate copy of
 * that matter, a "fresh read": its own case file, page index, brief and document copies, so the
 * whole reading can be run again from nothing without touching the case the firm is working from.
 */
export const MatterKey = z.number().int().refine((key) => key !== 0, "Not a case.");
export const isFreshRead = (matterKey: number) => matterKey < 0;
/** The matter in Clio that a case, or its fresh read, is a copy of. */
export const clioMatterId = (matterKey: number) => Math.abs(matterKey);

/** A row of the case list. `syncedAt` is null for a matter in Clio that has not been read yet. */
export type CaseSummary = {
  matterId: number;
  number: string;
  client: string;
  description: string;
  stage: string;
  stages: string[];
  syncedAt: string | null;
};

/**
 * Where a statement comes from. `source` is a ref ("N12") or a ref and page ("D9 p.212");
 * `quote` is copied exactly from that source, or empty.
 */
export const Evidence = z.array(
  z.object({
    source: z.string().describe('The ref of one entry, e.g. "N12" or "M45"; for a page of a document, "D9 p.212"'),
    quote: z.string().describe("Up to 25 words copied exactly from that source; empty string when nothing short supports it"),
  }),
);
export type Evidence = z.infer<typeof Evidence>;

/** Splits "D9 p.212" into { ref: "D9", page: 212 }; a plain ref has page null. */
export function parseSource(source: string): { ref: string; page: number | null } {
  const match = source.trim().match(/^([A-Z]+\d+)(?:\s*(?:p\.?|@)\s*(\d+))?/i);
  if (!match) return { ref: source.trim(), page: null };
  return { ref: match[1].toUpperCase(), page: match[2] ? Number(match[2]) : null };
}

export function byRef(file: CaseFile): Map<string, Entry> {
  return new Map(file.entries.map((entry) => [entry.ref, entry]));
}

const isOpenTask = (entry: Entry) => entry.kind === "task" && entry.facts.status !== "complete";

/** Open tasks whose due date has passed, oldest first. `today` is YYYY-MM-DD. */
export function overdue(file: CaseFile, today: string): Entry[] {
  return file.entries
    .filter((entry) => isOpenTask(entry) && entry.date !== "" && entry.date < today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Open tasks and calendar entries from today up to `until` (YYYY-MM-DD), soonest first. */
export function upcoming(file: CaseFile, today: string, until: string): Entry[] {
  return file.entries
    .filter((entry) => (isOpenTask(entry) || entry.kind === "event") && entry.date >= today && entry.date <= until)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The last time anyone actually spoke to the client: the latest phone call the client took part in. */
export function lastClientContact(file: CaseFile): Entry | null {
  const calls = file.entries
    .filter((entry) => entry.kind === "call" && entry.people.includes(file.client.name))
    .sort((a, b) => b.date.localeCompare(a.date));
  return calls[0] ?? null;
}

/** The firm's own costs on the case: expense entries that are billable (see `facts.billable`). */
export function firmCosts(file: CaseFile): Entry[] {
  return file.entries.filter((entry) => entry.kind === "expense" && entry.facts.billable !== false);
}

/** What the firm has paid out on the case: the sum of its own cost entries. */
export function firmSpend(file: CaseFile): number {
  return firmCosts(file).reduce((sum, entry) => sum + (Number(entry.facts.amount) || 0), 0);
}

/**
 * Entries that are new since `cutoff` (an ISO timestamp or a date): dated after it, or created in
 * Clio after it. Fields and contacts are left out; they are not events. Newest first.
 */
export function changedSince(file: CaseFile, cutoff: string): Entry[] {
  const day = cutoff.slice(0, 10);
  return file.entries
    .filter((entry) => entry.kind !== "field" && entry.kind !== "contact")
    .filter((entry) => (entry.date !== "" && entry.date > day) || entry.createdAt > cutoff)
    .sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt));
}

const dayMonth = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dayMonthYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "2026-09-29" as "Sep 29", or "Sep 29, 2026" with `year`. An empty or unreadable date gives "". */
export function shortDate(isoDate: string, year = false) {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (!isoDate || Number.isNaN(date.getTime())) return "";
  return (year ? dayMonthYear : dayMonth).format(date);
}

// ---- Telling who a line of the file is about, from the names of the contacts ----

/** Lower case words only, so "P.C." and "PC", or "Rivera's" and "Rivera", compare equal. */
export const nameWords = (text: string) =>
  text
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// Titles and company forms that come and go when a name is written in a note or a subject line.
const NAME_EXTRAS = new Set(["dr", "mr", "mrs", "ms", "md", "do", "dc", "dpm", "pt", "phd", "pllc", "llc", "llp", "pc", "pa", "inc", "corp", "ltd"]);

/** A contact's name as written in full: as Clio has it, and without titles and company forms. */
export function fullNames(contact: Entry): string[] {
  const full = nameWords(contact.title);
  const core = full.split(" ").filter((word) => !NAME_EXTRAS.has(word)).join(" ");
  return [...new Set([full, core])].filter(Boolean);
}

/** The ways a contact is written in the file: its full names and its short form. */
export function nameKeys(contact: Entry): string[] {
  const names = fullNames(contact);
  const core = (names.at(-1) ?? "").split(" ");
  if (contact.facts.isCompany === true) {
    // "Riverside Orthopaedic Associates, PLLC" is usually written "Riverside Orthopaedic".
    const short = core.slice(0, 2).join(" ");
    if (core.length > 2 && short.length >= 8) names.push(short);
  } else {
    // A person is usually written by surname: "Dr. Rivera's office".
    const surname = core.at(-1) ?? "";
    if (core.length > 1 && surname.length >= 4) names.push(surname);
  }
  return names;
}

/** Whether a text names any of the keys, as whole words. */
export const mentions = (text: string, keys: string[]) => {
  const hay = ` ${nameWords(text)} `;
  return keys.some((key) => hay.includes(` ${key} `));
};

/** The contact a text names, if any: the first whose name, in full or in its short form, appears in it. */
export function contactNamed(file: CaseFile, text: string): Entry | null {
  const contacts = file.entries.filter((entry) => entry.kind === "contact" && entry.facts.isClient !== true);
  return (
    contacts.find((contact) => mentions(text, fullNames(contact))) ??
    contacts.find((contact) => mentions(text, nameKeys(contact))) ??
    null
  );
}

/** A link to the matter in Clio's own web app, for the reader to open in a new tab. Case Desk only reads Clio. */
export const clioMatterUrl = (matterKey: number) => `https://app.clio.com/nc/#/matters/${clioMatterId(matterKey)}`;

