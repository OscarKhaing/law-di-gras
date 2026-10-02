import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getBrief } from "@/features/brief/server";
import { byRef, fullNames, mentions, nameKeys, parseSource, type CaseFile, type Entry, type Evidence } from "@/features/cases/schema";
import { getCaseFile } from "@/features/cases/server";
import { getPageNotes } from "@/features/documents/server";
import { extract } from "@/server/llm";
import { supabase } from "@/server/supabase";
import { asReply, hashOf, ShareError } from "./link";
import { buildPrompt, SYSTEM, type MaterialItem, type ProviderMaterial } from "./prompt";
import {
  ATTORNEYS_CALL,
  ContactRef,
  DraftLines,
  MatterId,
  SECTIONS,
  sectionOf,
  UpdateDraft,
  type DraftLine,
  type ProviderUpdate,
  type ShareStatus,
} from "./schema";

// Updates shared with a treating provider: the firm's side. Everything here may read the case
// (draftUpdate, publishShare, revokeShare, sharesFor, getDraft). The provider's side is link.ts,
// which reads one share's published update and nothing else, and never imports this file.

// The firm's routes answer a refused request the same way the provider's do.
export { ShareError, shareErrorResponse } from "./link";

const MODEL = "claude-sonnet-5-5";
/** How long a new link works for. */
export const LINK_DAYS = 30;
const DAY_MS = 86_400_000;

function valid<T extends z.ZodType>(schema: T, value: unknown, what: string): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ShareError(`${what} is not valid.`);
  return parsed.data;
}

async function caseAndProvider(matterId: number, contactRef: string) {
  valid(MatterId, matterId, "The case number");
  valid(ContactRef, contactRef, "The provider");
  const file = await getCaseFile(matterId);
  if (!file) throw new ShareError("This case has not been read from Clio yet.", 404);
  const contact = file.entries.find((entry) => entry.kind === "contact" && entry.ref === contactRef);
  if (!contact) throw new ShareError("That provider is not a contact on this case.", 404);
  if (contact.facts.isClient === true) throw new ShareError("An update is shared with a provider, not with the client.");
  // The brief says who is treating the client. Once it is written, nobody else on the case (the
  // other side, an insurer, a witness) can be drafted for or published to, whatever the screen shows.
  const stored = await getBrief(matterId);
  const treating = stored?.brief.people.some((person) => person.treating && parseSource(person.contact).ref === contactRef);
  if (stored && !treating) throw new ShareError("An update goes only to an office that is treating the client.");
  return { file, contact };
}

// ---- Which entries are about one provider ----

const SHARED_MAIL = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com", "icloud.com"]);

const mailDomain = (contact: Entry) => {
  const domain = String(contact.facts.email ?? "").split("@")[1]?.toLowerCase() ?? "";
  return domain && !SHARED_MAIL.has(domain) ? domain : "";
};

/**
 * The provider and the contacts who belong to the same practice. Two contacts belong together when
 * Clio lists one as the other's company, when they write from the same email domain, or when the
 * role of one names the other. Nothing here knows any name: it all comes from the contact entries.
 */
function practiceOf(file: CaseFile, provider: Entry): Entry[] {
  const others = file.entries.filter(
    (entry) => entry.kind === "contact" && entry.facts.isClient !== true && entry.ref !== provider.ref,
  );
  const keys = fullNames(provider); // full names only; a surname is too loose to link two contacts
  const domain = mailDomain(provider);
  const together = (other: Entry) =>
    other.people.some((name) => mentions(name, keys)) ||
    provider.people.some((name) => mentions(name, fullNames(other))) ||
    (domain !== "" && mailDomain(other) === domain) ||
    mentions(other.text, keys) ||
    mentions(provider.text, fullNames(other));
  return [provider, ...others.filter(together)];
}

const clip = (text: string, max = 1500) => (text.length > max ? `${text.slice(0, max)} […]` : text);
const newestFirst = (a: Entry, b: Entry) => b.date.localeCompare(a.date);

/**
 * Everything the drafting model may read for one provider. This is an allowlist: an entry is
 * included because it is this provider's own business, never because it is in the file. Notes,
 * custom fields, the client's messages with the firm, expenses, and the brief's flags, decisions,
 * bottom line and value figures are never put in. Of the firm's own working entries (tasks,
 * calendar entries, notes of phone calls) only the heading and the date are put in.
 */
