"use client";

import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Quote } from "@/components/quote";
import { parseSource, shortDate, type Entry, type EntryKind } from "@/features/cases/schema";
import { SourceViewer } from "@/features/documents/source-viewer";

/** What the source panel shows: a ref (with an optional page), the quote to mark, and whether code found it there. */
export type Opened = { source: string; quote: string; found: boolean; nonce: number };

export const KIND_NAME: Record<EntryKind, string> = {
  note: "Note",
  email: "Email",
  call: "Call",
  task: "Task",
  event: "Calendar",
  expense: "Expense",
  document: "Document",
  field: "Case field",
  contact: "Person",
};

/** A source in words the reader knows: "Call, Jun 24", "Policy limits", "Records and bills, p. 2". */
export function describeSource(source: string, entries: Map<string, Entry>) {
  const { ref, page } = parseSource(source);
  const entry = entries.get(ref);
  if (!entry) return source;
  if (entry.kind === "document") {
    const name = entry.title.replace(/\.[a-z0-9]{2,4}$/i, "");
    const short = name.length > 32 ? `${name.slice(0, 30).trimEnd()}…` : name;
    return page ? `${short}, p. ${page}` : short;
  }
  if (entry.kind === "field" || entry.kind === "contact") return entry.title;
  return entry.date ? `${KIND_NAME[entry.kind]}, ${shortDate(entry.date)}` : KIND_NAME[entry.kind];
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** The kind-specific facts worth showing, as label and value. */
function factRows(entry: Entry): [string, string][] {
  const f = entry.facts;
  const rows: [string, unknown][] = [];
  if (entry.date) rows.push(["Date", shortDate(entry.date, true)]);
  switch (entry.kind) {
    case "email":
    case "call":
      rows.push(["From", f.from], ["To", f.to]);
      break;
    case "task":
      rows.push(["Status", f.status], ["Priority", f.priority], ["Assigned to", entry.people.join(", ")]);
      if (f.completedAt) rows.push(["Completed", shortDate(String(f.completedAt), true)]);
      break;
    case "event":
      rows.push(["Where", f.location], ["Who", entry.people.join(", ")]);
      break;
    case "expense":
      rows.push(["Amount", typeof f.amount === "number" ? money.format(f.amount) : f.amount]);
      break;
    case "contact":
      rows.push(["Role", f.role], ["Phone", f.phone], ["Email", f.email]);
      break;
    case "note":
      rows.push(["Written by", entry.people.join(", ")]);
      break;
  }
  return rows.filter((row): row is [string, string | number] => row[1] !== undefined && row[1] !== "").map(([label, value]) => [label, String(value)]);
}

/**
 * Finds `quote` in `text`, ignoring case and differences in spacing.
 * Returns the text split around it, or null when the quote is not there word for word.
 */
function splitOnQuote(text: string, quote: string): [string, string, string] | null {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const pattern = new RegExp(words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "i");
  const match = pattern.exec(text);
  if (!match) return null;
  return [text.slice(0, match.index), match[0], text.slice(match.index + match[0].length)];
}

/** The entry a line of the brief rests on: a note, email, call, task or calendar entry with the quote marked, or a document at its page. */
export function SourcePanel({
  opened,
  entries,
  documentUrls,
  onClose,
}: {
  opened: Opened;
  entries: Map<string, Entry>;
  documentUrls: Record<string, string>;
  onClose: () => void;
}) {
  const { ref, page } = parseSource(opened.source);
  const entry = entries.get(ref);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{entry ? KIND_NAME[entry.kind] : "Source"}</p>
          <h2 className="font-serif text-xl leading-snug font-semibold">{entry ? entry.title || "Untitled" : opened.source}</h2>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close the source">
          <XIcon />
        </Button>
      </div>

      {!entry ? (
        <p role="alert" className="text-sm text-destructive">
          This source is not in the case file as last read from Clio. Read the case from Clio again, or check the line
          against Clio by hand.
        </p>
      ) : entry.kind === "document" ? (
        <DocumentSource entry={entry} page={page} opened={opened} url={documentUrls[entry.ref]} />
      ) : (
        <EntrySource entry={entry} opened={opened} />
      )}
    </div>
  );
}

function EntrySource({ entry, opened }: { entry: Entry; opened: Opened }) {
  const rows = factRows(entry);
  const split = opened.quote ? splitOnQuote(entry.text, opened.quote) : null;
  return (
    <div className="min-h-0 space-y-4 overflow-y-auto">
      {rows.length > 0 && (
        <dl className="divide-y border-y text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-4 py-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {opened.quote && !split && (
        <p className="text-sm">
          <span className="text-muted-foreground">Quoted as </span>
          <Quote text={opened.quote} />
          <span className="text-muted-foreground"> but not found word for word below.</span>
        </p>
      )}
      {entry.text ? (
        <p className="font-serif text-[15px] leading-relaxed whitespace-pre-line">
          {split ? (
            <>
              {split[0]}
              <Quote text={split[1]} lit />
              {split[2]}
            </>
          ) : (
            entry.text
          )}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Clio holds no text for this entry.</p>
      )}
    </div>
  );
}

function DocumentSource({ entry, page, opened, url }: { entry: Entry; page: number | null; opened: Opened; url?: string }) {
  const pages = Number(entry.facts.pages) || null;
  const where = [entry.facts.folder ? `In ${entry.facts.folder}` : "", page ? `page ${page}${pages ? ` of ${pages}` : ""}` : pages ? `${pages} pages` : ""]
    .filter(Boolean)
    .join(", ");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {where && <p className="text-sm text-muted-foreground">{where}</p>}
      {opened.quote && (
        <p className="text-sm">
          <Quote text={opened.quote} lit />
          {!opened.found && <span className="text-muted-foreground"> was not found word for word in this document.</span>}
        </p>
      )}
      {url ? (
        <div className="min-h-[28rem] flex-1">
          <SourceViewer
            source={{ name: entry.title, type: String(entry.facts.contentType ?? "application/pdf"), url }}
            target={{ page: page ?? 1, quote: opened.quote || null, nonce: opened.nonce }}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          This document has not been copied from Clio yet, so it cannot be shown here. Open it in Clio to read it.
        </p>
      )}
    </div>
  );
}
