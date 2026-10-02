"use client";

import {
  CalendarDays,
  CircleAlert,
  FileText,
  Mail,
  Phone,
  Receipt,
  SquareCheck,
  StickyNote,
  Tag,
  User,
  type LucideIcon,
} from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Quote, decodeEntities } from "@/components/quote";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { byRef, parseSource, shortDate, type CaseFile, type Entry, type EntryKind } from "@/features/cases/schema";
import { KIND_WORD, dollars } from "@/features/cases/words";
import type { DocumentSource } from "@/features/documents/schema";
import { SourceViewer } from "@/features/documents/source-viewer";
import { postJson } from "@/lib/fetch-json";
import { cn } from "@/lib/utils";

// Contract for every section of the brief page.
// - Wrap the page in <SourceProvider file={file}>.
// - After any statement, render <SourceLinks evidence={item.evidence} /> to list where it came from
//   as small chips (add `quotes` to write the passages out instead); selecting one opens the source
//   panel on that entry, or on that page of the document.
// - For an entry of the case file itself, call useSource().openRef(entry.ref).

export type SourceEvidence = { source: string; quote: string; found?: boolean };

type SourceApi = {
  /** Open the panel on one piece of evidence: the entry, with the quote marked, or the document page. */
  open: (evidence: SourceEvidence) => void;
  /** Open the panel on an entry of the case file by its ref, e.g. "N12". */
  openRef: (ref: string) => void;
};

type SourceState = SourceApi & {
  entries: Map<string, Entry>;
  /** The year the case was read in: dates in another year are written with theirs. */
  year: string;
};

const SourceContext = createContext<SourceState>({ open: () => {}, openRef: () => {}, entries: new Map(), year: "" });

export function useSource(): SourceApi {
  const { open, openRef } = useContext(SourceContext);
  return useMemo(() => ({ open, openRef }), [open, openRef]);
}

// ---- Words ----

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A file name without its extension, cut to fit a line of sources. A long name keeps its end,
 * from a word boundary: the folder-like start of a file name says least about what it is.
 */
function shortName(name: string, length = 40) {
  const bare = name
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/_+/g, " ")
    .trim();
  if (bare.length <= length) return bare;
  const tail = bare.slice(bare.length - length + 1);
  const boundary = tail.search(/[\s-]/);
  return `…${boundary >= 0 && boundary < 12 ? tail.slice(boundary + 1) : tail}`;
}

function dated(entry: Entry, year: string) {
  return shortDate(entry.date, entry.date.slice(0, 4) !== year);
}

/** A source in the firm's words: "note, Sep 27", "calendar, Oct 21", a field's name, a file and its page. */
function sourceLabel(entry: Entry, page: number | null, year: string) {
  if (entry.kind === "field" || entry.kind === "contact") return entry.title;
  if (entry.kind === "document") return page ? `${shortName(entry.title)} p. ${page}` : shortName(entry.title);
  if (entry.kind === "task" || entry.kind === "expense") return KIND_WORD[entry.kind];
  const date = dated(entry, year);
  return date ? `${KIND_WORD[entry.kind]}, ${date}` : KIND_WORD[entry.kind];
}