async function materialFor(file: CaseFile, provider: Entry, today: string): Promise<ProviderMaterial> {
  const practice = practiceOf(file, provider);
  const inPractice = new Set(practice.map((entry) => entry.ref));
  const keys = [...new Set(practice.flatMap(nameKeys))];
  // The whole entry: only for what this office has itself read or written (its contact, its emails).
  const whole = (entry: Entry, detail?: string): MaterialItem => ({
    ref: entry.ref,
    date: entry.date,
    title: entry.title,
    text: clip(entry.text),
    detail,
  });
  // The heading alone. A task's description, a calendar entry's description and the firm's note of a
  // phone call are written for the firm and can hold its reasoning, so the model is never shown them.
  const headingOnly = (entry: Entry, detail: string): MaterialItem => ({ ref: entry.ref, date: entry.date, title: entry.title, text: "", detail });
  // Named where the office is the subject: in the heading or among the people, not in the firm's description.
  const named = (entry: Entry) => mentions(entry.title, keys) || entry.people.some((name) => mentions(name, keys));

  // A completed task counts as recent by the day it was due, or by the day it was closed when it had none.
  const recently = new Date(Date.parse(today) - 90 * DAY_MS).toISOString().slice(0, 10);
  const tasks = file.entries
    .filter((entry) => entry.kind === "task" && named(entry))
    .filter((entry) => entry.facts.status !== "complete" || (entry.date || String(entry.facts.completedAt ?? "")).slice(0, 10) >= recently)
    .sort(newestFirst)
    .map((entry) => headingOnly(entry, entry.facts.status === "complete" ? "A task the firm completed; the date is when it was due." : "An open task at the firm; the date is when it is due."));

  // Only messages this office took part in. The client's own messages with the firm never qualify.
  // An email is given in full, since the office has read it; of a phone call only the subject is given.
  const messages = file.entries
    .filter((entry) => (entry.kind === "email" || entry.kind === "call") && entry.people.some((name) => mentions(name, keys)))
    .filter((entry) => !entry.people.includes(file.client.name))
    .sort(newestFirst)
    .slice(0, 30)
    .map((entry) => {
      const between = `from ${entry.facts.from || "unknown"} to ${entry.facts.to || "unknown"}`;
      return entry.kind === "call" ? headingOnly(entry, `Phone call ${between}; only its subject is given`) : whole(entry, `Email ${between}`);
    });

  const calendar = file.entries
    .filter((entry) => entry.kind === "event" && named(entry))
    .sort(newestFirst)
    .slice(0, 20)
    .map((entry) => headingOnly(entry, entry.date > today ? "On the firm's calendar, upcoming." : "On the firm's calendar, past."));

  // What the firm holds from this office, from the page index: kinds of pages and the dates they span.
  const entries = byRef(file);
  const held: MaterialItem[] = [];
  for (const [ref, notes] of Object.entries(await getPageNotes(file.matterId))) {
    const mine = notes.filter((note) => note.provider && mentions(note.provider, keys));
    if (!mine.length || !entries.has(ref)) continue;
    const kinds = new Map<string, number>();
    for (const note of mine) kinds.set(note.kind || "page", (kinds.get(note.kind || "page") ?? 0) + 1);
    const dates = mine.map((note) => note.date).filter(Boolean).sort();
    held.push({
      ref,
      date: "",
      title: `${mine.length} ${mine.length === 1 ? "page" : "pages"} from this office in one document the firm holds`,
      text: [
        `Kinds of pages: ${[...kinds].map(([kind, count]) => `${count} ${kind}`).join(", ")}.`,
        dates.length ? `Dated from ${dates[0]} to ${dates.at(-1)}.` : "No dates on these pages.",
      ].join(" "),
    });
  }

  // Bare facts from the stored brief: who else is treating, and the coverage figures. Each carries
  // the sources the brief gave for it, so a drafted line can be opened at its source.
  const stored = await getBrief(file.matterId);
  const sources = (contactRef: string | null, evidence: { source: string; found: boolean }[]) =>
    [...new Set([...(contactRef ? [contactRef] : []), ...evidence.filter((piece) => piece.found).map((piece) => piece.source)])].join(", ");
  const others = (stored?.brief.people ?? [])
    .filter((person) => person.treating && !inPractice.has(person.contact) && entries.has(person.contact))
    .map((person) => ({
      ref: sources(person.contact, person.evidence),
      date: "",
      title: entries.get(person.contact)!.title,
      // The kind of care only. What the brief says they did, found or billed is not this office's business.
      text: person.role,
    }));
  const coverage = (stored?.brief.money ?? [])
    .filter((figure) => figure.kind === "coverage")
    .map((figure) => ({
      ref: sources(null, figure.evidence),
      date: "",
      title: figure.label,
      text: `$${figure.amount.toLocaleString("en-US")}`,
    }))
    .filter((figure) => figure.ref !== "");

  return {
    today,
    firm: file.firm.name,
    patient: file.client.name,
    provider: { ref: provider.ref, date: "", title: provider.title, text: provider.text },
    staff: practice.slice(1).map((entry) => ({ ref: entry.ref, date: "", title: entry.title, text: entry.text })),
    status: file.status,
    stage: file.stage,
    stages: file.stages,
    tasks,
    messages,
    calendar,
    held,
    others,
    coverage,
  };
}

