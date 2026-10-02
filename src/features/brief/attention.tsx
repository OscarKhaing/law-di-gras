"use client";

import type { ReactNode } from "react";
import { overdue, shortDate, upcoming, type Entry } from "@/features/cases/schema";
import { KIND_WORD, addDays, daysBetween, fromToday, span } from "@/features/cases/words";
import type { SectionProps } from "./schema";
import { useFirst } from "./show-all";
import { SourceLinks, useSource } from "./source-panel";

const AHEAD = 30;

const openClass =
  "cursor-pointer rounded-sm text-left font-serif text-[15px] leading-snug underline decoration-input underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

function Row({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-1 border-t py-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <h3 className="text-sm font-medium">
        {label}
        {count > 0 && <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{count}</span>}
      </h3>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const Nothing = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

function Items<T>({ items, render }: { items: T[]; render: (item: T) => ReactNode }) {
  const { shown, more } = useFirst(items);
  return (
    <div className="max-w-[46rem] space-y-2.5">
      <ul className="space-y-2.5">
        {shown.map((item, index) => (
          <li key={index} className="space-y-0.5">
            {render(item)}
          </li>
        ))}
      </ul>
      {more}
    </div>
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
      <div className="mt-3 border-b">
        <Row label="Overdue" count={late.length}>
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
                  <p className="text-xs text-muted-foreground">
                    <span className="bg-marker px-1 text-foreground">{span(daysBetween(entry.date, today))} late</span> due{" "}
                    {shortDate(entry.date, true)}
                    {withPeople(entry)}
                  </p>
                </>
              )}
            />
          )}
        </Row>
        <Row label="Coming up" count={coming.length}>
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
                  <p className="text-xs text-muted-foreground">
                    {entry.kind === "task" ? "Task due" : "On the calendar"} {shortDate(entry.date)}, {fromToday(entry.date, today)}
                    {withPeople(entry)}
                  </p>
                </>
              )}
            />
          )}
        </Row>
        <Row label="Waiting on others" count={brief.waiting.length}>
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
                    {facts.length > 0 && <p className="text-xs text-muted-foreground">Waiting {facts.join(", ")}</p>}
                    <SourceLinks evidence={item.evidence} />
                  </>
                );
              }}
            />
          )}
        </Row>
        <Row label="To decide" count={brief.decisions.length}>
          {brief.decisions.length === 0 ? (
            <Nothing>The file shows no decision waiting on the attorney.</Nothing>
          ) : (
            <Items
              items={brief.decisions}
              render={(item) => (
                <>
                  <p className="text-[15px] leading-snug">{item.what}</p>
                  {shortDate(item.by) && (
                    <p className="text-xs text-muted-foreground">
                      By {shortDate(item.by, true)}, {fromToday(item.by, today)}
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
