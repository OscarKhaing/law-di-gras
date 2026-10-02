import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** The surface every block of a page sits on: white, softly rounded, a hairline border and a faint lift. */
export const panelClass = "rounded-2xl border bg-card shadow-xs";

/** A block of content on its own card, so blocks are told apart by space rather than by rules. */
export function Panel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(panelClass, "p-5 sm:p-6", className)} {...props} />;
}