const flatten = (text: string) => text.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/**
 * Keep only evidence that points at something the model was given, and only quotes that really are
 * in that entry. A quote that cannot be checked here (a page of a document) is dropped; the source stays.
 */
function checkEvidence(evidence: Evidence, file: CaseFile, material: ProviderMaterial): Evidence {
  const given = new Set(
    [material.provider, ...material.staff, ...material.tasks, ...material.messages, ...material.calendar, ...material.held, ...material.others, ...material.coverage]
      .flatMap((item) => item.ref.split(","))
      .map((source) => parseSource(source).ref),
  );
  const entries = byRef(file);
  const seen = new Set<string>();
  return evidence.flatMap((piece) => {
    const { ref, page } = parseSource(piece.source);
    const entry = entries.get(ref);
    const source = page === null ? ref : `${ref} p.${page}`;
    if (!entry || !given.has(ref) || seen.has(source)) return [];
    seen.add(source);
    const quote = piece.quote.trim();
    const found = quote !== "" && page === null && flatten(`${entry.title}\n${entry.text}`).includes(flatten(quote));
    return [{ source, quote: found ? quote : "" }];
  });
}

/**
 * Draft the lines of an update for one provider. The model is given the allowlisted material and
 * nothing else; lines that are the attorney's call come back switched off. Takes up to a minute.
 */
export async function draftUpdate(matterId: number, contactRef: string, signal?: AbortSignal): Promise<DraftLine[]> {
  const { file, contact } = await caseAndProvider(matterId, contactRef);
  const material = await materialFor(file, contact, new Date().toISOString().slice(0, 10));
  const result = await extract(UpdateDraft, { system: SYSTEM, prompt: buildPrompt(material), model: MODEL, signal });
  return result.data.lines
    .map((line) => {
      const section = sectionOf(line.section);
      // A whole section can be the attorney's call whatever the model said about the line.
      const yourCall = line.yourCall || ATTORNEYS_CALL.includes(section);
      return {
        id: randomBytes(6).toString("base64url"),
        section,
        text: line.text.trim(),
        yourCall,
        evidence: checkEvidence(line.evidence, file, material),
        share: !yourCall,
      };
    })
    .filter((line) => line.text !== "")
    .sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section));
}

/** What `draftUpdate` would show the model, for checking the allowlist without calling a model. */
export async function previewMaterial(matterId: number, contactRef: string) {
  const { file, contact } = await caseAndProvider(matterId, contactRef);
  const material = await materialFor(file, contact, new Date().toISOString().slice(0, 10));
  return { material, prompt: buildPrompt(material) };
}

// ---- Publishing ----

/**
 * The top of an update: who it is from, who it is about and where the case stands. Publishing and
 * the attorney's preview both use this, so the preview shows what the provider's page will.
 */
export function updateHead(file: CaseFile, contact: Entry): Pick<ProviderUpdate, "firm" | "contactLine" | "patient" | "provider" | "stage" | "stages"> {
  return {
    firm: file.firm.name,
    contactLine: [file.firm.user, file.firm.email].filter(Boolean).join(", "),
    patient: file.client.name,
    provider: contact.title,
    stage: file.stage,
    stages: file.stages,
  };
}

/** The update currently live for a provider on a case: not withdrawn and not expired. */
async function liveShare(matterId: number, contactRef: string) {
  const { data, error } = await supabase()
    .from("shares")
    .select("id, expires_at, draft")
    .eq("matter_id", matterId)
    .eq("contact_ref", contactRef)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; expires_at: string; draft: DraftLine[] | null } | null;
}

/**
 * Publish an update to one provider. Only lines switched on are frozen into the payload, and the
 * payload carries no refs and no Clio ids. A new link's token is returned once and never stored
 * (only its hash is). Publishing again while a link is live changes what that link shows and
 * returns `token: null`: the link the provider already has stays the same.
 */
