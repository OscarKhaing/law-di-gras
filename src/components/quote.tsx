import { cn } from "@/lib/utils";

/** Words quoted from a source, drawn as a marker stroke; brighter while it is the passage being shown. */
export function Quote({ text, lit = false, className }: { text: string; lit?: boolean; className?: string }) {
  return (
    <mark
      className={cn(
        "box-decoration-clone px-0.5 font-serif text-foreground transition-colors",
        lit ? "bg-marker" : "bg-marker/45",
        className,
      )}
    >
      {/* Dot leaders ("Total ........ $5.00") are shortened so the quote reads as a sentence. */}
      {text.replace(/\s*\.{4,}\s*/g, " … ")}
    </mark>
  );
}
