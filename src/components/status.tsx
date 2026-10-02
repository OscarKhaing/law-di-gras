import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** How pressing something is: red urgent, orange worth a look soon, green done or all clear. */
export type Tone = "urgent" | "mild" | "done" | "neutral";

const DOT: Record<Tone, string> = {
  urgent: "bg-urgent",
  mild: "bg-mild",
  done: "bg-done",
  neutral: "bg-input",
};

const PILL: Record<Tone, string> = {
  urgent: "bg-urgent-soft text-urgent-ink",
  mild: "bg-mild-soft text-mild-ink",
  done: "bg-done-soft text-done-ink",
  neutral: "bg-muted text-muted-foreground",
};

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", DOT[tone], className)} />;
}

/** A status in a few words, with its colour; the words carry the meaning, the colour only speeds reading. */
export function StatusPill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        PILL[tone],
        className,
      )}
    >
      <StatusDot tone={tone} className="size-1.5" />
      {children}
    </span>
  );
}

/** A small count on a tab or a filter, coloured by the most pressing thing it counts. */
export function CountBadge({ tone, count, label }: { tone: Tone; count: number; label: string }) {
  return (
    <span
      aria-label={`${count} ${label}`}
      title={`${count} ${label}`}
      className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums", PILL[tone])}
    >
      {count}
    </span>
  );
}
