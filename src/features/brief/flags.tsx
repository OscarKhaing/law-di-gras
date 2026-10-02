"use client";

import { byRef, parseSource } from "@/features/cases/schema";
import { cn } from "@/lib/utils";
import { useFold } from "./fold";
import type { SectionProps } from "./schema";
import { SourceLinks } from "./source-panel";

const WEIGHTS = ["high", "medium", "low"] as const;
type Weight = (typeof WEIGHTS)[number];

const LABEL: Record<Weight, string> = { high: "High", medium: "Medium", low: "Low" };

/** The model's weight is a free string: anything other than high or low counts as medium. */
function weightOf(raw: string): Weight {
  const weight = raw.trim().toLowerCase();
  return weight === "high" || weight === "low" ? weight : "medium";
}

/**
 * Red flags: weaknesses, contradictions inside the file and things nobody has done, heaviest first.
 * One ledger row each: what is wrong on the left, and on the right the passages it rests on, one
 * under the other in the marker, so the two sides of a contradiction can be read against each other.
 * This is one of the two places where passages are written out on the brief.
 */
export function Flags({ file, stored }: SectionProps) {
  const entries = byRef(file);
  const rank = (raw: string) => WEIGHTS.indexOf(weightOf(raw));
  // Stable: flags of one weight keep the order the brief gave them.
  const flags = [...stored.brief.flags].sort((a, b) => rank(a.weight) - rank(b.weight));
  const { shown, control } = useFold(flags);
  const counts = WEIGHTS.map((weight) => {
    const count = flags.filter((flag) => weightOf(flag.weight) === weight).length;
    return count > 0 ? `${count} ${LABEL[weight].toLowerCase()}` : "";
  }).filter(Boolean);

  return (
    <section aria-labelledby="red-flags" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="red-flags" className="font-heading text-xl font-semibold tracking-tight">
          Red flags
        </h2>
        {flags.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Heaviest first: {counts.join(", ")}. Select a passage to read it where it was written.
          </p>
        )}
      </div>

      {flags.length === 0 ? (
        <p className="border-y py-3 text-sm text-muted-foreground">The brief raises no red flags on this case.</p>
      ) : (
        <ul className="divide-y border-y">
          {shown.map((flag, index) => {
            const weight = weightOf(flag.weight);
            return (
              <li key={index} className="grid gap-x-8 gap-y-2 py-2.5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
                <div className="space-y-1">
                  <h3 className="flex items-baseline gap-2 text-[15px] leading-snug font-semibold text-pretty">
                    <span className="shrink-0" title={`${LABEL[weight]} weight`}>
                      <WeightMark weight={weight} />
                      <span className="sr-only">{LABEL[weight]} weight: </span>
                    </span>
                    {flag.title}
                  </h3>
                  {flag.detail && <p className="text-sm leading-5">{flag.detail}</p>}
                </div>
                {flag.evidence.some((item) => entries.has(parseSource(item.source).ref)) ? (
                  <div className="self-start border-l-2 border-marker pl-3">
                    <SourceLinks evidence={flag.evidence} quotes />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">The brief gives no source for this.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {control}
    </section>
  );
}

/** Three bars, filled by weight: the heavier the flag, the more ink. */
function WeightMark({ weight }: { weight: Weight }) {
  const filled = weight === "high" ? 3 : weight === "medium" ? 2 : 1;
  return (
    <span aria-hidden className="inline-flex items-end gap-0.5">
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={cn("w-1 rounded-[1px]", bar <= filled ? "bg-foreground" : "bg-input")}
          style={{ height: 4 + bar * 3 }}
        />
      ))}
    </span>
  );
}
