import { cn } from "@/lib/utils";

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
      {text.replace(/\s*\.{4,}\s*/g, " … ")}
    </mark>
  );
}
