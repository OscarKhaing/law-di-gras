import { byRef, parseSource } from "@/features/cases/schema";
import { StatusDot, StatusPill, type Tone } from "@/components/status";
import { cn } from "@/lib/utils";
import type { SectionProps } from "./schema";
import { SourceLinks } from "./source-panel";

const WEIGHTS = ["high", "medium", "low"] as const;
type Weight = (typeof WEIGHTS)[number];

const LABEL: Record<Weight, string> = { high: "High", medium: "Medium", low: "Low" };
const TONE: Record<Weight, Tone> = { high: "urgent", medium: "mild", low: "neutral" };

/** The model's weight is a free string: anything other than high or low counts as medium. */
export function weightOf(raw: string): Weight {
  const weight = raw.trim().toLowerCase();
  return weight === "high" || weight === "low" ? weight : "medium";
}

/**
 * Red flags: weaknesses, contradictions inside the file and things nobody has done, heaviest first.
 * Flags of the same weight share a ledger row. The passages a flag rests on are set one under the
 * other in the marker, so the two sides of a contradiction can be read against each other.
 */
export function Flags({ file, stored }: SectionProps) {
  const flags = stored.brief.flags;
  const entries = byRef(file);
  const groups = WEIGHTS.map((weight) => ({
    weight,
    flags: flags.filter((flag) => weightOf(flag.weight) === weight),
  })).filter((group) => group.flags.length > 0);

  return (
    <section aria-labelledby="red-flags" className="space-y-3">
      <div className="space-y-1">
        <h2 id="red-flags" className="font-heading text-xl font-semibold tracking-tight">
          Red flags
        </h2>
        {flags.length > 0 && (
          <p className="max-w-prose text-sm text-muted-foreground">
            Weaknesses, contradictions inside the file and things nobody has done, heaviest first. Select a passage to
            read it where it was written.
          </p>
        )}
      </div>

      {flags.length === 0 ? (
        <p className="border-y py-3 text-sm text-muted-foreground">The brief raises no red flags on this case.</p>
      ) : (
        <div className="divide-y border-y">
          {groups.map((group) => (
            <div key={group.weight} className="grid gap-x-6 gap-y-2 py-4 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
              <h3 className="flex items-center gap-2 self-start text-sm sm:pt-0.5">
                <StatusPill tone={TONE[group.weight]}>{LABEL[group.weight]}</StatusPill>
                <span className="text-muted-foreground tabular-nums">{group.flags.length}</span>
              </h3>
              <ul className="space-y-5">
                {group.flags.map((flag, index) => (
                  <li key={index} className="space-y-1.5">
                    <h4
                      className={cn(
                        "flex items-baseline gap-2 text-pretty",
                        group.weight === "high" && "text-[17px] leading-snug font-semibold",
                        group.weight === "medium" && "text-[15px] leading-snug font-medium",
                        group.weight === "low" && "text-sm",
                      )}
                    >
                      <StatusDot tone={TONE[group.weight]} className="relative -top-px" />
                      {flag.title}
                    </h4>
                    {flag.detail && (
                      <p
                        className={cn(
                          "max-w-prose text-sm leading-relaxed",
                          group.weight === "low" && "text-muted-foreground",
                        )}
                      >
                        {flag.detail}
                      </p>
                    )}
                    {flag.evidence.some((item) => entries.has(parseSource(item.source).ref)) ? (
                      // One passage under the other, each with its source, tied together by a marker rule.
                      <div className="mt-2 max-w-prose border-l-2 border-marker pl-3 [&_mark]:text-[15px]">
                        <SourceLinks evidence={flag.evidence} quotes />
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">The brief gives no source for this.</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

