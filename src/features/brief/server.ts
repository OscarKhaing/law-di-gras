import { byRef, parseSource, type CaseFile, type Evidence } from "@/features/cases/schema";
import { getCaseFile, listCases } from "@/features/cases/server";
import type { PageNote } from "@/features/documents/schema";
import { getPageNotes } from "@/features/documents/server";
import { extract } from "@/server/llm";
import { supabase } from "@/server/supabase";
import { buildPrompt, SYSTEM } from "./prompt";
import { Brief, LANES, MONEY_KINDS, worklistsOf, type CheckedBrief, type CheckedEvidence, type ListedCase, type StoredBrief } from "./schema";
import { z } from "zod";
import { contactNamed, mentions, nameKeys, nameWords, type Entry } from "@/features/cases/schema";
import { buildFollowUpPrompt, FOLLOW_UP_SYSTEM } from "./prompt";

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


// ---- A follow-up to someone the firm is waiting on ----

// A short letter, so a mid-sized model: it comes back in well under half a minute.
const FOLLOW_UP_MODEL = "claude-sonnet-5-5";

const FollowUp = z.object({
  subject: z.string().describe("The subject line: short and plain, naming the client and what is requested"),
  body: z.string().describe("The email in plain text, under 130 words, from the salutation to the sender's name and firm"),
});

/**
 * A drafted follow-up: the email, who owes the reply as the brief names them (`to`), who the email
 * is written to (`addressee`), whether that is where a cited request of the firm's went (`followsAsk`),
 * and the sources it was drafted from.
 */
export type FollowUpDraft = { subject: string; body: string; to: string; addressee: string; followsAsk: boolean; sources: string[] };

/**
 * Who a name in the brief is: a contact on the matter, the client, or neither. `keys` are the ways
 * that party is written, for telling which messages they sent.
 */
function partyNamed(file: CaseFile, name: string): { contact: Entry | null; isClient: boolean; keys: string[] } {
  const contacts = file.entries.filter((entry) => entry.kind === "contact");
  const contact = contactNamed(file, name);
  if (contact) {
    // A line may name an office and a person at it; a message from either is from that party.
    const named = contacts.filter((other) => other.facts.isClient !== true && mentions(name, nameKeys(other)));
    return { contact, isClient: false, keys: [...new Set([contact, ...named].flatMap(nameKeys))] };
  }
  const client = contacts.find((entry) => entry.ref === file.client.ref) ?? null;
  const keys = client ? nameKeys(client) : [nameWords(file.client.name)].filter(Boolean);
  if (mentions(name, [...keys, "client"])) return { contact: client, isClient: true, keys };
  return { contact: null, isClient: false, keys: [] };
}

/**
 * Draft a follow-up for one of the requests the brief says the firm is waiting on. The model is
 * shown that one request and the entries the brief cites for it, in full, and nothing else of the
 * case: not the brief, not the rest of the file, no figures. The recipient may be an adjuster or
 * the other side's counsel, so what the model has not seen it cannot put in a letter. How often
 * the firm has asked and since when are the brief's reading of the whole file and cannot be checked
 * against these entries alone, so they are left out too. Nothing is saved or sent.
 */
export async function draftFollowUp(matterId: number, index: number, signal?: AbortSignal): Promise<FollowUpDraft> {
  const [file, stored] = await Promise.all([getCaseFile(matterId), getBrief(matterId)]);
  if (!file) throw new Error("This case has not been read from Clio yet.");
  if (!stored) throw new Error("No brief has been written for this case yet.");
  const item = stored.brief.waiting[index];
  if (!item) throw new Error("That request is not in the brief any more. Reload the case and try again.");

  // The entries the request rests on, each once, with the passages quoted from pages of a document.
  const entries = byRef(file);
  const cited = new Map<string, { entry: Entry; passages: { page: number; quote: string }[] }>();
  const sources: string[] = [];
  for (const piece of item.evidence) {
    const { ref, page } = parseSource(piece.source);
    const entry = entries.get(ref);
    if (!entry) continue;
    if (!sources.includes(piece.source)) sources.push(piece.source);
    const held = cited.get(ref) ?? { entry, passages: [] };
    if (entry.kind === "document" && page !== null && piece.quote.trim() !== "") held.passages.push({ page, quote: piece.quote.trim() });
    cited.set(ref, held);
  }
  if (cited.size === 0) {
    throw new Error("The brief cites no entry for this request, so there is nothing to draft a follow-up from. Open the request's sources in the full file instead.");
  }
  // Oldest first; an entry with no date goes last.
  const thread = [...cited.values()].sort((a, b) => (a.entry.date || "9999").localeCompare(b.entry.date || "9999"));

  // The email goes where the firm's last cited request went; with none cited, to whoever the brief
  // says owes the reply. A message counts as the firm's request unless that party sent it or it
  // was sent to the firm.
  const owing = partyNamed(file, item.on);
  const firmKeys = [nameWords(file.firm.user), nameWords(file.firm.name)].filter(Boolean);
  const lastAsk = thread.findLast(
    ({ entry }) =>
      (entry.kind === "email" || entry.kind === "call") &&
      String(entry.facts.to ?? "").trim() !== "" &&
      !mentions(String(entry.facts.to), firmKeys) &&
      !mentions(String(entry.facts.from ?? ""), owing.keys),
  );
  const addressee = lastAsk ? String(lastAsk.entry.facts.to).trim() : owing.isClient ? file.client.name : item.on;
  const recipient = lastAsk ? partyNamed(file, addressee) : owing;
  const treating = recipient.contact !== null && stored.brief.people.some((person) => person.treating && person.contact === recipient.contact?.ref);
  const relation = recipient.isClient
    ? "the firm's own client"
    : treating
      ? "the office of a provider treating the client"
      : "someone outside the firm, who may be an insurer, an adjuster or counsel for another party";

  const result = await extract(FollowUp, {
    system: FOLLOW_UP_SYSTEM,
    prompt: buildFollowUpPrompt({
      today: new Date().toISOString().slice(0, 10),
      sender: { person: file.firm.user, firm: file.firm.name },
      client: file.client.name,
      recipient: { name: addressee, relation, owedBy: owing.isClient ? file.client.name : item.on },
      what: item.what,
      cited: thread,
    }),
    model: FOLLOW_UP_MODEL,
    maxTokens: 8000,
    signal,
  });
  return { subject: result.data.subject.trim(), body: result.data.body.trim(), to: item.on, addressee, followsAsk: lastAsk !== undefined, sources };
}
