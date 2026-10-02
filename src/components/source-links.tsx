import { cn } from "@/lib/utils";

/** One piece of evidence: a ref such as "N12" or "D9 p.212", the quote, and whether code found the quote in it. */
export type SourceLink = { source: string; quote: string; found?: boolean };

/**
 * The sources behind a statement, as small links after it. `describe` turns a ref into words the
 * reader knows ("Call, Jun 24"); a quote that code could not find in its source is shown muted.
 */
export function SourceLinks({
  evidence,
  describe,
  onOpen,
  className,
}: {
  evidence: SourceLink[];
  describe: (source: string) => string;
  onOpen: (link: SourceLink) => void;
  className?: string;
}) {
  if (evidence.length === 0) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-x-3 gap-y-1 text-xs", className)}>
      {evidence.map((link, index) => (
        <button
          key={`${link.source}-${index}`}
          type="button"
          onClick={() => onOpen(link)}
          title={link.found === false ? "The quote was not found word for word in this source" : undefined}
          className={cn(
            "font-medium underline-offset-2 hover:underline",
            link.found === false ? "text-muted-foreground" : "text-primary",
          )}
        >
          {describe(link.source)}
          {link.found === false && <span className="sr-only"> (quote not found in this source)</span>}
        </button>
      ))}
    </span>
  );
}
