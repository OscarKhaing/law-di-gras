"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shortDate, type Entry, type EntryKind } from "@/features/cases/schema";
import { cn } from "@/lib/utils";
import { KIND_NAME } from "./source-panel";

const KIND_ORDER: EntryKind[] = ["note", "email", "call", "task", "event", "document", "expense", "field", "contact"];
const KIND_PLURAL: Record<EntryKind, string> = {
  note: "Notes",
  email: "Emails",
  call: "Calls",
  task: "Tasks",
  event: "Calendar",
  expense: "Expenses",
  document: "Documents",
  field: "Case fields",
  contact: "People",
};

// Dated entries newest first; undated ones (case fields, people) after them, by title.
function newestFirst(a: Entry, b: Entry) {
  if (a.date && b.date) return b.date.localeCompare(a.date);
  if (a.date || b.date) return a.date ? -1 : 1;
  return a.title.localeCompare(b.title);
}

/** Every entry in the case file as a ledger, narrowed by kind and by a search over its words. */
export function FullFile({
  entries,
  openRef,
  onOpen,
}: {
  entries: Entry[];
  /** The ref shown in the source panel, if any, so its row stays marked. */
  openRef: string | null;
  onOpen: (ref: string) => void;
}) {
  const [kind, setKind] = useState<EntryKind | null>(null);
  const [query, setQuery] = useState("");

  const kinds = KIND_ORDER.filter((k) => entries.some((entry) => entry.kind === k));
  const needle = query.trim().toLowerCase();
  const shown = entries
    .filter((entry) => kind === null || entry.kind === kind)
    .filter((entry) => !needle || [entry.title, entry.text, ...entry.people].join(" ").toLowerCase().includes(needle))
    .sort(newestFirst);

  return (
    <section aria-labelledby="full-file" className="space-y-4">
      <h2 id="full-file" className="font-heading text-2xl font-semibold tracking-tight">
        The full file
      </h2>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        <Button size="sm" variant={kind === null ? "secondary" : "ghost"} onClick={() => setKind(null)}>
          All {entries.length}
        </Button>
        {kinds.map((k) => (
          <Button key={k} size="sm" variant={kind === k ? "secondary" : "ghost"} onClick={() => setKind(k)}>
            {KIND_PLURAL[k]} {entries.filter((entry) => entry.kind === k).length}
          </Button>
        ))}
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the file"
          aria-label="Search the file"
          className="ml-auto w-full bg-card sm:w-56"
        />
      </div>

      {shown.length === 0 ? (
        <div className="border-y py-6 text-sm text-muted-foreground">
          {entries.length === 0 ? (
            "Nothing has been read from Clio for this case yet."
          ) : (
            <>
              Nothing in the file matches
              {query && <> “{query.trim()}”</>}
              {kind && <> among {KIND_PLURAL[kind].toLowerCase()}</>}.
              <Button
                variant="link"
                size="sm"
                className="px-1.5"
                onClick={() => {
                  setQuery("");
                  setKind(null);
                }}
              >
                Show everything
              </Button>
            </>
          )}
        </div>
      ) : (
        <ul className="divide-y border-y">
          {shown.map((entry) => (
            <li key={entry.ref}>
              <button
                type="button"
                onClick={() => onOpen(entry.ref)}
                aria-current={openRef === entry.ref ? "true" : undefined}
                className={cn(
                  "grid w-full grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 border-l-2 border-transparent py-2.5 pr-2 pl-2 text-left sm:grid-cols-[6rem_minmax(0,1fr)_5.5rem]",
                  openRef === entry.ref && "border-primary bg-muted/60",
                )}
              >
                <span className="text-sm text-muted-foreground tabular-nums">{shortDate(entry.date, true)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-serif text-[15px]">{entry.title || "Untitled"}</span>
                  {entry.text && <span className="block truncate text-sm text-muted-foreground">{entry.text}</span>}
                </span>
                <span className="hidden text-right text-sm text-muted-foreground sm:block">{KIND_NAME[entry.kind]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
