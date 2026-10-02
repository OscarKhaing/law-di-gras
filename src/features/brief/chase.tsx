"use client";

import { CallButton } from "@/features/calls/call-button";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { StatusPill, type Tone } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  byRef,
  clioMatterId,
  contactNamed,
  mentions,
  nameKeys,
  nameWords,
  parseSource,
  shortDate,
  type CaseFile,
  type Entry,
} from "@/features/cases/schema";
import { KIND_WORD, daysBetween, fromToday, span } from "@/features/cases/words";
import { fetchJson } from "@/lib/fetch-json";
import { useOpenTab } from "./case-tabs";
import { foldClass, useFold } from "./fold";
import type { CheckedBrief, CheckedEvidence, SectionProps } from "./schema";
import { SourceLinks, useSource } from "./source-panel";

// The chase list: everyone the brief says the firm is waiting on, the one it has left longest
// first, each with the last request the brief cites and a follow-up drafted on demand. A draft is
// only ever text on this page: the reader edits it, copies it and sends it themselves.

/** Past this many days since the last request a row is urgent; past the second, worth a look. */
const LONG_QUIET = 30;
const QUIET = 7;

type Waiting = CheckedBrief["waiting"][number];

/** Who a name in the brief is: a contact on the matter, the client, or neither. */
type Party = { contact: Entry | null; isClient: boolean; keys: string[] };

function partyNamed(file: CaseFile, name: string): Party {
  const contacts = file.entries.filter((entry) => entry.kind === "contact");
  const contact = contactNamed(file, name);
  if (contact) {
    // A line may name an office and a person at it ("Some Clinic / Dr. Lee"); a message from either is theirs.
    const named = contacts.filter((other) => other.facts.isClient !== true && mentions(name, nameKeys(other)));
    return { contact, isClient: false, keys: [...new Set([contact, ...named].flatMap(nameKeys))] };
  }
  const client = contacts.find((entry) => entry.ref === file.client.ref) ?? null;
  const keys = client ? nameKeys(client) : [nameWords(file.client.name)].filter(Boolean);
  if (mentions(name, [...keys, "client"])) return { contact: client, isClient: true, keys };
  return { contact: null, isClient: false, keys: [] };
}

type Row = {
  /** The request's place in the brief, which is how the server finds it. */
  index: number;
  item: Waiting;
  party: Party;
  /** Their part in the case, in a few words, or who the client is by name. */
  role: string;
  /** Whether the brief marks this contact as a provider treating the client. */
  treating: boolean;
  /**
   * Whether a follow-up can be drafted. It follows a request the brief cites; with none cited it is
   * written only to the client or a treating provider, never to another party the brief names,
   * who may be someone the firm may not write to directly. The server holds the same rule.
   */
  canDraft: boolean;
  /** The latest cited entry that is not their own message, and whether it is a message the firm sent. */
  last: Entry | null;
  lastIsAsk: boolean;
  /** The latest cited email or call that they sent. */
  theirs: Entry | null;
  /** Cited sources that are neither of the two above. */
  rest: CheckedEvidence[];
  /** Days since `last`, or since the brief's first request when no cited entry has a date; null when neither. */
  days: number | null;
  daysFrom: "ask" | "entry" | "first" | null;
};

