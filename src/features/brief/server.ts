import { byRef, parseSource, type CaseFile, type Evidence } from "@/features/cases/schema";
import { getCaseFile, listCases } from "@/features/cases/server";
import type { PageNote } from "@/features/documents/schema";
import { getPageNotes } from "@/features/documents/server";
import { extract } from "@/server/llm";
import { supabase } from "@/server/supabase";
import { buildPrompt, SYSTEM } from "./prompt";
import { Brief, LANES, MONEY_KINDS, worklistsOf, type CheckedBrief, type CheckedEvidence, type ListedCase, type StoredBrief } from "./schema";

// The brief is written once per state of the case in Clio and stored; opening a case reads it back.
const MODEL = "claude-opus-5-5";

/** The latest brief written for a case, or null when none has been written. Never calls a model. */
export async function getBrief(matterId: number): Promise<StoredBrief | null> {
  const [file, { data, error }] = await Promise.all([
    getCaseFile(matterId),
    supabase()
      .from("briefs")
      .select("brief, fingerprint, model, input_tokens, output_tokens, created_at")
      .eq("matter_id", matterId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (error) throw error;
  if (!data) return null;
  return {
    brief: data.brief as CheckedBrief,
    fingerprint: data.fingerprint,
    current: file?.fingerprint === data.fingerprint,
    model: data.model,
    usage: { inputTokens: data.input_tokens, outputTokens: data.output_tokens },
    createdAt: data.created_at,
  };
}

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
 * Check the model's evidence against the file. A source whose ref does not exist is dropped; the
 * rest are marked `found` when the entry exists and the quote (if any) really is in it. For a page
 * of a document the quote is compared with what the page index read on that page.
 */
function checker(file: CaseFile, pages: Record<string, PageNote[]>) {
  const entries = byRef(file);
  const tally = { sources: 0, dropped: 0, quotes: 0, quotesFound: 0 };
  const check = (evidence: Evidence): CheckedEvidence[] =>
    evidence.flatMap((item) => {
      tally.sources += 1;
      const { ref, page } = parseSource(item.source);
      const entry = entries.get(ref);
      if (!entry) {
        tally.dropped += 1;
        return [];
      }
      const source = page === null ? ref : `${ref} p.${page}`;
      const quote = item.quote.trim();
      if (!quote) return [{ source, quote: "", found: true }];
      tally.quotes += 1;
      const note = page === null ? undefined : pages[ref]?.find((candidate) => candidate.page === page);
      const haystack = note
        ? note.facts.map((fact) => `${fact.text} ${fact.quote}`).join(" ")
        : `${entry.title} ${entry.text}`;
      const found = flatten(haystack).includes(flatten(quote));
      if (found) tally.quotesFound += 1;
      return [{ source, quote, found }];
    });
  return { check, tally };
}

const oneOf = (value: string, allowed: readonly string[], fallback: string) => {
  const cleaned = value.trim().toLowerCase();
  return allowed.includes(cleaned) ? cleaned : fallback;
};

/** Check every piece of evidence and put the loosely typed fields into their allowed values. */
function tidy(brief: Brief, file: CaseFile, pages: Record<string, PageNote[]>) {
  const { check, tally } = checker(file, pages);
  const contacts = new Set(file.entries.filter((entry) => entry.kind === "contact").map((entry) => entry.ref));
  const checked: CheckedBrief = {
    bottomLine: { ...brief.bottomLine, evidence: check(brief.bottomLine.evidence) },
    incident: { ...brief.incident, evidence: check(brief.incident.evidence) },
    glance: brief.glance.map((item) => ({ ...item, evidence: check(item.evidence) })),
    money: brief.money.map((item) => ({
      ...item,
      kind: oneOf(item.kind, MONEY_KINDS, "other"),
      evidence: check(item.evidence),
    })),
    moments: brief.moments
      .map((item) => ({ ...item, lane: oneOf(item.lane, LANES, "case"), evidence: check(item.evidence) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    waiting: brief.waiting.map((item) => ({ ...item, evidence: check(item.evidence) })),
    decisions: brief.decisions.map((item) => ({ ...item, evidence: check(item.evidence) })),
    flags: brief.flags.map((item) => ({
      ...item,
      weight: oneOf(item.weight, ["high", "medium", "low"], "medium"),
      evidence: check(item.evidence),
    })),
    injuries: brief.injuries.map((item) => ({ ...item, evidence: check(item.evidence) })),
    // A person the model cannot tie to a contact in the file is left out.
    people: brief.people
      .map((item) => ({ ...item, contact: parseSource(item.contact).ref, evidence: check(item.evidence) }))
      .filter((item) => contacts.has(item.contact)),
  };
  return { checked, tally };
}

/**
 * Write the brief for a case from its file and the index of its documents, check it against the
 * file, and store it under the case file's fingerprint. One model call; about a minute or two.
 */
export async function buildBrief(matterId: number, signal?: AbortSignal) {
  const file = await getCaseFile(matterId);
  if (!file) throw new Error("This case has not been read from Clio yet.");
  const pages = await getPageNotes(matterId);
  const today = new Date().toISOString().slice(0, 10);
  const result = await extract(Brief, {
    system: SYSTEM,
    prompt: buildPrompt(file, pages, today),
    model: MODEL,
    maxTokens: 48000,
    signal,
  });
  const { checked, tally } = tidy(result.data, file, pages);
  const createdAt = new Date().toISOString();
  const { error } = await supabase().from("briefs").upsert({
    matter_id: matterId,
    fingerprint: file.fingerprint,
    brief: checked,
    model: result.model,
    input_tokens: result.usage.inputTokens,
    output_tokens: result.usage.outputTokens,
    created_at: createdAt,
  });
  if (error) throw error;
  const stored: StoredBrief = {
    brief: checked,
    fingerprint: file.fingerprint,
    current: true,
    model: result.model,
    usage: result.usage,
    createdAt,
  };
  return { ...stored, tally };
}

/**
 * Every case that has been read, with the worklists it is on (overdue, waiting on a provider, near
 * its limits and so on). From the database only: it calls neither Clio nor a model.
 */
export async function listedCases(): Promise<ListedCase[]> {
  const today = new Date().toISOString().slice(0, 10);
  const cases = await listCases();
  return Promise.all(
    cases.map(async (summary) => {
      const [file, stored] = await Promise.all([getCaseFile(summary.matterId), getBrief(summary.matterId)]);
      return { ...summary, lists: file ? worklistsOf(file, stored?.brief ?? null, today) : [] };
    }),
  );
}

