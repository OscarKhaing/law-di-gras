"use client";

import { byRef, parseSource } from "@/features/cases/schema";
import { useFold } from "./fold";
import type { SectionProps } from "./schema";
import { SourceLinks } from "./source-panel";

/**
 * Injuries and procedures, most serious first: the injury in the serif face, as the records name
 * it, where treatment stands beside it, and the pages of the records it comes from.
 */
export function Injuries({ file, stored }: SectionProps) {
  const injuries = stored.brief.injuries;
  const entries = byRef(file);
  const { shown, control } = useFold(injuries);

  return (
    <section aria-labelledby="injuries" className="space-y-3">
      <h2 id="injuries" className="font-heading text-xl font-semibold tracking-tight">
        Injuries, most serious first
      </h2>

      {injuries.length === 0 ? (
        <p className="border-y py-3 text-sm text-muted-foreground">The brief names no injuries for this case.</p>
      ) : (
        <dl className="divide-y border-y">
          {shown.map((item, index) => (
            <div key={index} className="py-1.5">
              <dt className="font-serif text-[15px] leading-snug text-pretty">{item.injury}</dt>
              <dd className="text-sm leading-5">
                {item.state ? (
                  <>{item.state} </>
                ) : (
                  <span className="text-muted-foreground">The file does not say where treatment stands. </span>
                )}
                {item.evidence.some((source) => entries.has(parseSource(source.source).ref)) ? (
                  <SourceLinks evidence={item.evidence} />
                ) : (
                  <span className="text-xs text-muted-foreground">The brief gives no source for this.</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {control}
    </section>
  );
}
