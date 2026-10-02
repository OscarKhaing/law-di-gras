import { cn } from "@/lib/utils";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Text from Clio can carry HTML character codes (`&quot;`, `&#39;`); write them as the characters they stand for. */
export function decodeEntities(text: string) {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, decimal, hex, name) => {
    if (decimal) return String.fromCodePoint(Number(decimal));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** A passage quoted from the record, drawn as a marker stroke; brighter while it is the one shown. */
export function Quote({ text, lit = false, className }: { text: string; lit?: boolean; className?: string }) {
  return (
    <mark
      className={cn(
        "box-decoration-clone px-0.5 font-serif text-[13px] leading-relaxed text-foreground transition-colors",
        lit ? "bg-marker" : "bg-marker/45 group-hover/quote:bg-marker",
        className,
      )}
    >
      {/* Dot leaders ("Total ........ $5.00") are shortened so the quote reads as a sentence. */}
      {decodeEntities(text).replace(/\s*\.{4,}\s*/g, " … ")}
    </mark>
  );
}
