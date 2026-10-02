"use client";

import { useMemo, useState } from "react";
import { StatusPill } from "@/components/status";
import { Input } from "@/components/ui/input";
import { shortDate, type CaseFile, type Entry, type EntryKind } from "@/features/cases/schema";
import { KIND_WORD } from "@/features/cases/words";
import { cn } from "@/lib/utils";
import { useSource } from "./source-panel";

const KINDS: { kind: EntryKind; label: string }[] = [
  { kind: "note", label: "Notes" },
  { kind: "email", label: "Emails" },
  { kind: "call", label: "Calls" },
  { kind: "task", label: "Tasks" },
  { kind: "event", label: "Calendar" },
  { kind: "expense", label: "Expenses" },
  { kind: "document", label: "Documents" },
];

const columns = "grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 md:grid-cols-[6.5rem_5.5rem_minmax(0,1fr)_minmax(0,14rem)]";

/** A task's state beside its title: done is green, past its due date is red; other entries have none. */
function TaskState({ entry, today }: { entry: Entry; today: string }) {
  if (entry.kind !== "task") return null;
  if (entry.facts.status === "complete") return <StatusPill tone="done">Done</StatusPill>;
  if (entry.date !== "" && entry.date < today) return <StatusPill tone="urgent">Overdue</StatusPill>;
  return null;
}

/** Every entry of the case, newest first: the whole file behind the brief, to filter, search and open. */
export function FullFile({ file, today }: { file: CaseFile; today: string }) {
  const { openRef } = useSource();
  const [kind, setKind] = useState<EntryKind | null>(null);
  const [query, setQuery] = useState("");

  const entries = useMemo(
    () =>
      file.entries
        .filter((entry) => entry.kind !== "field" && entry.kind !== "contact")
        .sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt)),
    [file],
  );
  const matching = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return entries;
    return entries.filter((entry) => {
      const text = `${entry.title} ${entry.text} ${entry.people.join(" ")}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }, [entries, query]);
  const shown = kind ? matching.filter((entry) => entry.kind === kind) : matching;
  const count = (of: EntryKind) => matching.filter((entry) => entry.kind === of).length;
  const filters = [{ kind: null, label: "All", count: matching.length }, ...KINDS.map((item) => ({ ...item, count: count(item.kind) }))];

  return (
    <section aria-labelledby="file-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="file-heading" className="font-heading text-xl font-semibold tracking-tight">
          The full file
        </h2>
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {entries.length === 0 ? "" : `Showing ${shown.length} of ${entries.length}`}
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="mt-3 border-y py-3 text-sm text-muted-foreground">
          Clio holds no notes, emails, calls, tasks, calendar entries, expenses or documents on this matter.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div role="group" aria-label="Kind of entry" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {filters.map((filter) => (
                <button
                  key={filter.label}
                  type="button"
                  aria-pressed={kind === filter.kind}
                  onClick={() => setKind(filter.kind)}
                  className={cn(
                    "cursor-pointer border-b pb-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    kind === filter.kind
                      ? "border-foreground font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {filter.label}
                  <span className="ml-1 font-normal text-muted-foreground tabular-nums">{filter.count}</span>
                </button>
              ))}
            </div>
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles and text"
              aria-label="Search the file"
              className="w-full bg-card sm:w-64"
            />
          </div>

          <div className="mt-3 max-h-[70vh] overflow-y-auto border-y">
            <div className={cn(columns, "sticky top-0 border-b bg-background py-1.5 text-xs text-muted-foreground")}>
              <span>Date</span>
              <span className="hidden md:block">Kind</span>
              <span>Title</span>
              <span className="hidden md:block">People</span>
            </div>
            {shown.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">
                {query ? `Nothing in the file matches “${query}”${kind ? " among these entries" : ""}. ` : "There are no entries of this kind. "}
                <button
                  type="button"
                  className="cursor-pointer text-foreground underline decoration-input underline-offset-2 hover:decoration-foreground"
                  onClick={() => {
                    setQuery("");
                    setKind(null);
                  }}
                >
                  Show the whole file
                </button>
              </p>
            ) : (
              <ul className="divide-y">
                {shown.map((entry) => (
                  <li key={entry.ref}>
                    <button
                      type="button"
                      onClick={() => openRef(entry.ref)}
                      className={cn(
                        columns,
                        "group w-full cursor-pointer items-baseline py-1.5 text-left text-sm outline-none focus-visible:bg-muted",
                      )}
                    >
                      <span className="text-muted-foreground tabular-nums">{shortDate(entry.date, true)}</span>
                      <span className="hidden text-muted-foreground md:block">{KIND_WORD[entry.kind]}</span>
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate font-serif text-[15px] group-hover:underline group-hover:decoration-input group-hover:underline-offset-2">
                          <span className="mr-2 font-sans text-sm text-muted-foreground md:hidden">{KIND_WORD[entry.kind]}</span>
                          {entry.title || "Untitled"}
                        </span>
                        <TaskState entry={entry} today={today} />
                      </span>
                      <span className="hidden truncate text-muted-foreground md:block">{entry.people.join(", ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
