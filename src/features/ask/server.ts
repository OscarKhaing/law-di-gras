import type { CheckedEvidence } from "@/features/brief/schema";
import { getBrief } from "@/features/brief/server";
import { byRef, changedSince, parseSource, type CaseFile, type EntryKind, type Evidence } from "@/features/cases/schema";
import { getCaseFile } from "@/features/cases/server";
import type { PageNote } from "@/features/documents/schema";
import { getPageNotes } from "@/features/documents/server";
import { extract } from "@/server/llm";
import { supabase } from "@/server/supabase";
import { buildPrompt, computedLines, settledLines, SYSTEM, type Material } from "./prompt";
import { Answer, isPart, type AskResult } from "./schema";

// A question must be answered fast enough to be spoken back, so the smallest model, shown only the
// part of the file that bears on the question.
const MODEL = "claude-haiku-4-5";

const MOST_ENTRIES = 25;
const MOST_PAGES = 15;
const ENTRY_TEXT = 1200;
/** How far ahead "coming up" looks, in days. */
const AHEAD = 30;
const DAY = 86_400_000;

// ---- Finding what bears on the question, in code ----

const STOP_WORDS = new Set(
  "a about after again all also am an and any are as at be been before being both but by can could did do does doing done for from get got had has have having he her here him his how i if in into is it its just last latest me more most my no not now of on once one only or other our out over own she should since so some such tell than that the their them then there these they this those to too up us very was we were what when where which who whom whose why will with would you your case matter file anyone anything".split(" "),
);