const isMessage = (entry: Entry) => entry.kind === "email" || entry.kind === "call";
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function rowsOf(file: CaseFile, brief: CheckedBrief, today: string): Row[] {
  const entries = byRef(file);
  const firmKeys = [nameWords(file.firm.user), nameWords(file.firm.name)].filter(Boolean);
  const rows = brief.waiting.map((item, index): Row => {
    const party = partyNamed(file, item.on);
    const person = party.contact && !party.isClient ? brief.people.find((one) => one.contact === party.contact?.ref) : undefined;
    const role = party.isClient
      ? mentions(item.on, party.keys) ? "The client" : file.client.name
      : party.contact
        ? person?.role || text(party.contact.facts.role) || party.contact.text
        : "";

    // The dated entries the request rests on, each once, oldest first. A task or calendar entry
    // dated after today is something planned, not something that has happened.
    const refs = [...new Set(item.evidence.map((piece) => parseSource(piece.source).ref))];
    const dated = refs
      .flatMap((ref) => entries.get(ref) ?? [])
      .filter((entry) => entry.date !== "" && entry.date <= today)
      .sort((a, b) => a.date.localeCompare(b.date));
    const fromThem = dated.filter((entry) => isMessage(entry) && mentions(text(entry.facts.from), party.keys));
    const others = dated.filter((entry) => !fromThem.includes(entry));
    // A message counts as the firm's request when it went out to someone: not theirs, not sent to the firm.
    const asks = others.filter((entry) => isMessage(entry) && text(entry.facts.to) !== "" && !mentions(text(entry.facts.to), firmKeys));
    const last = asks.at(-1) ?? others.at(-1) ?? null;
    const theirs = fromThem.at(-1) ?? null;

    const since = shortDate(item.since) ? item.since : "";
    const days = last ? daysBetween(last.date, today) : since ? daysBetween(since, today) : null;
    return {
      index,
      item,
      party,
      role,
      treating: person?.treating === true,
      canDraft: asks.length > 0 || party.isClient || person?.treating === true,
      last,
      lastIsAsk: asks.length > 0,
      theirs,
      rest: item.evidence.filter((piece) => {
        const { ref } = parseSource(piece.source);
        return ref !== last?.ref && ref !== theirs?.ref;
      }),
      days,
      daysFrom: last ? (asks.length > 0 ? "ask" : "entry") : since ? "first" : null,
    };
  });
  // Longest since the last cited request first; a request with no date at all goes last.
  return rows.sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
}

/** "5 times, first on Mar 3", as the brief counted them; "" when the brief gives neither a count nor a date. */
function askedLine(item: Waiting, year: string) {
  const first = shortDate(item.since, item.since.slice(0, 4) !== year);
  if (item.asked >= 2) return `${item.asked} times${first ? `, first on ${first}` : ""}`;
  if (item.asked === 1) return `Once${first ? `, on ${first}` : ""}`;
  return first ? `First on ${first}` : "";
}

function quietWords(row: Row) {
  if (row.days === null) return "";
  const ago = row.days <= 0 ? "today" : `${span(row.days)} ago`;
  if (row.daysFrom === "ask") return `Asked ${ago}`;
  if (row.daysFrom === "entry") return `Last noted ${ago}`;
  return `First asked ${ago}`;
}

const toneOf = (days: number | null): Tone => (days === null ? "neutral" : days > LONG_QUIET ? "urgent" : days > QUIET ? "mild" : "neutral");

// ---- Drafts ----

type Draft = { subject: string; body: string; to: string; addressee: string; followsAsk: boolean; sources: string[] };
type Ready = { status: "ready"; draft: Draft; subject: string; body: string; open: boolean; copied: "" | "yes" | "failed" };
type RowState =
  | { status: "drafting"; startedAt: number; previous: Ready | null }
  | { status: "failed"; message: string; previous: Ready | null }
  | Ready;

const isEdited = (ready: Ready) => ready.subject !== ready.draft.subject || ready.body !== ready.draft.body;

const linkClass =
  "cursor-pointer rounded-sm text-left underline decoration-input underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

