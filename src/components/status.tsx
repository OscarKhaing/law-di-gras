import { CircleCheck, Clock, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** How pressing something is: red urgent, yellow worth a look soon, green done or all clear. */
export type Tone = "urgent" | "mild" | "done" | "neutral";

const INK: Record<Tone, string> = {
  urgent: "text-urgent-ink",
  mild: "text-mild-ink",
  done: "text-done-ink",
  neutral: "text-muted-foreground",
};

// A pale ground with dark words and a faint outline: the outline keeps a pill visible on the
// off-white page, where the pale grounds alone almost disappear.
const PILL: Record<Tone, string> = {
  urgent: "bg-urgent-soft text-urgent-ink ring-urgent-ink/20",
  mild: "bg-mild-soft text-mild-ink ring-mild-ink/25",
  done: "bg-done-soft text-done-ink ring-done-ink/20",
  neutral: "bg-muted text-muted-foreground ring-foreground/10",
};

// Counts are the one place for solid colour; dark figures on yellow, which white would fail on.
const COUNT: Record<Tone, string> = {
  urgent: "bg-urgent text-white",
  mild: "bg-mild text-foreground",
  done: "bg-done-soft text-done-ink ring-1 ring-inset ring-done-ink/20",
  neutral: "bg-muted text-muted-foreground",
};

/**
 * The shape that carries a status without its colour, for readers who cannot tell red from green:
 * a filled warning sign for urgent, a clock for soon, a tick for done.
 */
export function StatusIcon({ tone, className }: { tone: Tone; className?: string }) {
  const base = cn("size-3.5 shrink-0", INK[tone], className);
  if (tone === "urgent") return <TriangleAlert aria-hidden className={cn(base, "fill-urgent-ink stroke-urgent-soft")} />;
  if (tone === "mild") return <Clock aria-hidden className={base} />;
  if (tone === "done") return <CircleCheck aria-hidden className={base} />;
  return <span aria-hidden className={cn("inline-block size-1.5 shrink-0 rounded-full bg-muted-foreground/60", className)} />;
}

/** A status in a few words, with its icon and colour; the words carry the meaning, the rest speeds reading. */
export function StatusPill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        PILL[tone],
        className,
      )}
    >
      <StatusIcon tone={tone} className="size-3" />
      {children}
    </span>
  );
}

/** A small count on a menu item or a filter, coloured by the most pressing thing it counts. */
export function CountBadge({ tone, count, label }: { tone: Tone; count: number; label: string }) {
  return (
    <span
      aria-label={`${count} ${label}`}
      title={`${count} ${label}`}
      className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums", COUNT[tone])}
    >
      {count}
    </span>
  );
}
