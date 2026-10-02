"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CheckedBrief } from "./schema";
import { CitationChips } from "./citation-chip";
import { Empty, Section } from "./section";
import { useFirst } from "./show-all";

const WEIGHTS = ["high", "medium", "low"] as const;
type Weight = (typeof WEIGHTS)[number];
const LABEL: Record<Weight, string> = { high: "High", medium: "Medium", low: "Low" };

/** The model's weight is a free string: anything other than high or low counts as medium. */
function weightOf(raw: string): Weight {
  const weight = raw.trim().toLowerCase();
  return weight === "high" || weight === "low" ? weight : "medium";
}

/** What could hurt the case, ranked by severity: one line each with its sources; the reasoning opens on request. */
export function Risks({ brief }: { brief: CheckedBrief }) {
  const ranked = WEIGHTS.flatMap((weight) => brief.flags.filter((flag) => weightOf(flag.weight) === weight));
  const { shown, more } = useFirst(ranked, 6);
  const [opened, setOpened] = useState<number | null>(null);

  return (
    <Section id="risks" label="Risks">
      {ranked.length === 0 ? (
        <Empty>The brief raises no risks on this case.</Empty>
      ) : (
        <>
          <ul className="flex flex-col divide-y border-y">
            {shown.map((flag, index) => {
              const weight = weightOf(flag.weight);
              const isOpen = opened === index;
              return (
                <li key={index} className="flex flex-col gap-1.5 py-2.5">
                  <div className="flex items-start gap-3">
                    <Badge
                      variant={weight === "high" ? "default" : weight === "medium" ? "secondary" : "outline"}
                      className="mt-0.5 w-16 shrink-0 justify-center"
                    >
                      {LABEL[weight]}
                    </Badge>
                    <p className="min-w-0 flex-1 leading-snug">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpened(isOpen ? null : index)}
                        className="cursor-pointer rounded-sm text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {flag.title}
                        <ChevronDownIcon className={cn("ml-1 inline size-3.5 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                      </button>{" "}
                      <CitationChips evidence={flag.evidence} />
                    </p>
                  </div>
                  {isOpen && flag.detail && <p className="pl-19 text-sm leading-relaxed text-muted-foreground">{flag.detail}</p>}
                </li>
              );
            })}
          </ul>
          {more && <div>{more}</div>}
        </>
      )}
    </Section>
  );
}
