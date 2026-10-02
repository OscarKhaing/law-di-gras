"use client";

import { useSyncExternalStore } from "react";

const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const subscribe = () => () => {};

/**
 * A timestamp in the reader's own time zone. The server does not know it, so the server renders
 * nothing and the browser fills it in, which avoids a hydration mismatch.
 */
export function LocalTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => (Number.isNaN(Date.parse(iso)) ? "" : format.format(new Date(iso))),
    () => "",
  );
  return <time dateTime={iso}>{text}</time>;
}
