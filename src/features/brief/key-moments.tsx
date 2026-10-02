"use client";

import { formatDate } from "@/lib/calc";
import type { CheckedBrief } from "./schema";
import { CitationChips } from "./citation-chip";
import { Empty, Section } from "./section";
import { useFirst } from "./show-all";

const SHOWN = 8;

/** The moments that matter, newest first, as a vertical timeline: date, one line, and its source. */
export function KeyMoments({ brief }: { brief: CheckedBrief }) {
  const moments = [...brief.moments].sort((a, b) => b.date.localeCompare(a.date));
  const { shown, more } = useFirst(moments, SHOWN);
  return (
    <Section id="key-moments" label="Key moments">
      {moments.length === 0 ? (
        <Empty>The brief picks out no moments for this case.</Empty>
      ) : (
        <>
          <ol className="flex flex-col border-l">
            {shown.map((moment, index) => (
              <li key={`${moment.date}-${index}`} className="relative flex flex-col gap-1 py-2.5 pl-5 sm:flex-row sm:gap-4">
                <span aria-hidden className="absolute top-4 -left-[5px] size-2.5 rounded-full border-2 border-background bg-primary" />
                <time dateTime={moment.date} className="w-28 shrink-0 font-mono text-sm text-muted-foreground">
                  {formatDate(moment.date) || "Undated"}
                </time>
                <p className="min-w-0 flex-1 leading-relaxed">
                  {moment.title} <CitationChips evidence={moment.evidence} />
                </p>
              </li>
            ))}
          </ol>
          {more && <div>{more}</div>}
        </>
      )}
    </Section>
  );
}
