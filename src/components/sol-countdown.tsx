import { compactDays, formatDate, urgency } from "@/lib/calc";
import { cn } from "@/lib/utils";

/**
 * The statute of limitations as a countdown: "142d" in the warning colour under 90 days and the
 * danger colour under 30, always with words too, so colour is never the only signal.
 */
export function SolCountdown({
  sol,
  days,
  satisfied,
  withDate = false,
  className,
}: {
  sol: string;
  days: number | null;
  satisfied: boolean;
  withDate?: boolean;
  className?: string;
}) {
  if (!sol || days === null) return <span className={cn("text-muted-foreground", className)}>Not in Clio</span>;
  const date = withDate ? <span className="text-muted-foreground">{formatDate(sol)} </span> : null;
  if (satisfied) {
    return (
      <span className={cn("font-mono", className)}>
        {date}
        <span className="text-muted-foreground">met</span>
      </span>
    );
  }
  const level = urgency(days);
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        level === "danger" && "text-danger",
        level === "warning" && "text-warning",
        className,
      )}
    >
      {date}
      {days < 0 ? `passed ${compactDays(days)} ago` : `${compactDays(days)}${level === "calm" ? "" : " left"}`}
    </span>
  );
}