export async function publishShare(
  matterId: number,
  contactRef: string,
  lines: DraftLine[],
): Promise<{ token: string | null; expiresAt: string; shareId: string }> {
  const { file, contact } = await caseAndProvider(matterId, contactRef);
  const draft: DraftLine[] = valid(DraftLines, lines, "The update").map((line) => ({ ...line, section: sectionOf(line.section) }));
  const shared = draft
    .filter((line) => line.share && line.text.trim() !== "")
    .sort((a, b) => SECTIONS.indexOf(sectionOf(a.section)) - SECTIONS.indexOf(sectionOf(b.section)))
    .map((line) => ({ id: line.id, section: line.section, text: line.text.trim() }));
  if (!shared.length) throw new ShareError("Switch on at least one line before publishing.");

  const live = await liveShare(matterId, contactRef);
  const now = new Date();
  const expiresAt = live ? new Date(live.expires_at).toISOString() : new Date(now.getTime() + LINK_DAYS * DAY_MS).toISOString();
  const payload: ProviderUpdate = {
    ...updateHead(file, contact),
    lines: shared,
    publishedAt: now.toISOString(),
    expiresAt,
  };

  if (live) {
    const { error } = await supabase()
      .from("shares")
      .update({ draft, payload, contact_name: contact.title, published_at: payload.publishedAt })
      .eq("id", live.id);
    if (error) throw error;
    return { token: null, expiresAt, shareId: live.id };
  }

  const token = randomBytes(32).toString("base64url");
  const { data, error } = await supabase()
    .from("shares")
    .insert({
      matter_id: matterId,
      contact_ref: contactRef,
      contact_name: contact.title,
      token_hash: hashOf(token),
      draft,
      payload,
      published_at: payload.publishedAt,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { token, expiresAt, shareId: data.id as string };
}

/** Withdraw a link. The provider's page stops working at once; the row and its replies are kept. */
export async function revokeShare(shareId: string): Promise<{ revoked: boolean }> {
  valid(z.uuid(), shareId, "The update");
  const { data, error } = await supabase()
    .from("shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareId)
    .is("revoked_at", null)
    .select("id");
  if (error) throw error;
  return { revoked: (data ?? []).length > 0 };
}

/** The lines as the attorney last left them for a provider's live update, or null when none is live. */
export async function getDraft(matterId: number, contactRef: string): Promise<DraftLine[] | null> {
  valid(MatterId, matterId, "The case number");
  valid(ContactRef, contactRef, "The provider");
  return (await liveShare(matterId, contactRef))?.draft ?? null;
}

type EventRow = { share_id: string; kind: string; detail: { lineId?: unknown; text?: unknown } | null; at: string };

/** Every update shared from a case, newest first, with how often it was opened and what came back. */
export async function sharesFor(matterId: number): Promise<ShareStatus[]> {
  valid(MatterId, matterId, "The case number");
  const db = supabase();
  const { data: shares, error } = await db
    .from("shares")
    .select("id, contact_ref, contact_name, published_at, expires_at, revoked_at")
    .eq("matter_id", matterId)
    .order("published_at", { ascending: false });
  if (error) throw error;
  if (!shares?.length) return [];
  const { data: events, error: failed } = await db
    .from("share_events")
    .select("share_id, kind, detail, at")
    .in("share_id", shares.map((share) => share.id))
    .order("at", { ascending: true });
  if (failed) throw failed;
  return shares.map((share) => {
    const mine = ((events ?? []) as EventRow[]).filter((event) => event.share_id === share.id);
    const opens = mine.filter((event) => event.kind === "opened");
    return {
      id: share.id,
      contactRef: share.contact_ref,
      contactName: share.contact_name,
      publishedAt: share.published_at,
      expiresAt: share.expires_at,
      revoked: share.revoked_at !== null,
      opens: opens.length,
      lastOpenedAt: opens.at(-1)?.at ?? null,
      replies: mine.filter((event) => event.kind === "replied").map(asReply),
    };
  });
}

/**
 * The lines each update to one provider showed, by share id, as they were published. The firm's log
 * uses it to show which request a reply answers, in the words the office read.
 */
export async function publishedLines(matterId: number, contactRef: string): Promise<Record<string, { id: string; text: string }[]>> {
  valid(MatterId, matterId, "The case number");
  valid(ContactRef, contactRef, "The provider");
  const { data, error } = await supabase().from("shares").select("id, payload").eq("matter_id", matterId).eq("contact_ref", contactRef);
  if (error) throw error;
  return Object.fromEntries(
    ((data ?? []) as { id: string; payload: ProviderUpdate | null }[]).map((share) => [
      share.id,
      (share.payload?.lines ?? []).map((line) => ({ id: line.id, text: line.text })),
    ]),
  );
}