/** Everyone the firm is waiting on, with what was last asked of them and a follow-up to send them. */
export function Chase({ file, stored, today }: SectionProps) {
  const rows = rowsOf(file, stored.brief, today);
  const { shown, control } = useFold(rows);
  const [states, setStates] = useState<Record<number, RowState>>({});
  const calls = useRef(new Map<number, AbortController>());

  // A draft still being written when the page is left is stopped.
  useEffect(() => {
    const pending = calls.current;
    return () => pending.forEach((call) => call.abort());
  }, []);

  const put = (index: number, next: RowState | null) =>
    setStates((all) => {
      const { [index]: _dropped, ...kept } = all;
      void _dropped;
      return next ? { ...kept, [index]: next } : kept;
    });
  const change = (index: number, patch: Partial<Ready>) =>
    setStates((all) => {
      const current = all[index];
      return current?.status === "ready" ? { ...all, [index]: { ...current, ...patch } } : all;
    });

  const draft = async (row: Row) => {
    const current = states[row.index];
    if (current?.status === "drafting") return;
    const previous = current?.status === "ready" ? current : (current?.previous ?? null);
    if (
      current?.status === "ready" &&
      isEdited(current) &&
      !window.confirm("Draft this follow-up again? Your changes to the draft will be replaced.")
    ) {
      return;
    }
    const call = new AbortController();
    calls.current.set(row.index, call);
    put(row.index, { status: "drafting", startedAt: Date.now(), previous });
    try {
      const result = await fetchJson<Draft>("/api/brief/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matterId: file.matterId, index: row.index }),
        signal: call.signal,
      });
      // The server drafts from the brief as it is now; this page may be showing an earlier one.
      if (result.to !== row.item.on) {
        throw new Error("The brief has been rewritten since this page was opened. Reload the page, then draft the follow-up again.");
      }
      put(row.index, { status: "ready", draft: result, subject: result.subject, body: result.body, open: true, copied: "" });
    } catch (err) {
      // Cancelled: back to where the reader was, with any earlier draft as they left it.
      if (call.signal.aborted) put(row.index, previous);
      else put(row.index, { status: "failed", message: err instanceof Error ? err.message : String(err), previous });
    }
  };

  const copy = async (index: number, ready: Ready) => {
    let copied: Ready["copied"] = "yes";
    try {
      await navigator.clipboard.writeText(`Subject: ${ready.subject}\n\n${ready.body}`);
    } catch {
      copied = "failed";
    }
    change(index, { copied });
  };

  return (
    <section aria-labelledby="chase-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="chase-heading" className="font-heading text-xl font-semibold tracking-tight">
          Waiting on others
        </h2>
        {rows.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {rows.length === 1 ? "One request" : `${rows.length} requests`} still open in this case, the one left longest first. They
            are the brief&apos;s reading of the file: Clio may hold something later than the entries it cites.
          </p>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="border-y py-3 text-sm text-muted-foreground">
          Nobody owes the firm anything: the brief found no request the firm is still waiting on.
        </p>
      ) : (
        <ul className="divide-y border-y">
          {shown.map((row) => (
            <ChaseRow
              key={row.index}
              row={row}
              file={file}
              stored={stored.brief}
              today={today}
              state={states[row.index]}
              onDraft={() => draft(row)}
              onCancel={() => calls.current.get(row.index)?.abort()}
              onChange={(patch) => change(row.index, patch)}
              onRestore={(ready) => put(row.index, ready)}
              onCopy={(ready) => copy(row.index, ready)}
            />
          ))}
        </ul>
      )}
      {control}
    </section>
  );
}

