"use client";

import type { ReactNode } from "react";
import { StatusIcon, StatusPill, type Tone } from "@/components/status";
import { overdue, shortDate, upcoming } from "@/features/cases/schema";
import { KIND_WORD, addDays, daysBetween, fromToday, span } from "@/features/cases/words";
import { useFold } from "./fold";
import type { SectionProps } from "./schema";
import { SourceLinks, useSource } from "./source-panel";

const AHEAD = 30;
/** Within this many days a date is pressing. */
const SOON = 7;

const openClass =
  "max-w-full cursor-pointer truncate rounded-sm text-left align-bottom font-serif text-[15px] leading-6 underline decoration-input underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

/** One of the four ledgers: its name and count, then one line per item, the first five until asked. */
function Ledger<T>({
  label,
  tone,
  items,
  empty,
  render,
}: {
  label: string;
  /** How pressing the ledger is when it has anything in it; an empty one is all clear. */
  tone: Tone;
  items: T[];
  empty: string;
  render: (item: T) => ReactNode;
}) {
  const { shown, control } = useFold(items);
  return (
    <div className="min-w-0 border-t py-2.5">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <StatusIcon tone={items.length > 0 ? tone : "done"} className="size-4" />
        {label}
        {items.length > 0 && <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{items.length}</span>}
      </h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1 divide-y">
          {shown.map((item, index) => (
            <li key={index} className="py-1.5">
              {render(item)}
            </li>
          ))}
        </ul>
      )}
      {control && <p className="pt-1">{control}</p>}
    </div>
  );
}

const lineClass = "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3";
const asideClass = "text-xs whitespace-nowrap text-muted-foreground";

/** What is late, what is coming, what the firm is waiting for and what the attorney has to decide. */
export function Attention({ file, stored, today }: SectionProps) {
  const { openRef } = useSource();
  const { brief } = stored;
  const late = overdue(file, today);
  const coming = upcoming(file, today, addDays(today, AHEAD));

  return (
    <section aria-labelledby="attention-heading">
      <h2 id="attention-heading" className="font-heading text-xl font-semibold tracking-tight">
        Needs attention
      </h2>
      <div className="mt-3 grid gap-x-10 lg:grid-cols-2">
        <div className="min-w-0 border-b">
        <Ledger
          label="Overdue"
          tone="urgent"
          items={late}
          empty="No open task is past its due date."
          render={(entry) => (
            <div className={lineClass}>
              <button type="button" title={entry.title} className={openClass} onClick={() => openRef(entry.ref)}>
                {entry.title || "Untitled task"}
              </button>
              <span className={asideClass}>
                <StatusPill tone="urgent">{span(daysBetween(entry.date, today))} late</StatusPill>
              </span>
            </div>
          )}
        />
        <Ledger
          label="Waiting on others"
          tone="mild"
          items={brief.waiting}
          empty="The file shows nothing the firm is waiting on from anyone else."
          render={(item) => {
            const waited = shortDate(item.since) ? span(daysBetween(item.since, today)) : "";
            const facts = [waited, item.asked > 0 && `asked ${item.asked === 1 ? "once" : `${item.asked} times`}`].filter(Boolean);
            return (
              <p className="text-sm leading-5">
                <span className="font-medium">{item.on}</span>
                {item.on && item.what ? ": " : ""}
                {item.what}{" "}
                {facts.length > 0 && <span className={asideClass}>waiting {facts.join(", ")} </span>}
                <SourceLinks evidence={item.evidence} />
              </p>
            );
          }}
        />
        </div>
        <div className="min-w-0 border-b max-lg:border-t-0">
        <Ledger
          label={`Coming up in ${AHEAD} days`}
          tone="mild"
          items={coming}
          empty={`No task is due and nothing is on the calendar in the next ${AHEAD} days.`}
          render={(entry) => (
            <div className={lineClass}>
              <button type="button" title={entry.title} className={openClass} onClick={() => openRef(entry.ref)}>
                {entry.title || `Untitled ${KIND_WORD[entry.kind]}`}
              </button>
              <span className={asideClass}>
                {entry.kind === "task" ? "due" : "calendar"} {shortDate(entry.date)}{" "}
                <StatusPill tone={daysBetween(today, entry.date) <= SOON ? "mild" : "neutral"}>{fromToday(entry.date, today)}</StatusPill>
              </span>
            </div>
          )}
        />
        <Ledger
          label="To decide"
          tone="mild"
          items={brief.decisions}
          empty="The file shows no decision waiting on the attorney."
          render={(item) => (
            <p className="text-sm leading-5">
              {item.what}{" "}
              {shortDate(item.by) && (
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  by {shortDate(item.by, true)}, {fromToday(item.by, today)}{" "}
                </span>
              )}
              <SourceLinks evidence={item.evidence} />
            </p>
          )}
        />
        </div>
      </div>
    </section>
  );
}
