"use client";

import type { ReactNode } from "react";
import { panelClass } from "@/components/panel";
import { StatusPill } from "@/components/status";
import { lastClientContact, shortDate, upcoming } from "@/features/cases/schema";
import { daysBetween, fromToday } from "@/features/cases/words";
import { cn } from "@/lib/utils";
import type { SectionProps } from "./schema";
import { SourceLinks, useSource } from "./source-panel";

const openClass =
  "cursor-pointer rounded-sm text-left underline decoration-input underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

/** One fact: what it is above, the value below, set apart from the next by space alone. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 min-w-0 space-y-1.5">{children}</dd>
    </div>
  );
}

/** A value from the record in the serif face, with the app's own remark after it; `urgent` makes the remark red. */
function Value({ children, remark, urgent = false }: { children: ReactNode; remark?: string; urgent?: boolean }) {
  return (
    <p className="font-serif text-[15px] leading-snug">
      {children}
      {remark &&
        (urgent ? (
          <StatusPill tone="urgent" className="ml-2 font-sans">
            {remark}
          </StatusPill>
        ) : (
          <span className="ml-2 font-sans text-xs text-muted-foreground">{remark}</span>
        ))}
    </p>
  );
}

/** The facts a lawyer checks first, each one opening where it came from. */
export function Glance({ file, stored, today }: SectionProps) {
  const { openRef } = useSource();
  const { brief } = stored;
  const spoke = lastClientContact(file);
  const next = upcoming(file, today, "9999-12-31").find((entry) => entry.kind === "event");
  const untilLimitation = file.limitationDate ? daysBetween(today, file.limitationDate) : null;

  return (
    <section aria-labelledby="glance-heading">
      <h2 id="glance-heading" className="font-heading text-xl font-semibold tracking-tight">
        At a glance
      </h2>
      <dl className={cn(panelClass, "mt-3 grid gap-x-8 gap-y-6 p-5 sm:grid-cols-2 sm:p-6")}>
        <Row label="Date of incident">
          {shortDate(brief.incident.date, true) ? (
            <>
              <Value remark={fromToday(brief.incident.date, today)}>{shortDate(brief.incident.date, true)}</Value>
              <SourceLinks evidence={brief.incident.evidence} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">The file gives no date.</p>
          )}
        </Row>
        <Row label="Limitation date">
          {untilLimitation === null || Number.isNaN(untilLimitation) ? (
            <p className="text-sm text-muted-foreground">Clio has no limitation date on this matter.</p>
          ) : (
            <>
              <Value
                remark={untilLimitation < 0 ? `passed ${fromToday(file.limitationDate, today)}` : fromToday(file.limitationDate, today)}
                urgent={untilLimitation >= 0 && untilLimitation <= 90}
              >
                {shortDate(file.limitationDate, true)}
              </Value>
              <p className="text-xs text-muted-foreground">from the matter in Clio</p>
            </>
          )}
        </Row>
        {brief.glance.map((item, index) => (
          <Row key={`${item.label}-${index}`} label={item.label}>
            <Value>{item.value}</Value>
            <SourceLinks evidence={item.evidence} />
          </Row>
        ))}
        <Row label="Last spoke to the client">
          {spoke ? (
            <>
              <Value remark={fromToday(spoke.date, today)}>{shortDate(spoke.date, true)}</Value>
              <p className="text-xs text-muted-foreground">
                <button type="button" className={openClass} onClick={() => openRef(spoke.ref)}>
                  {spoke.title || "call"}
                </button>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No call with the client is recorded in Clio.</p>
          )}
        </Row>
        <Row label="Next on the calendar">
          {next ? (
            <>
              <Value remark={fromToday(next.date, today)}>{shortDate(next.date, true)}</Value>
              <p className="text-xs text-muted-foreground">
                <button type="button" className={openClass} onClick={() => openRef(next.ref)}>
                  {next.title || "calendar entry"}
                </button>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing is on the calendar from today.</p>
          )}
        </Row>
      </dl>
    </section>
  );
}
