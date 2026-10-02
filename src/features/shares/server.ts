import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getBrief } from "@/features/brief/server";
import { byRef, parseSource, type CaseFile, type Entry, type Evidence } from "@/features/cases/schema";
import { getCaseFile } from "@/features/cases/server";
import { getPageNotes } from "@/features/documents/server";
import { extract } from "@/server/llm";
import { supabase } from "@/server/supabase";
import { buildPrompt, SYSTEM, type MaterialItem, type ProviderMaterial } from "./prompt";
import {
  ATTORNEYS_CALL,
  ContactRef,
  DraftLines,
  LineId,
  MatterId,
  REPLY_LIMIT,
  SECTIONS,
  sectionOf,
  ShareToken,
  UpdateDraft,
  type DraftLine,
  type ProviderUpdate,
  type Reply,
  type ShareStatus,
} from "./schema";

// Updates shared with a treating provider. Two sides live in this file and must stay apart:
// the firm's side (draftUpdate, publishShare, revokeShare, sharesFor, getDraft) reads the case;
// the provider's side (getShareByToken, replyToShare) reads one row's `payload` and nothing else.

const MODEL = "claude-sonnet-5-5";
/** How long a new link works for. */
export const LINK_DAYS = 30;
const DAY_MS = 86_400_000;

/** A request the firm or a provider made that cannot be carried out; `status` is the HTTP status to answer with. */
export class ShareError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ShareError";
  }
}

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
  return { file, contact };
}

// ---- Which entries are about one provider ----

/** Lower case words only, so "P.C." and "PC", or "Rivera's" and "Rivera", compare equal. */
const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// Titles and company forms that come and go when a name is written in a note or a subject line.
const NAME_EXTRAS = new Set(["dr", "mr", "mrs", "ms", "md", "do", "dc", "dpm", "pt", "phd", "pllc", "llc", "llp", "pc", "pa", "inc", "corp", "ltd"]);
const SHARED_MAIL = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com", "icloud.com"]);

/** A contact's name as written in full: as Clio has it, and without titles and company forms. */
function fullNames(contact: Entry): string[] {
  const full = words(contact.title);
  const core = full.split(" ").filter((word) => !NAME_EXTRAS.has(word)).join(" ");
  return [...new Set([full, core])].filter(Boolean);
}

/** The ways a contact is written in the file: its full names and its short form. */
function nameKeys(contact: Entry): string[] {
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

const mentions = (text: string, keys: string[]) => {
  const hay = ` ${words(text)} `;
  return keys.some((key) => hay.includes(` ${key} `));
};

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
 * bottom line and value figures are never put in.
 */
async function materialFor(file: CaseFile, provider: Entry, today: string): Promise<ProviderMaterial> {
  const practice = practiceOf(file, provider);
  const inPractice = new Set(practice.map((entry) => entry.ref));
  const keys = [...new Set(practice.flatMap(nameKeys))];
  const item = (entry: Entry, detail?: string): MaterialItem => ({
    ref: entry.ref,
    date: entry.date,
    title: entry.title,
    text: clip(entry.text),
    detail,
  });

  // A completed task counts as recent by the day it was due, or by the day it was closed when it had none.
  const recently = new Date(Date.parse(today) - 90 * DAY_MS).toISOString().slice(0, 10);
  const tasks = file.entries
    .filter((entry) => entry.kind === "task" && mentions(`${entry.title} ${entry.text}`, keys))
    .filter((entry) => entry.facts.status !== "complete" || (entry.date || String(entry.facts.completedAt ?? "")).slice(0, 10) >= recently)
    .sort(newestFirst)
    .map((entry) => item(entry, entry.facts.status === "complete" ? "A task the firm completed; the date is when it was due." : "An open task at the firm; the date is when it is due."));

  // Only messages this office took part in. The client's own messages with the firm never qualify.
  const messages = file.entries
    .filter((entry) => (entry.kind === "email" || entry.kind === "call") && entry.people.some((name) => mentions(name, keys)))
    .filter((entry) => !entry.people.includes(file.client.name))
    .sort(newestFirst)
    .slice(0, 30)
    .map((entry) => item(entry, `${entry.kind === "call" ? "Phone call" : "Email"} from ${entry.facts.from || "unknown"} to ${entry.facts.to || "unknown"}`));

  const calendar = file.entries
    .filter((entry) => entry.kind === "event" && mentions(`${entry.title} ${entry.text} ${entry.people.join(" ")}`, keys))
    .sort(newestFirst)
    .slice(0, 20)
    .map((entry) => item(entry, entry.date > today ? "On the firm's calendar, upcoming." : "On the firm's calendar, past."));

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
      text: [person.role, person.did].filter(Boolean).join(". "),
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

const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

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

const asReply = (row: Pick<EventRow, "detail" | "at">): Reply => ({
  lineId: typeof row.detail?.lineId === "string" ? row.detail.lineId : null,
  text: typeof row.detail?.text === "string" ? row.detail.text : "",
  at: row.at,
});

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

// ---- The provider's side: the permission boundary ----
// These two functions are all a link can reach. They read one row's `payload` and that row's
// replies, by the hash of the token. They must never read the case file, the brief or the draft.

async function findLive(token: string) {
  if (!ShareToken.safeParse(token).success) return null;
  const { data, error } = await supabase()
    .from("shares")
    .select("id, payload")
    .eq("token_hash", hashOf(token))
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; payload: ProviderUpdate } | null;
}

/**
 * What a provider's link shows: the published update and the replies already sent through it.
 * Null when the link is unknown, withdrawn or expired. Each call is recorded as the page being opened.
 */
export async function getShareByToken(token: string): Promise<{ update: ProviderUpdate; replies: Reply[] } | null> {
  const share = await findLive(token);
  if (!share) return null;
  const db = supabase();
  const [opened, replies] = await Promise.all([
    db.from("share_events").insert({ share_id: share.id, kind: "opened" }),
    db.from("share_events").select("detail, at").eq("share_id", share.id).eq("kind", "replied").order("at", { ascending: true }),
  ]);
  // An open that could not be recorded should not keep the office from its update.
  if (opened.error) console.error(`[shares] could not record an open: ${opened.error.message}`);
  if (replies.error) throw replies.error;
  return { update: share.payload, replies: (replies.data ?? []).map(asReply) };
}

/** Store what a provider's office wrote back to one line of its update. Nothing is written to Clio. */
export async function replyToShare(token: string, lineId: string, text: string): Promise<{ at: string }> {
  const share = await findLive(token);
  if (!share) throw new ShareError("This link is no longer active. Ask the law firm for a new one.", 410);
  valid(LineId, lineId, "The line you are replying to");
  if (!share.payload.lines.some((line) => line.id === lineId)) throw new ShareError("That line is no longer part of this update. Reload the page.", 409);
  const message = String(text ?? "").trim();
  if (!message) throw new ShareError("Write a reply before sending.");
  if (message.length > REPLY_LIMIT) throw new ShareError(`A reply can be at most ${REPLY_LIMIT.toLocaleString("en-US")} characters.`);
  const { data, error } = await supabase()
    .from("share_events")
    .insert({ share_id: share.id, kind: "replied", detail: { lineId, text: message } })
    .select("at")
    .single();
  if (error) throw error;
  return { at: data.at as string };
}

/** The response for a ShareError, in the shape every API error has; null for any other error. */
export function shareErrorResponse(err: unknown): Response | null {
  if (!(err instanceof ShareError)) return null;
  return Response.json({ error: { type: "invalid_request", message: err.message } }, { status: err.status });
}
