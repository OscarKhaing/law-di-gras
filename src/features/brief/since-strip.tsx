"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { changedSince, shortDate, type CaseFile, type Entry, type EntryKind } from "@/features/cases/schema";
import { addDays } from "@/features/cases/words";
import { postJson } from "@/lib/fetch-json";
import { cn } from "@/lib/utils";
import { useSource } from "./source-panel";

type Visit = { status: "checking" } | { status: "known"; previous: string | null } | { status: "failed"; message: string };
type Range = "visit" | 30 | 90;

const GROUPS: { kind: EntryKind; label: string }[] = [
  { kind: "note", label: "Notes" },
  { kind: "email", label: "Emails" },
  { kind: "call", label: "Calls" },
  { kind: "task", label: "Tasks" },
  { kind: "event", label: "Calendar" },
  { kind: "expense", label: "Expenses" },
  { kind: "document", label: "Documents" },
];
const FIRST = 3;

/** An id for this browser, so "since you last opened" is about this reader. There is no sign-in. */
function viewerId() {
  const key = "case-desk-viewer";
  try {
    const kept = localStorage.getItem(key);
    if (kept) return kept;
    const made = crypto.randomUUID();
    localStorage.setItem(key, made);
    return made;
  } catch {
    return crypto.randomUUID();
  }
}

const dayOf = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
const timeOf = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

/** When the reader last opened the case, in their own time: "today at 10:42 AM" or "on Sep 28". */
function whenOpened(iso: string, today: string) {
  const date = new Date(iso);
  const day = dayOf.format(date);
  return day === today ? `today at ${timeOf.format(date)}` : `on ${shortDate(day, day.slice(0, 4) !== today.slice(0, 4))}`;
}

/** What has been added to the case since this reader last opened it, or in the last 30 or 90 days. */
export function SinceStrip({ file, today }: { file: CaseFile; today: string }) {
  const { openRef } = useSource();
  const [visit, setVisit] = useState<Visit>({ status: "checking" });
  const [chosen, setChosen] = useState<Range | null>(null);
  const [expanded, setExpanded] = useState<EntryKind[]>([]);
  const asked = useRef(false);

  useEffect(() => {
    // Once per time the page is opened: a second request would make "last opened" a moment ago.
    if (asked.current) return;
    asked.current = true;
    postJson<{ previous: string | null }>("/api/cases/visit", { matterId: file.matterId, viewer: viewerId() }).then(
      (result) => setVisit({ status: "known", previous: result.previous }),
      (err: Error) => setVisit({ status: "failed", message: err.message }),
    );
  }, [file.matterId]);

  if (visit.status === "checking") {
    return (
      <section aria-label="What is new" className="border-l-2 border-marker bg-marker-soft px-4 py-3" role="status">
        <p className="text-sm text-muted-foreground">Checking what is new since you last opened this case</p>
        <Skeleton className="mt-2 h-4 w-2/3 bg-marker/40" />
      </section>
    );
  }

  const previous = visit.status === "known" ? visit.previous : null;
  const range: Range = chosen ?? (previous ? "visit" : 30);

  let fresh: Entry[];
  if (range === "visit" && previous) {
    // Added to Clio since the visit, or dated since it; a task due later is not news.
    fresh = changedSince(file, previous).filter((entry) => entry.createdAt > previous || entry.date <= today);
  } else {
    // A window of days goes by the day each entry is about, whenever it was typed into Clio.
    const cutoff = addDays(today, -(range === "visit" ? 30 : range));
    fresh = changedSince(file, cutoff).filter((entry) => entry.date > cutoff && entry.date <= today);
  }
  const groups = GROUPS.map((group) => ({ ...group, entries: fresh.filter((entry) => entry.kind === group.kind) })).filter(
    (group) => group.entries.length > 0,
  );

  const days = range === "visit" ? 30 : range;
  const sinceVisit = range === "visit" && previous ? whenOpened(previous, today) : null;
  // With nothing to list, the heading itself says so.
  const heading =
    groups.length === 0
      ? sinceVisit
        ? `Nothing new in Clio since you last opened ${sinceVisit}`
        : `Nothing in the file is dated in the last ${days} days`
      : sinceVisit
        ? `Since you last opened ${sinceVisit}`
        : `In the last ${days} days`;
  const options: { value: Range; label: string; off?: boolean }[] = [
    { value: "visit", label: "Since last opened", off: !previous },
    { value: 30, label: "Last 30 days" },
    { value: 90, label: "Last 90 days" },
  ];

  return (
    <section aria-labelledby="since-heading" className="border-l-2 border-marker">
      <div className="bg-marker-soft px-4 py-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="since-heading" className="font-heading text-lg font-semibold tracking-tight">
            {heading}
          </h2>
          <div role="group" aria-label="Period to show" className="flex gap-3 text-xs">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={range === option.value}
                disabled={option.off}
                onClick={() => {
                  setChosen(option.value);
                  setExpanded([]);
                }}
                className={cn(
                  "cursor-pointer border-b pb-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-50",
                  range === option.value
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {visit.status === "failed" && (
          <p className="mt-1 text-xs text-muted-foreground">
            Case Desk could not check when you last opened this case ({visit.message}), so this shows the last 30 days.
          </p>
        )}
        {visit.status === "known" && !previous && chosen === null && (
          <p className="mt-1 text-xs text-muted-foreground">
            This is the first time you have opened this case here, so this shows the last 30 days.
          </p>
        )}
      </div>

      {groups.length > 0 && (
        <div className="divide-y border-b pl-4">
          {groups.map((group) => {
            const all = expanded.includes(group.kind);
            const shown = all ? group.entries : group.entries.slice(0, FIRST);
            return (
              <div key={group.kind} className="grid gap-x-6 py-2 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
                <h3 className="text-sm">
                  {group.label}
                  <span className="ml-1.5 text-muted-foreground tabular-nums">{group.entries.length}</span>
                </h3>
                <ul className="min-w-0 space-y-1">
                  {shown.map((entry) => (
                    <li key={entry.ref} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-2">
                      <span className="pt-px text-xs leading-5 text-muted-foreground tabular-nums">{shortDate(entry.date)}</span>
                      <button
                        type="button"
                        onClick={() => openRef(entry.ref)}
                        className="cursor-pointer justify-self-start rounded-sm text-left font-serif text-sm leading-5 underline decoration-input underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        {entry.title || "Untitled"}
                      </button>
                    </li>
                  ))}
                  {group.entries.length > FIRST && (
                    <li className="pl-[3.75rem]">
                      <button
                        type="button"
                        aria-expanded={all}
                        onClick={() =>
                          setExpanded((kinds) => (all ? kinds.filter((kind) => kind !== group.kind) : [...kinds, group.kind]))
                        }
                        className="cursor-pointer rounded-sm text-xs text-muted-foreground underline decoration-input underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        {all ? "Show fewer" : `Show ${group.entries.length - FIRST} more`}
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