/** A word as it is compared: lower case, without a plural or possessive ending. */
const stem = (word: string) => (word.length > 3 ? word.replace(/(?:'s|s)$/, "") : word);

/** The words of a text that carry meaning, each once. */
function wordsOf(text: string): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+(?:'s)?/gu) ?? [];
  return new Set(words.filter((word) => word.length > 1 && !STOP_WORDS.has(word)).map(stem));
}

// A question that names a kind of thing is mostly about entries of that kind.
const KIND_NAMED: [RegExp, EntryKind][] = [
  [/\b(calls?|called|phoned?|speak|spoke|spoken|talk|talked|voicemails?)\b/, "call"],
  [/\b(e-?mails?|emailed)\b/, "email"],
  [/\bnotes?\b/, "note"],
  [/\b(tasks?|to-?dos?|overdue)\b/, "task"],
  [/\b(calendar|appointments?|scheduled)\b/, "event"],
  [/\b(bills?|billed|expenses?|costs?)\b/, "expense"],
  [/\b(documents?|records?)\b/, "document"],
];
const KIND_BOOST = 4;

/** A small lift for what is near today, fading to nothing over half a year. */
function recency(date: string, today: string) {
  if (!date) return 0;
  const days = Math.abs(Date.parse(today) - Date.parse(date.slice(0, 10))) / DAY;
  return Number.isNaN(days) ? 0 : Math.max(0, 1 - days / 180);
}

/** How many of the question's words a set of words holds. */
const hits = (asked: Set<string>, held: Set<string>) => [...asked].filter((word) => held.has(word)).length;

/** A long text cut to the passage where the question's words first appear. */
function passage(text: string, asked: Set<string>) {
  if (text.length <= ENTRY_TEXT) return text;
  const lower = text.toLowerCase();
  const first = Math.min(...[...asked].map((word) => lower.indexOf(word)).filter((at) => at >= 0), Number.POSITIVE_INFINITY);
  const from = Number.isFinite(first) ? Math.max(0, Math.min(first - 200, text.length - ENTRY_TEXT)) : 0;
  return `${from > 0 ? "… " : ""}${text.slice(from, from + ENTRY_TEXT)}${from + ENTRY_TEXT < text.length ? " …" : ""}`;
}

/** The entries and pages of the file nearest a question, best first. No model is involved. */
function retrieve(file: CaseFile, pages: Record<string, PageNote[]>, question: string, today: string) {
  const asked = wordsOf(question);
  const lower = question.toLowerCase();
  const kinds = new Set(KIND_NAMED.filter(([pattern]) => pattern.test(lower)).map(([, kind]) => kind));

  const entries = file.entries
    .filter((entry) => entry.kind !== "field" && entry.kind !== "contact")
    .map((entry) => {
      const facts = entry.facts;
      const body = [entry.text, entry.people.join(" "), facts.from, facts.to, facts.location, facts.folder].filter(Boolean).join(" ");
      const score =
        3 * hits(asked, wordsOf(entry.title)) + hits(asked, wordsOf(body)) + (kinds.has(entry.kind) ? KIND_BOOST : 0) + recency(entry.date, today);
      return { entry, score };
    })
    .sort((a, b) => b.score - a.score || b.entry.date.localeCompare(a.entry.date))
    .slice(0, MOST_ENTRIES)
    .map(({ entry }) => ({ entry, text: passage(entry.text, asked) }));

  const documents = byRef(file);
  // A page is shown only when it holds a word of the question; being recent is not enough.
  const best = Object.entries(pages)
    .flatMap(([ref, notes]) => notes.map((note) => ({ ref, note })))
    .map(({ ref, note }) => {
      const held = wordsOf([note.kind, note.provider, ...note.facts.map((fact) => `${fact.text} ${fact.quote}`)].join(" "));
      return { ref, note, matched: hits(asked, held), score: hits(asked, held) + recency(note.date, today) };
    })
    .filter((page) => page.matched > 0 && documents.has(page.ref))
    .sort((a, b) => b.score - a.score)
    .slice(0, MOST_PAGES);
  const grouped = new Map<string, PageNote[]>();
  for (const { ref, note } of best) grouped.set(ref, [...(grouped.get(ref) ?? []), note]);

  return {
    entries,
    pages: [...grouped].map(([ref, notes]) => ({ entry: documents.get(ref)!, notes: notes.sort((a, b) => a.page - b.page) })),
  };
}

// ---- Checking the answer's evidence, as the brief's is checked ----

/** Lower case, straight quotes, single spaces: how a quote and its source are compared. */
const flatten = (text: string) =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/**
 * A source whose ref is not in the file is dropped; the rest are marked `found` when the quote (if
 * any) really is in the entry's title or text, or, for a page of a document, in what the page index
 * read on that page.
 */
function check(evidence: Evidence, file: CaseFile, pages: Record<string, PageNote[]>): CheckedEvidence[] {
  const entries = byRef(file);
  const seen = new Set<string>();
  return evidence.flatMap((item) => {
    const { ref, page } = parseSource(item.source);
    const entry = entries.get(ref);
    if (!entry) return [];
    const source = page === null ? ref : `${ref} p.${page}`;
    const quote = item.quote.trim();
    if (seen.has(`${source} ${quote}`)) return [];
    seen.add(`${source} ${quote}`);
    if (!quote) return [{ source, quote: "", found: true }];
    const note = page === null ? undefined : pages[ref]?.find((candidate) => candidate.page === page);
    const haystack = note ? note.facts.map((fact) => `${fact.text} ${fact.quote}`).join(" ") : `${entry.title} ${entry.text}`;
    return [{ source, quote, found: flatten(haystack).includes(flatten(quote)) }];
  });
}

const addDays = (day: string, count: number) => new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY).toISOString().slice(0, 10);

/** A visit this recent is the reader's present one, not the last time they had the file. */
const PRESENT_VISIT_MS = 10 * 60_000;
/** With no earlier visit on record, "since you last had the file" means this many days. */
const NO_VISIT_DAYS = 30;
/** The most new entries shown in full for "catch me up"; the newest are kept. */
const MOST_NEW = 60;

/**
 * When the reader last had the file before now: their latest visit that is more than ten minutes
 * old, or, with none on record, thirty days ago.
 */
async function lastHadFile(matterId: number, viewer: string | undefined): Promise<{ cutoff: string; visited: boolean }> {
  const fallback = { cutoff: new Date(Date.now() - NO_VISIT_DAYS * DAY).toISOString(), visited: false };
  if (!viewer) return fallback;
  const { data, error } = await supabase()
    .from("visits")
    .select("opened_at")
    .eq("matter_id", matterId)
    .eq("viewer", viewer)
    .lt("opened_at", new Date(Date.now() - PRESENT_VISIT_MS).toISOString())
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.opened_at ? { cutoff: new Date(data.opened_at as string).toISOString(), visited: true } : fallback;
}

export type AskOptions = {
  /** The reader's own day, YYYY-MM-DD; the server's when left out. */
  today?: string;
  /** "Catch me up": answer with what is new since this reader last had the file. */
  catchUp?: boolean;
  /** This browser's reader id, as the case page records visits under. */
  viewer?: string;
  signal?: AbortSignal;
};

/**
 * Answer a question about a case from its file. The entries and pages nearest the question are
 * found in code; one call to a small model writes the answer; every source it cites is then checked
 * against the file. Nothing is saved.
 */
export async function askCase(matterId: number, question: string, options: AskOptions = {}): Promise<AskResult> {
  const started = Date.now();
  const [file, stored, pages] = await Promise.all([getCaseFile(matterId), getBrief(matterId), getPageNotes(matterId)]);
  if (!file) throw new Error("This case has not been read from Clio yet.");
  const today = options.today ?? new Date().toISOString().slice(0, 10);

  // For "catch me up", everything new since the reader's last visit goes in whole, ahead of what
  // the question's own words find. What counts as new is what the case page's own "since you last
  // opened" counts, so the two agree: since a visit, anything added to Clio or dated since it (a
  // task merely due later is not news); with no visit, anything dated in the last thirty days,
  // whenever it was typed into Clio.
  let since: Material["since"] = null;
  if (options.catchUp) {
    const { cutoff, visited } = await lastHadFile(matterId, options.viewer);
    const fresh = changedSince(file, cutoff).filter((entry) =>
      visited ? entry.createdAt > cutoff || entry.date <= today : entry.date > cutoff.slice(0, 10) && entry.date <= today,
    );
    since = { cutoff: cutoff.slice(0, 10), visited, entries: fresh.slice(0, MOST_NEW) };
  }
  const shown = new Set(since?.entries.map((entry) => entry.ref));

  const found = retrieve(file, pages, question, today);
  found.entries = found.entries.filter(({ entry }) => !shown.has(entry.ref));
  const prompt = buildPrompt({
    today,
    file,
    question,
    settled: stored ? settledLines(stored.brief) : [],
    computed: computedLines(file, today, addDays(today, AHEAD)),
    fields: file.entries.filter((entry) => entry.kind === "field" && entry.text.trim() !== ""),
    contacts: file.entries.filter((entry) => entry.kind === "contact"),
    entries: found.entries,
    pages: found.pages,
    since,
  });

  let result;
  try {
    result = await extract(Answer, { system: SYSTEM, prompt, model: MODEL, maxTokens: 2000, signal: options.signal });
  } catch (err) {
    if (options.signal?.aborted) throw new Error("Looking through the file took too long. Ask again, or ask something narrower.");
    throw err;
  }

  const part = result.data.part.trim().toLowerCase();
  return {
    answer: result.data.answer.replace(/\s+/g, " ").trim(),
    evidence: check(result.data.evidence, file, pages),
    part: isPart(part) ? part : "",
    seconds: Math.round((Date.now() - started) / 100) / 10,
    model: result.model,
    usage: result.usage,
  };
}