function ChaseRow({
  row,
  file,
  stored,
  today,
  state,
  onDraft,
  onCancel,
  onChange,
  onRestore,
  onCopy,
}: {
  row: Row;
  file: CaseFile;
  stored: CheckedBrief;
  today: string;
  state: RowState | undefined;
  onDraft: () => void;
  onCancel: () => void;
  onChange: (patch: Partial<Ready>) => void;
  /** Put the row back to an earlier draft, or to no draft at all. */
  onRestore: (ready: Ready | null) => void;
  onCopy: (ready: Ready) => void;
}) {
  const { open, openRef } = useSource();
  const openTab = useOpenTab();
  const { item, party } = row;
  const year = today.slice(0, 4);
  const day = (date: string) => shortDate(date, date.slice(0, 4) !== year);
  // Opening a cited entry marks the passage the brief quoted from it.
  const openEntry = (entry: Entry) =>
    open(item.evidence.find((piece) => parseSource(piece.source).ref === entry.ref) ?? { source: entry.ref, quote: "" });
  const asked = askedLine(item, year);
  const words = quietWords(row);
  const isOpen = state !== undefined && (state.status !== "ready" || state.open);

  return (
    <li className="grid gap-x-6 gap-y-2 py-3 md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] 2xl:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]">
      <div className="min-w-0">
        {party.contact ? (
          <button
            type="button"
            onClick={() => party.contact && openRef(party.contact.ref)}
            className="cursor-pointer rounded-sm text-left font-serif text-base leading-snug font-medium text-pretty decoration-input underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {item.on}
          </button>
        ) : (
          <p className="font-serif text-base leading-snug font-medium text-pretty">{item.on}</p>
        )}
        <p className="text-xs leading-5 text-muted-foreground first-letter:uppercase">
          {row.role || (party.contact ? "" : "Not a contact on the matter in Clio")}
        </p>
      </div>

      <div className="min-w-0 space-y-1.5">
        <p className="text-sm leading-5 text-pretty">{item.what}</p>
        <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs leading-5">
          {(asked || row.rest.length > 0) && (
            <>
              <dt className="text-muted-foreground">{asked ? "Asked" : "Also cited"}</dt>
              <dd className="min-w-0">
                {asked && <>{asked}, as the brief reads the file. </>}
                <SourceLinks evidence={row.rest} />
              </dd>
            </>
          )}
          {row.last && (
            <>
              <dt className="text-muted-foreground">{row.lastIsAsk ? "Last ask cited" : "Last entry cited"}</dt>
              <dd className="min-w-0">
                <button type="button" className={`${linkClass} font-serif text-sm break-words`} onClick={() => row.last && openEntry(row.last)}>
                  {row.last.title || `Untitled ${KIND_WORD[row.last.kind]}`}
                </button>{" "}
                <span className="whitespace-nowrap text-muted-foreground">
                  {KIND_WORD[row.last.kind]}, {day(row.last.date)}
                </span>
              </dd>
            </>
          )}
          {row.theirs && (
            <>
              <dt className="text-muted-foreground">Their last word</dt>
              <dd className="min-w-0">
                <button type="button" className={`${linkClass} font-serif text-sm break-words`} onClick={() => row.theirs && openEntry(row.theirs)}>
                  {row.theirs.title || `Untitled ${KIND_WORD[row.theirs.kind]}`}
                </button>{" "}
                <span className="whitespace-nowrap text-muted-foreground">
                  {KIND_WORD[row.theirs.kind]}, {day(row.theirs.date)}, {fromToday(row.theirs.date, today)}
                </span>
              </dd>
            </>
          )}
          {!row.last && !row.theirs && (
            <>
              <dt className="text-muted-foreground">Last ask cited</dt>
              <dd className="text-muted-foreground">The brief cites no dated entry for this. Look in the full file before chasing.</dd>
            </>
          )}
        </dl>
      </div>

      <div className="flex flex-col items-start gap-1.5 md:items-end">
        {words && <StatusPill tone={toneOf(row.days)}>{words}</StatusPill>}
        {!row.canDraft ? (
          <p className="max-w-[13rem] text-xs leading-snug text-muted-foreground md:text-right">
            No follow-up to draft: the brief cites no message the firm sent about this, and this is not the client or a
            treating provider.{" "}
            <button type="button" className={linkClass} onClick={() => openTab("file")}>
              Look in the full file
            </button>
          </p>
        ) : state?.status === "ready" ? (
          <Button size="sm" variant="outline" aria-expanded={state.open} onClick={() => onChange({ open: !state.open })}>
            {state.open ? "Close the draft" : "Open the draft"}
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={state?.status === "drafting"} onClick={onDraft}>
            {state?.status === "drafting" ? "Drafting" : "Draft a follow-up"}
          </Button>
        )}
        {row.treating && party.contact && (
          <Link href={`/cases/${clioMatterId(file.matterId)}/providers/${party.contact.ref}`} className={foldClass}>
            Prepare update
          </Link>
        )}
        {party.contact && (
          <CallButton
            matterId={clioMatterId(file.matterId)}
            contactRef={party.contact.ref}
            contactName={party.contact.title}
            phone={String(party.contact.facts.phone ?? "")}
          />
        )}
      </div>

      {state && isOpen && (
        <div className="rounded-xl bg-muted/60 p-4 md:col-span-2 md:col-start-2">
          {state.status === "drafting" && (
            <div role="status" className="space-y-3">
              <p className="text-sm">
                Drafting a follow-up from the entries the brief cites for this request.{" "}
                <Elapsed startedAt={state.startedAt} />
              </p>
              <div className="space-y-2" aria-hidden>
                <Skeleton className="h-8 w-2/3 bg-card" />
                <Skeleton className="h-28 w-full bg-card" />
              </div>
              <p className="text-xs text-muted-foreground">
                Usually under half a minute.{" "}
                <button type="button" className={linkClass} onClick={onCancel}>
                  Cancel
                </button>
              </p>
            </div>
          )}
          {state.status === "failed" && (
            <div role="alert" className="border-l-2 border-destructive px-3 py-1 text-sm">
              <p className="font-medium text-destructive">The follow-up could not be drafted</p>
              <p className="mt-1 text-muted-foreground">{state.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="bg-card" onClick={onDraft}>
                  Try again
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onRestore(state.previous)}>
                  {state.previous ? "Back to the earlier draft" : "Close"}
                </Button>
              </div>
            </div>
          )}
          {state.status === "ready" && (
            <DraftForm
              ready={state}
              item={item}
              file={file}
              stored={stored}
              onChange={onChange}
              onDraft={onDraft}
              onCopy={() => onCopy(state)}
            />
          )}
        </div>
      )}
    </li>
  );
}

