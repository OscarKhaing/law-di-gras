import { byRef, parseSource } from "@/features/cases/schema";
import type { SectionProps } from "./schema";
import { SourceLinks } from "./source-panel";

/**
 * Injuries and procedures, most serious first: the injury in the serif face, as the records name
 * it, where treatment stands beside it, and the pages of the records it comes from.
 */
export function Injuries({ file, stored }: SectionProps) {
  const injuries = stored.brief.injuries;
  const entries = byRef(file);

  return (
    <section aria-labelledby="injuries" className="space-y-3">
      <div className="space-y-1">
        <h2 id="injuries" className="font-heading text-xl font-semibold tracking-tight">
          Injuries
        </h2>
        {injuries.length > 0 && (
          <p className="text-sm text-muted-foreground">Most serious first, with where treatment stands.</p>
        )}
      </div>

      {injuries.length === 0 ? (
        <p className="border-y py-3 text-sm text-muted-foreground">The brief names no injuries for this case.</p>
      ) : (
        <dl className="divide-y border-y">
          {injuries.map((item, index) => (
            <div key={index} className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
              <dt className="font-serif text-[17px] leading-snug text-pretty">{item.injury}</dt>
              <dd className="space-y-1">
                {item.state ? (
                  <p className="max-w-prose text-sm leading-relaxed">{item.state}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">The file does not say where treatment stands.</p>
                )}
                {item.evidence.some((source) => entries.has(parseSource(source.source).ref)) ? (
                  <SourceLinks evidence={item.evidence} />
                ) : (
                  <p className="text-xs text-muted-foreground">The brief gives no source for this.</p>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
