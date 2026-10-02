"use client";

import type { ReactNode } from "react";
import { lastClientContact, shortDate } from "@/features/cases/schema";
import { daysBetween, fromToday } from "@/features/cases/words";
import { cn } from "@/lib/utils";
import type { SectionProps } from "./schema";
import { SourceLinks, useSource } from "./source-panel";

const openClass =
  "max-w-full cursor-pointer truncate rounded-sm text-left align-bottom underline decoration-input underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-4 border-t py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** A value from the record in the serif face, with the app's own remark after it. */
function Value({ children, remark, marked = false }: { children: ReactNode; remark?: string; marked?: boolean }) {
  return (
    <p className="font-serif text-[15px] leading-snug">
      {children}
      {remark && (
        <span className={cn("ml-2 font-sans text-xs text-muted-foreground", marked && "bg-marker px-1 text-foreground")}>
          {remark}
        </span>
      )}
    </p>
  );
}

/** The facts a lawyer checks first, each one opening where it came from. */
export function Glance({ file, stored, today }: SectionProps) {
  const { openRef } = useSource();
  const { brief } = stored;
  const spoke = lastClientContact(file);
  const untilLimitation = file.limitationDate ? daysBetween(today, file.limitationDate) : null;

  return (
    <section aria-labelledby="glance-heading">
      <h2 id="glance-heading" className="font-heading text-xl font-semibold tracking-tight">
        At a glance
      </h2>
      <dl className="mt-3 border-b">
        <Row label="Limitation date">
          {untilLimitation === null || Number.isNaN(untilLimitation) ? (
            <p className="text-sm text-muted-foreground">Clio has no limitation date on this matter.</p>
          ) : (
            <>
              <Value
                remark={`${untilLimitation < 0 ? `passed ${fromToday(file.limitationDate, today)}` : fromToday(file.limitationDate, today)}, from the matter in Clio`}
                marked={untilLimitation >= 0 && untilLimitation <= 90}
              >
                {shortDate(file.limitationDate, true)}
              </Value>
            </>
          )}
        </Row>
        {brief.glance.map((item, index) => (
          <Row key={`${item.label}-${index}`} label={item.label}>
            <p className="font-serif text-[15px] leading-snug">
              {item.value} <SourceLinks evidence={item.evidence} />
            </p>
          </Row>
        ))}
        <Row label="Last spoke to the client">
          {spoke ? (
            <>
              <Value remark={fromToday(spoke.date, today)}>{shortDate(spoke.date, true)}</Value>
              <p className="truncate text-xs leading-5 text-muted-foreground">
                <button type="button" title={spoke.title} className={openClass} onClick={(event) => openRef(spoke.ref, event.currentTarget)}>
                  {spoke.title || "call"}
                </button>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No call with the client is recorded in Clio.</p>
          )}
        </Row>
      </dl>
    </section>
  );
}
