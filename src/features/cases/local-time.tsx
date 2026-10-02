"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

function format(iso: string, timeZone?: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(date);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(date);
  return `${day} at ${time}`;
}

/**
 * A moment as the reader's own clock shows it: "Oct 2 at 10:42 AM". The server cannot know the
 * reader's time zone, so it renders the time in UTC and the browser replaces it once it is running.
 */
export function LocalTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => format(iso),
    () => `${format(iso, "UTC")} UTC`,
  );
  return <time dateTime={iso}>{text}</time>;
}
