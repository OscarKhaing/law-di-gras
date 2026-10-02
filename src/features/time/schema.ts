// Time on desk: how long the firm has spent on a case, rebuilt from the record. Browser-safe: the
// rule and its arithmetic, nothing else.
//
// A contingency firm keeps no time sheet, so there is nothing to read the hours from. Where a real
// duration exists (a call placed through Case Desk, a calendar entry with a start and an end) the
// time is measured. Everything else is estimated by a stated rule: so many minutes for a note, an
// email, a logged call, a page reviewed. The defaults below are assumptions for a firm to set to
// its own practice, not researched figures.

import { nameWords, type CaseFile, type Entry } from "@/features/cases/schema";
import type { CallLog } from "@/features/calls/schema";
import type { PageNote } from "@/features/documents/schema";

/** The smallest step of estimated time: a tenth of an hour, as in legal timekeeping. */
export const STEP = 6;

export type Rules = {
  /** Minutes for a call logged in Clio, which records that it happened but not how long it ran. */
  loggedCall: number;
  /** Minutes to write an email, by its length in words: short, medium, long. */
  emailShort: number;
  emailMedium: number;
  emailLong: number;
  /** The longest short email and the longest medium one, in words. */
  emailShortWords: number;
  emailMediumWords: number;
  /** Minutes to read an email that came in. */
  emailRead: number;
  /** Minutes to write a note, and a long one; a note is long when it runs over `noteLongWords`. */
  note: number;
  noteLong: number;
  noteLongWords: number;
  /** How fast a document is reviewed, and the least any document takes, in minutes. */
  pagesPerHour: number;
  documentLeast: number;
  /** The most one calendar entry can count for, in hours. */
  workingDayHours: number;
  /**
   * Whether a calendar entry that names no one from the firm counts as the firm's time. A case
   * calendar also holds the client's own appointments, and nothing but its attendees tells them
   * apart, so this starts off.
   */
  calendarUnattended: boolean;
};

export const RULES: Rules = {
  loggedCall: 12,
  emailShort: 6,
  emailMedium: 12,
  emailLong: 18,
  emailShortWords: 100,
  emailMediumWords: 300,
  emailRead: 6,
  note: 6,
  noteLong: 12,
  noteLongWords: 150,
  pagesPerHour: 60,
  documentLeast: 6,
  workingDayHours: 8,
  calendarUnattended: false,
};

/** The kinds of work the time is counted under, in the order the screen lists them when equal. */
export const WORK_KINDS = ["sent", "read", "call", "note", "document", "meeting", "desk-call"] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

export const WORK_WORD: Record<WorkKind, string> = {
  sent: "Emails sent",
  read: "Emails read",
  call: "Calls logged in Clio",
  note: "Notes",
  document: "Documents reviewed",
  meeting: "Meetings and appearances",
  "desk-call": "Calls through Case Desk",
};

export type Basis = "measured" | "estimated";

/** One piece of work and the time it took. */
export type TimeRow = {
  /** The entry's ref, or the id of a call placed through Case Desk. Unique among the rows. */
  id: string;
  /** The Clio entry to open as the source; null for a call placed through Case Desk. */
  ref: string | null;
  kind: WorkKind;
  /** YYYY-MM-DD; "" when the record gives none. */
  date: string;
  title: string;
  /** The member of the firm whose time it is. */
  person: string;
  minutes: number;
  basis: Basis;
  /** The rule that produced the minutes, in plain words. */
  why: string;
};

const same = (a: string, b: string) => nameWords(a) !== "" && nameWords(a) === nameWords(b);

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const words = (count: number) => `${count} ${count === 1 ? "word" : "words"}`;
const pagesWord = (count: number) => `${count} ${count === 1 ? "page" : "pages"}`;
const positive = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

/** Minutes rounded up to the next step, so an estimate is always a whole number of tenths of an hour. */
const upToStep = (minutes: number) => Math.ceil(minutes / STEP) * STEP;

/**
 * The people at the firm, as far as the record shows: the user Clio was read as, whoever wrote a
 * note, and whoever placed a call through Case Desk. Anyone else who writes or is written to is
 * outside the firm.
 */
