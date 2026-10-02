"use client";

import { Printer } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog; the reader chooses the printer, or saves a PDF, there. */
export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer aria-hidden />
      Print
    </Button>
  );
}

const subscribe = () => () => {};

function format(iso: string, timeZone?: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone }).format(date);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(date);
  return `${day} at ${time}`;
}

/**
 * A moment on the reader's own clock, with its year because paper outlives the year it was printed
 * in: "Mar 4, 2031 at 10:42 AM". The server cannot know the reader's time zone, so it writes the
 * time in UTC and the browser replaces it once it is running.
 */
export function Stamp({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => format(iso),
    () => `${format(iso, "UTC")} UTC`,
  );
  return <time dateTime={iso}>{text || "at a time that was not recorded"}</time>;
}
