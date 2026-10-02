"use client";

import type { ReactNode } from "react";
import { Panel } from "@/components/panel";
import { StatusIcon, StatusPill, type Tone } from "@/components/status";
import { overdue, shortDate, upcoming, type Entry } from "@/features/cases/schema";
import { KIND_WORD, addDays, daysBetween, fromToday, span } from "@/features/cases/words";
import type { SectionProps } from "./schema";
import { SourceLinks, useSource } from "./source-panel";

const AHEAD = 30;
/** Within this many days a date is pressing: yellow when coming up, red when a decision is due. */
const SOON = 7;

const openClass =
  "cursor-pointer rounded-sm text-left font-serif text-[15px] leading-snug underline decoration-input underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

/** One kind of thing to do, on its own card, headed by its colour and how many there are. */
function Row({ label, count, tone, children }: { label: string; count: number; tone: Tone; children: ReactNode }) {
  return (
    <Panel className="sm:p-5">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold">
        <StatusIcon tone={count > 0 ? tone : "done"} className="size-4" />
        {label}
        {count > 0 && <span className="font-normal text-muted-foreground tabular-nums">{count}</span>}
      </h3>
      <div className="mt-3 min-w-0">{children}</div>
    </Panel>
  );
}

const Nothing = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

function Items<T>({ items, render }: { items: T[]; render: (item: T) => ReactNode }) {
  return (
    <ul className="space-y-1">
      {items.map((item, index) => (
        <li key={index} className="space-y-1 rounded-lg bg-muted/50 px-4 py-3">
          {render(item)}
        </li>
      ))}
    </ul>
  );
}

/** What is late, what is coming, what the firm is waiting for and what the attorney has to decide. */
export function Attention({ file, stored, today }: SectionProps) {
  const { openRef } = useSource();
  const { brief } = stored;
  const late = overdue(file, today);
  const coming = upcoming(file, today, addDays(today, AHEAD));
  const withPeople = (entry: Entry) => (entry.people.length ? `, ${entry.people.join(", ")}` : "");

  return (
    <section aria-labelledby="attention-heading">
      <h2 id="attention-heading" className="font-heading text-xl font-semibold tracking-tight">
        Needs attention
      </h2>
      <div className="mt-3 space-y-4">
        <Row label="Overdue" count={late.length} tone="urgent">
          {late.length === 0 ? (
            <Nothing>No open task is past its due date.</Nothing>
          ) : (
            <Items
              items={late}
              render={(entry) => (
                <>
                  <button type="button" className={openClass} onClick={() => openRef(entry.ref)}>
                    {entry.title || "Untitled task"}
                  </button>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <StatusPill tone="urgent">{span(daysBetween(entry.date, today))} late</StatusPill>
                    <span>
                      due {shortDate(entry.date, true)}
                      {withPeople(entry)}
                    </span>
                  </p>
                </>
              )}
            />
          )}
        </Row>
        <Row label="Coming up" count={coming.length} tone="mild">
          {coming.length === 0 ? (
            <Nothing>No task is due and nothing is on the calendar in the next {AHEAD} days.</Nothing>
          ) : (
            <Items
              items={coming}
              render={(entry) => (
                <>
                  <button type="button" className={openClass} onClick={() => openRef(entry.ref)}>
                    {entry.title || `Untitled ${KIND_WORD[entry.kind]}`}
                  </button>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <StatusPill tone={daysBetween(today, entry.date) <= SOON ? "mild" : "neutral"}>
                      {fromToday(entry.date, today)}
                    </StatusPill>
                    <span>
                      {entry.kind === "task" ? "Task due" : "On the calendar"} {shortDate(entry.date)}
                      {withPeople(entry)}
                    </span>
                  </p>
                </>
              )}
            />
          )}
        </Row>
        <Row label="Waiting on others" count={brief.waiting.length} tone="mild">
          {brief.waiting.length === 0 ? (
            <Nothing>The file shows nothing the firm is waiting on from anyone else.</Nothing>
          ) : (
            <Items
              items={brief.waiting}
              render={(item) => {
                const since = shortDate(item.since, true);
                const facts = [
                  since && `since ${since} (${span(daysBetween(item.since, today))})`,
                  item.asked > 0 && `asked ${item.asked === 1 ? "once" : `${item.asked} times`}`,
                ].filter(Boolean);
                return (
                  <>
                    <p className="text-[15px] leading-snug">
                      <span className="font-medium">{item.on}</span>
                      {item.on && item.what ? ": " : ""}
                      {item.what}
                    </p>
                    {facts.length > 0 && (
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <StatusPill tone="mild">Waiting</StatusPill>
                        <span>{facts.join(", ")}</span>
                      </p>
                    )}
                    <SourceLinks evidence={item.evidence} />
                  </>
                );
              }}
            />
          )}
        </Row>
        <Row label="To decide" count={brief.decisions.length} tone="mild">
          {brief.decisions.length === 0 ? (
            <Nothing>The file shows no decision waiting on the attorney.</Nothing>
          ) : (
            <Items
              items={brief.decisions}
              render={(item) => (
                <>
                  <p className="text-[15px] leading-snug">{item.what}</p>
                  {shortDate(item.by) && (
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <StatusPill tone={daysBetween(today, item.by) <= SOON ? "urgent" : "mild"}>{fromToday(item.by, today)}</StatusPill>
                      <span>decide by {shortDate(item.by, true)}</span>
                    </p>
                  )}
                  <SourceLinks evidence={item.evidence} />
                </>
              )}
            />
          )}
        </Row>
      </div>
    </section>
  );
}