export function firmMembers(file: CaseFile, calls: CallLog[]): string[] {
  const names = [
    file.firm.user,
    ...file.entries.filter((entry) => entry.kind === "note").map((entry) => entry.people[0] ?? ""),
    ...calls.map((call) => call.placedBy),
  ];
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = nameWords(name);
    if (key === "" || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The time on a case, one row per piece of work. Measured where the record holds a real duration,
 * estimated by `rules` everywhere else. Tasks, expenses, custom fields and contacts carry no time
 * of their own: a task is a reminder of work that shows up as the note, email or call it led to.
 * `today` is YYYY-MM-DD: a calendar entry counts only once its day has passed.
 */
export function timeOnDesk(
  file: CaseFile,
  pages: Record<string, PageNote[]>,
  calls: CallLog[],
  rules: Rules,
  today: string,
): TimeRow[] {
  const members = firmMembers(file, calls);
  const user = file.firm.user || members[0] || "The firm";
  const member = (name: string) => members.find((known) => same(known, name)) ?? null;
  const memberAmong = (names: string[]) => names.map(member).find((found) => found !== null) ?? null;
  const rows: TimeRow[] = [];
  const seen = new Set<string>();
  const add = (row: TimeRow) => {
    // The same entry, or the same call, is never counted twice.
    if (row.minutes <= 0 || seen.has(row.id)) return;
    seen.add(row.id);
    rows.push(row);
  };

  // Calls placed through Case Desk: the carrier's own duration, rounded up to the minute.
  const placed = calls.filter((call) => call.seconds !== null && call.seconds > 0);
  for (const call of placed) {
    const seconds = call.seconds ?? 0;
    add({
      id: `call ${call.id}`,
      ref: null,
      kind: "desk-call",
      date: call.startedAt.slice(0, 10),
      title: call.contactName ? `Call to ${call.contactName}` : "Call",
      person: call.placedBy || user,
      minutes: Math.ceil(seconds / 60),
      basis: "measured",
      why: `Placed through Case Desk: it lasted ${Math.floor(seconds / 60)} min ${seconds % 60} s, rounded up to the minute.`,
    });
  }
  // The same call written up in Clio afterwards is the same work: the measured one stands.
  const alreadyMeasured = (entry: Entry) =>
    placed.some(
      (call) =>
        call.startedAt.slice(0, 10) === entry.date &&
        (entry.people.some((name) => same(name, call.contactName)) ||
          String(entry.facts.to ?? "").split(",").some((name) => same(name, call.contactName))),
    );

  for (const entry of file.entries) {
    const base = { id: entry.ref, ref: entry.ref, date: entry.date, title: entry.title || "Untitled" };

    if (entry.kind === "note") {
      const count = wordCount(entry.text);
      const long = count > rules.noteLongWords;
      add({
        ...base,
        kind: "note",
        person: member(entry.people[0] ?? "") ?? user,
        minutes: positive(long ? rules.noteLong : rules.note),
        basis: "estimated",
        why: long
          ? `A note of ${words(count)}, over ${rules.noteLongWords}.`
          : `A note of ${words(count)}, ${rules.noteLongWords} or fewer.`,
      });
    }

    if (entry.kind === "email") {
      const sender = member(String(entry.facts.from ?? ""));
      if (sender) {
        const count = wordCount(entry.text);
        const band =
          count <= rules.emailShortWords
            ? { minutes: rules.emailShort, said: `up to ${rules.emailShortWords}` }
            : count <= rules.emailMediumWords
              ? { minutes: rules.emailMedium, said: `up to ${rules.emailMediumWords}` }
              : { minutes: rules.emailLong, said: `over ${rules.emailMediumWords}` };
        add({
          ...base,
          kind: "sent",
          person: sender,
          minutes: positive(band.minutes),
          basis: "estimated",
          why: `An email the firm sent, ${words(count)}: ${band.said}.`,
        });
      } else {
        add({
          ...base,
          kind: "read",
          person: memberAmong(String(entry.facts.to ?? "").split(",")) ?? user,
          minutes: positive(rules.emailRead),
          basis: "estimated",
          why: "An email the firm received: the time to read it.",
        });
      }
    }

    if (entry.kind === "call" && !alreadyMeasured(entry)) {
      add({
        ...base,
        kind: "call",
        person: memberAmong(entry.people) ?? user,
        minutes: positive(rules.loggedCall),
        basis: "estimated",
        why: "A call logged in Clio, which does not record how long it ran.",
      });
    }

    if (entry.kind === "document") {
      const count = pages[entry.ref]?.length || positive(Number(entry.facts.pages));
      const least = positive(rules.documentLeast);
      const byRate = rules.pagesPerHour > 0 ? upToStep((count / rules.pagesPerHour) * 60) : 0;
      add({
        ...base,
        kind: "document",
        person: user,
        minutes: Math.max(least, byRate),
        basis: "estimated",
        why:
          count > 0
            ? `${pagesWord(count)} at ${rules.pagesPerHour} an hour, rounded up to a tenth of an hour.`
            : "Its pages have not been read, so it gets the least a document takes.",
      });
    }

    if (entry.kind === "event") {
      const start = Date.parse(String(entry.facts.startAt ?? ""));
      const end = Date.parse(String(entry.facts.endAt ?? ""));
      const past = entry.date !== "" && entry.date < today;
      // An all-day entry marks a date, not a meeting.
      if (!past || entry.facts.allDay === true || Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;
      const attended = memberAmong(entry.people);
      if (!attended && !rules.calendarUnattended) continue;
      const length = Math.round((end - start) / 60_000);
      const cap = positive(rules.workingDayHours) * 60;
      const capped = cap > 0 && length > cap;
      add({
        ...base,
        kind: "meeting",
        person: attended ?? user,
        minutes: capped ? cap : length,
        basis: "measured",
        why: capped
          ? `From the calendar: it runs ${length} minutes, held to a working day of ${rules.workingDayHours} hours.`
          : `From the calendar: its start to its end.${attended ? "" : " It names no one from the firm."}`,
      });
    }
  }

  // Newest first; work with no date goes last.
  return rows.sort((a, b) => (b.date || "0").localeCompare(a.date || "0"));
}

export type Share = { minutes: number; measured: number; estimated: number };
export type Totals = Share & {
  byPerson: (Share & { person: string; count: number })[];
  byKind: (Share & { kind: WorkKind; count: number })[];
};

const split = (rows: TimeRow[]): Share => {
  const measured = rows.filter((row) => row.basis === "measured").reduce((sum, row) => sum + row.minutes, 0);
  const minutes = rows.reduce((sum, row) => sum + row.minutes, 0);
  return { minutes, measured, estimated: minutes - measured };
};

/** The rows added up: all of them, by person and by kind of work, each split by basis. Largest first. */
export function totals(rows: TimeRow[]): Totals {
  const people = [...new Set(rows.map((row) => row.person))];
  const kinds = WORK_KINDS.filter((kind) => rows.some((row) => row.kind === kind));
  return {
    ...split(rows),
    byPerson: people
      .map((person) => {
        const own = rows.filter((row) => row.person === person);
        return { person, count: own.length, ...split(own) };
      })
      .sort((a, b) => b.minutes - a.minutes),
    byKind: kinds
      .map((kind) => {
        const own = rows.filter((row) => row.kind === kind);
        return { kind, count: own.length, ...split(own) };
      })
      .sort((a, b) => b.minutes - a.minutes),
  };
}

/** Minutes as hours to one decimal: 90 is "1.5". */
export const hours = (minutes: number) => (Math.round(minutes / 6) / 10).toFixed(1);

/** What a person's time is worth at an hourly rate, in dollars to the cent. */
export const worth = (minutes: number, rate: number) => Math.round((minutes / 60) * positive(rate) * 100) / 100;

// ---- By phase ----

/** When a stage of the case began, and the entry that shows it. `date` is "" when the file does not show it. */
export type StageStart = { stage: string; date: string; ref: string };

export type Phase = Share & { stage: string; date: string; ref: string; count: number };

/**
 * The rows put into the phase their date falls in: a phase runs from the day its stage began to the
 * day before the next stage with a known start. Work dated before the first known start, or with no
 * date, is counted under `stage: ""`. Stages with no known start hold nothing and are left out.
 */
export function byPhase(rows: TimeRow[], starts: StageStart[]): Phase[] {
  const known = starts.filter((start) => start.date !== "");
  const phaseOf = (row: TimeRow) => {
    let at = -1;
    known.forEach((start, index) => {
      if (row.date !== "" && row.date >= start.date) at = index;
    });
    return at;
  };
  const phases: Phase[] = known.map((start) => ({ ...start, count: 0, minutes: 0, measured: 0, estimated: 0 }));
  const before: Phase = { stage: "", date: "", ref: "", count: 0, minutes: 0, measured: 0, estimated: 0 };
  for (const row of rows) {
    const phase = phases[phaseOf(row)] ?? before;
    phase.count += 1;
    phase.minutes += row.minutes;
    if (row.basis === "measured") phase.measured += row.minutes;
    else phase.estimated += row.minutes;
  }
  return before.count > 0 ? [before, ...phases] : phases;
}