/** Clio keeps some text as simple HTML. Turn it into plain lines; it is only ever shown as text. */
function plainText(text: string) {
  return decodeEntities(
    text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<\/?[a-z][^<>]*>/gi, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Find a quote in a text whatever the spacing, line breaks or style of quotation mark. */
function locate(text: string, quote: string): { start: number; end: number } | null {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const pattern = words
    .map((word) =>
      word
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/['‘’]/g, "['‘’]")
        .replace(/["“”]/g, '["“”]'),
    )
    .join("\\s+");
  const match = new RegExp(pattern, "i").exec(text);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

function moment(value: unknown) {
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : dateTime.format(date);
}

const fact = (entry: Entry, key: string) => {
  const value = entry.facts[key];
  return value === undefined || value === "" ? "" : String(value);
};

/** The details worth a line above the text, by kind of entry. */
function details(entry: Entry): [string, string][] {
  const people = entry.people.join(", ");
  const rows: [string, string][] = [];
  switch (entry.kind) {
    case "email":
    case "call":
      rows.push(["From", fact(entry, "from")], ["To", fact(entry, "to")]);
      if (!fact(entry, "from") && !fact(entry, "to")) rows.push(["Between", people]);
      break;
    case "task":
      rows.push(
        ["Due", shortDate(entry.date, true)],
        ["Status", fact(entry, "status")],
        ["Completed", fact(entry, "completedAt") && shortDate(fact(entry, "completedAt"), true)],
        ["Priority", fact(entry, "priority")],
        ["Assigned to", people],
      );
      break;
    case "event":
      rows.push(
        ["Starts", moment(entry.facts.startAt)],
        ["Ends", moment(entry.facts.endAt)],
        ["Where", fact(entry, "location")],
        ["With", people],
      );
      break;
    case "expense":
      rows.push(["Amount", fact(entry, "amount") && dollars(Number(entry.facts.amount))], ["Entered by", people]);
      break;
    case "document":
      rows.push(["Folder", fact(entry, "folder")], ["Pages", fact(entry, "pages")], ["Added by", people]);
      break;
    case "contact":
      rows.push(["Email", fact(entry, "email")], ["Phone", fact(entry, "phone")]);
      break;
    case "note":
      rows.push(["Written by", people]);
      break;
    case "field":
      break;
  }
  return rows.filter(([, value]) => value !== "");
}

// ---- The links under a statement ----

const linkClass =
  "cursor-pointer rounded-sm underline decoration-input underline-offset-2 outline-none hover:text-foreground hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

/** The sources of one statement: each quoted passage as a marker stroke, each source as a small link. */
const KIND_ICON: Record<EntryKind, LucideIcon> = {
  note: StickyNote,
  email: Mail,
  call: Phone,
  task: SquareCheck,
  event: CalendarDays,
  expense: Receipt,
  document: FileText,
  field: Tag,
  contact: User,
};

const chipClass =
  "inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs text-muted-foreground outline-none transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * Where a statement came from. By default each source is a small chip: pointing at it shows the
 * quoted passage, selecting it opens the source panel. With `quotes`, the passages are written out
 * one under the other, for the places where reading them against each other is the point.
 */
export function SourceLinks({ evidence, quotes = false }: { evidence: SourceEvidence[]; quotes?: boolean }) {
  const { entries, open, year } = useContext(SourceContext);
  const seen = new Set<string>();
  const items = evidence.flatMap((item) => {
    const { ref, page } = parseSource(item.source);
    const entry = entries.get(ref);
    const key = `${ref} ${page ?? ""} ${item.quote}`;
    if (!entry || seen.has(key)) return [];
    seen.add(key);
    return [{ item, key, kind: entry.kind, label: sourceLabel(entry, page, year), quote: decodeEntities(item.quote).trim() }];
  });
  if (items.length === 0) return null;

  if (!quotes) {
    return (
      <span className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {items.map(({ item, key, kind, label, quote }) => {
          const missing = item.found === false;
          const Icon = missing ? CircleAlert : KIND_ICON[kind];
          const chip = (
            <button
              type="button"
              aria-label={quote ? `Open ${label}: “${quote}”` : `Open ${label}`}
              className={cn(chipClass, missing && "border-mild bg-mild-soft text-mild-ink hover:text-mild-ink")}
              onClick={() => open(item)}
            >
              <Icon aria-hidden className="size-3 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          );
          if (!quote) return <span key={key}>{chip}</span>;
          return (
            <Tooltip key={key}>
              <TooltipTrigger render={chip} />
              <TooltipContent className="block max-w-sm px-3 py-2 leading-relaxed">
                <Quote text={quote} lit />
                {missing && <span className="mt-1 block">Not found word for word in the source.</span>}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </span>
    );
  }

  const quoted = items.filter((entry) => entry.quote !== "");
  const plain = items.filter((entry) => entry.quote === "");

  return (
    <span className="block space-y-1 text-xs leading-relaxed text-muted-foreground">
      {quoted.map(({ item, key, label, quote }) =>
        item.found === false ? (
          <span key={key} className="block">
            <span className="font-serif text-[13px] text-foreground">“{quote}”</span>{" "}
            <button type="button" className={linkClass} onClick={() => open(item)}>
              {label}
            </button>
            , not found word for word in the source
          </span>
        ) : (
          <span key={key} className="block">
            <button
              type="button"
              aria-label={`Open ${label}: ${quote}`}
              className="group/quote cursor-pointer rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => open(item)}
            >
              <Quote text={quote} />
            </button>{" "}
            <span className="whitespace-nowrap">{label}</span>
          </span>
        ),
      )}
      {plain.length > 0 && (
        <span className="block">
          {plain.map(({ item, key, label }, index) => (
            <span key={key}>
              {index > 0 && ", "}
              <button type="button" className={linkClass} onClick={() => open(item)}>
                {label}
              </button>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

// ---- The panel ----

type Shown = { evidence: SourceEvidence; nonce: number };

export function SourceProvider({ file, children }: { file: CaseFile; children: ReactNode }) {
  const entries = useMemo(() => byRef(file), [file]);
  const year = file.syncedAt.slice(0, 4);
  const [shown, setShown] = useState<Shown | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback((evidence: SourceEvidence) => {
    setShown((previous) => ({ evidence, nonce: (previous?.nonce ?? 0) + 1 }));
    setIsOpen(true);
  }, []);
  const openRef = useCallback((ref: string) => open({ source: ref, quote: "" }), [open]);
  const value = useMemo(() => ({ open, openRef, entries, year }), [open, openRef, entries, year]);

  const target = shown ? parseSource(shown.evidence.source) : null;
  const entry = target ? entries.get(target.ref) : undefined;
  const isDocument = entry?.kind === "document";

  return (
    <SourceContext.Provider value={value}>
      {children}
      <Sheet open={isOpen} onOpenChange={(next) => setIsOpen(next)}>
        <SheetContent
          className={cn(
            "gap-0 data-[side=right]:w-full",
            isDocument ? "data-[side=right]:sm:max-w-[min(84rem,94vw)]" : "data-[side=right]:sm:max-w-xl",
          )}
        >
          {shown && target && !entry && (
            <SheetHeader>
              <SheetTitle className="text-xl">This source is not in the case file</SheetTitle>
              <SheetDescription>
                The brief points at an entry that was not read from Clio. Check Clio, then update the brief.
              </SheetDescription>
            </SheetHeader>
          )}
          {shown && target && entry && !isDocument && (
            <EntryPane key={shown.nonce} entry={entry} evidence={shown.evidence} />
          )}
          {shown && target && entry && isDocument && (
            <DocumentPane
              key={shown.nonce}
              matterId={file.matterId}
              entry={entry}
              page={target.page}
              evidence={shown.evidence}
              nonce={shown.nonce}
            />
          )}
        </SheetContent>
      </Sheet>
    </SourceContext.Provider>
  );
}

function PaneHeader({ entry }: { entry: Entry }) {
  // A task's date is its due date, which has its own line below.
  const date = entry.kind === "task" ? "" : shortDate(entry.date, true);
  const rows = details(entry);
  return (
    <SheetHeader className="gap-1 border-b pr-12">
      <SheetDescription>
        {entry.kind === "field"
          ? "A field on the matter in Clio"
          : entry.kind === "contact"
            ? "A person on the matter in Clio"
            : [capital(KIND_WORD[entry.kind]), date].filter(Boolean).join(", ")}
      </SheetDescription>
      <SheetTitle className="text-xl leading-snug font-semibold text-balance">{entry.title || "Untitled"}</SheetTitle>
      {rows.length > 0 && (
        <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </SheetHeader>
  );
}

/** A note, email, call, task, calendar entry, expense, field or contact, with the quoted passage marked. */
function EntryPane({ entry, evidence }: { entry: Entry; evidence: SourceEvidence }) {
  const text = useMemo(() => plainText(entry.text), [entry.text]);
  const quote = decodeEntities(evidence.quote).trim();
  const at = useMemo(() => (quote ? locate(text, quote) : null), [text, quote]);
  // Bring the marked passage into view once, when the panel opens on it.
  const reveal = useCallback((mark: HTMLElement | null) => mark?.scrollIntoView({ block: "center" }), []);

  return (
    <>
      <PaneHeader entry={entry} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {quote && !at && (
          <div className="mb-4 border-l-2 border-marker bg-marker-soft px-3 py-2">
            <p className="font-serif text-[15px] leading-relaxed">“{quote}”</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The brief quotes this, but it is not in the {KIND_WORD[entry.kind]} word for word. Read it below
              before relying on the line.
            </p>
          </div>
        )}
        {text === "" ? (
          <p className="text-sm text-muted-foreground">
            {entry.kind === "contact" ? "Clio gives this person no role on the matter." : "This entry has no text in Clio."}
          </p>
        ) : (
          <p className="font-serif text-base leading-relaxed break-words whitespace-pre-wrap">
            {at ? (
              <>
                {text.slice(0, at.start)}
                <mark ref={reveal} className="scroll-my-24 bg-marker box-decoration-clone px-0.5 text-foreground">
                  {text.slice(at.start, at.end)}
                </mark>
                {text.slice(at.end)}
              </>
            ) : (
              text
            )}
          </p>
        )}
      </div>
    </>
  );
}

type Loaded = { status: "loading" } | { status: "ready"; data: DocumentSource } | { status: "failed"; message: string };

/** A document opened at the cited page, with what was read on that page beside it. */
function DocumentPane({
  matterId,
  entry,
  page,
  evidence,
  nonce,
}: {
  matterId: number;
  entry: Entry;
  page: number | null;
  evidence: SourceEvidence;
  nonce: number;
}) {
  const [state, setState] = useState<Loaded>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const quote = decodeEntities(evidence.quote).trim();
  const type = typeof entry.facts.contentType === "string" && entry.facts.contentType ? entry.facts.contentType : "application/pdf";

  useEffect(() => {
    let live = true;
    postJson<DocumentSource>("/api/documents/source", { matterId, ref: entry.ref, page: page ?? 1 }).then(
      (data) => live && setState({ status: "ready", data }),
      (err: Error) => live && setState({ status: "failed", message: err.message }),
    );
    return () => {
      live = false;
    };
  }, [matterId, entry.ref, page, attempt]);

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((count) => count + 1);
  };

  const note = state.status === "ready" ? state.data.note : null;

  return (
    <>
      <SheetHeader className="gap-1 border-b pr-12">
        <SheetDescription>{page ? `Document, page ${page}` : "Document"}</SheetDescription>
        <SheetTitle className="text-xl leading-snug font-semibold break-words">{entry.title || "Untitled"}</SheetTitle>
      </SheetHeader>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-1">
        <div className="min-h-0 p-3">
          {state.status === "loading" && (
            <div className="flex size-full flex-col gap-3" role="status" aria-label="Opening the document">
              <Skeleton className="h-full w-full" />
              <p className="text-xs text-muted-foreground">Opening {shortName(entry.title, 60)}</p>
            </div>
          )}
          {state.status === "failed" && (
            <div role="alert" className="border-l-2 border-destructive px-3 py-2 text-sm">
              <p className="font-medium text-destructive">The document could not be opened</p>
              <p className="mt-1 text-muted-foreground">{state.message}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
                Try again
              </Button>
            </div>
          )}
          {state.status === "ready" && (
            <SourceViewer
              source={{ name: state.data.name, type, url: state.data.url }}
              target={{ page: state.data.viewerPage, quote: state.data.hasText && quote ? quote : null, nonce }}
            />
          )}
        </div>
        <aside className="max-h-64 space-y-5 overflow-y-auto border-t p-4 lg:max-h-none lg:border-t-0 lg:border-l">
          {quote && (
            <div>
              <h3 className="text-sm font-medium">The passage cited</h3>
              <p className="mt-1.5">
                {evidence.found === false ? (
                  <span className="font-serif text-[13px] leading-relaxed">“{quote}”</span>
                ) : (
                  <Quote text={quote} lit />
                )}
              </p>
              {evidence.found === false && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Not found word for word in what was read on this page. Check the page before relying on the line.
                </p>
              )}
              {state.status === "ready" && !state.data.hasText && evidence.found !== false && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  This document is a scan, so the passage cannot be marked on the page itself.
                </p>
              )}
            </div>
          )}
          <div>
            <h3 className="text-sm font-medium">{page ? `Read on page ${page}` : "Read on this page"}</h3>
            {state.status === "loading" && (
              <div className="mt-2 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            )}
            {state.status === "failed" && (
              <p className="mt-1.5 text-xs text-muted-foreground">Nothing to show until the document opens.</p>
            )}
            {state.status === "ready" && !note && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                This page has not been read yet, so there is no summary of it. The page itself is on the left.
              </p>
            )}
            {note && (
              <>
                <dl className="mt-2 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 text-sm">
                  {(
                    [
                      ["Page is", note.kind],
                      ["Provider", note.provider],
                      ["Dated", shortDate(note.date, true)],
                    ] as const
                  )
                    .filter(([, value]) => value)
                    .map(([label, value]) => (
                      <div key={label} className="contents">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="min-w-0 font-serif break-words">{value}</dd>
                      </div>
                    ))}
                </dl>
                {note.facts.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">Nothing on this page bears on the case.</p>
                ) : (
                  <ul className="mt-3 divide-y border-t">
                    {note.facts.map((item, index) => (
                      <li key={index} className="space-y-1 py-2">
                        <p className="text-sm">{item.text}</p>
                        {item.quote && (
                          <p>
                            <Quote text={item.quote} />
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
