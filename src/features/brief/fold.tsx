"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** How many rows a ledger on the brief shows before the rest is asked for. */
export const FIRST_ROWS = 5;

export const foldClass =
  "cursor-pointer rounded-sm text-sm font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * A long ledger shows its first rows and a control for the rest, so the brief stays a short read.
 * Returns the rows to draw and the control to put under them (null when everything already shows).
 */
export function useFold<T>(items: T[], first = FIRST_ROWS): { shown: T[]; control: ReactNode } {
  const [all, setAll] = useState(false);
  if (items.length <= first) return { shown: items, control: null };
  return {
    shown: all ? items : items.slice(0, first),
    control: (
      <button type="button" aria-expanded={all} onClick={() => setAll(!all)} className={foldClass}>
        {all ? `Show the first ${first}` : `Show all ${items.length}`}
      </button>
    ),
  };
}

/** A section that is closed until asked for: its heading is the control. */
export function Disclosure({
  title,
  remark,
  children,
  className,
}: {
  title: string;
  remark?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("group/more border-y", className)}>
      <summary className="flex cursor-pointer list-none items-baseline gap-x-3 rounded-sm py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className="font-heading text-lg font-semibold tracking-tight">{title}</span>
        {remark && <span className="text-sm text-muted-foreground">{remark}</span>}
        <span className="ml-auto text-sm font-medium text-primary underline-offset-2 group-open/more:hidden hover:underline">
          Show
        </span>
        <span className="ml-auto hidden text-sm font-medium text-primary underline-offset-2 group-open/more:inline hover:underline">
          Hide
        </span>
      </summary>
      <div className="pb-3">{children}</div>
    </details>
  );
}