/** Seconds since a draft was asked for, so the wait visibly moves. */
function Elapsed({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className="text-muted-foreground tabular-nums">{Math.max(0, Math.round((now - startedAt) / 1000))} s</span>;
}

const fieldClass = "bg-card font-serif text-[15px] md:text-[15px]";

/** A drafted follow-up: who it is to, its subject and message to edit, what it was drafted from, and the copy. */
function DraftForm({
  ready,
  item,
  file,
  stored,
  onChange,
  onDraft,
  onCopy,
}: {
  ready: Ready;
  item: Waiting;
  file: CaseFile;
  stored: CheckedBrief;
  onChange: (patch: Partial<Ready>) => void;
  onDraft: () => void;
  onCopy: () => void;
}) {
  const id = useId();
  const { draft } = ready;
  // Who the email is written to: where the firm's last cited request went, which is not always
  // the party the brief names as owing the reply.
  const recipient = partyNamed(file, draft.addressee);
  const email = recipient.contact ? text(recipient.contact.facts.email) : "";
  // The address belongs to the contact in Clio, who may be only one of the parties a line names.
  const emailIsTheirs = recipient.contact !== null && nameWords(recipient.contact.title) === nameWords(draft.addressee);
  const treating = recipient.contact !== null && stored.people.some((person) => person.treating && person.contact === recipient.contact?.ref);
  const sources = draft.sources.map((source) => item.evidence.find((piece) => piece.source === source) ?? { source, quote: "" });

  return (
    <div className="space-y-3">
      <dl className="grid gap-x-4 gap-y-2.5 text-sm sm:grid-cols-[5.5rem_minmax(0,1fr)]">
        <dt className="text-muted-foreground">To</dt>
        <dd className="min-w-0">
          <span className="font-serif text-[15px] break-words">
            {draft.addressee}
            {email && emailIsTheirs && `, ${email}`}
          </span>
          {email && !emailIsTheirs && (
            <span className="block text-xs text-muted-foreground">
              Clio holds <span className="font-serif text-[13px] text-foreground">{email}</span> for{" "}
              <span className="font-serif text-[13px] text-foreground">{recipient.contact?.title}</span>.
            </span>
          )}
          {draft.followsAsk
            ? draft.addressee !== draft.to && (
                <span className="block text-xs text-muted-foreground">Where the last ask the brief cites was sent.</span>
              )
            : !recipient.isClient && (
                <span className="block text-xs text-muted-foreground">
                  The brief cites no message the firm sent about this, so the draft is addressed to whoever the brief names. Look in
                  the full file for who was asked.
                </span>
              )}
          {!recipient.isClient && !treating && (
            <span className="block text-xs text-muted-foreground">
              Not the client or a treating provider. Check who the firm may write to before sending it.
            </span>
          )}
        </dd>
        <dt className="text-muted-foreground sm:pt-1.5">
          <label htmlFor={`${id}-subject`}>Subject</label>
        </dt>
        <dd>
          <Input
            id={`${id}-subject`}
            className={fieldClass}
            value={ready.subject}
            onChange={(event) => onChange({ subject: event.target.value, copied: "" })}
          />
        </dd>
        <dt className="text-muted-foreground sm:pt-1.5">
          <label htmlFor={`${id}-body`}>Message</label>
        </dt>
        <dd>
          <Textarea
            id={`${id}-body`}
            className={`${fieldClass} leading-relaxed`}
            value={ready.body}
            onChange={(event) => onChange({ body: event.target.value, copied: "" })}
          />
        </dd>
        <dt className="text-muted-foreground">Drafted from</dt>
        <dd className="min-w-0 text-xs leading-5 text-muted-foreground">
          <SourceLinks evidence={sources} />
          <span className="block">Written by a model from these entries alone. Read it against them before you use it.</span>
        </dd>
      </dl>
      <div className="space-y-2 sm:pl-[6.5rem]">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onCopy}>
            {ready.copied === "yes" && <CheckIcon />}
            {ready.copied === "yes" ? "Copied" : "Copy subject and message"}
          </Button>
          <Button size="sm" variant="outline" className="bg-card" onClick={onDraft}>
            Draft again
          </Button>
          {isEdited(ready) && (
            <Button size="sm" variant="ghost" onClick={() => onChange({ subject: draft.subject, body: draft.body, copied: "" })}>
              Undo my changes
            </Button>
          )}
        </div>
        {ready.copied === "failed" && (
          <p role="alert" className="text-xs text-destructive">
            The browser would not copy it. Select the subject and the message and copy them yourself.
          </p>
        )}
        <p className="text-xs text-muted-foreground">Nothing is sent and nothing is written to Clio.</p>
      </div>
    </div>
  );
}
