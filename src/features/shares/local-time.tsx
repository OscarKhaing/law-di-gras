"use client";

import { useSyncExternalStore } from "react";

type Style = "date" | "moment" | "sent";

const day = (zone?: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: zone });
const shortDay = (zone?: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: zone });
const clock = (zone?: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone });

/** "date": Oct 2, 2026. "moment": Oct 2, 2026 at 3:12 PM. "sent": at 3:12 PM today, otherwise on Oct 2 at 3:12 PM. */
function format(iso: string, style: Style, zone?: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const suffix = zone ? ` ${zone}` : "";
  if (style === "date") return day(zone).format(date);
  if (style === "moment") return `${day(zone).format(date)} at ${clock(zone).format(date)}${suffix}`;
  const today = day(zone).format(new Date()) === day(zone).format(date);
  return `${today ? "" : `on ${shortDay(zone).format(date)} `}at ${clock(zone).format(date)}${suffix}`;
}

const never = () => () => {};

/**
 * A time in the reader's own time zone. The server does not know that zone, so it writes the time
 * in UTC and says so; the reader's browser replaces it as soon as the page is live.
 */
export function LocalTime({ iso, style = "moment" }: { iso: string; style?: Style }) {
  const text = useSyncExternalStore(
    never,
    () => format(iso, style),
    () => format(iso, style, "UTC"),
  );
  return <time dateTime={iso}>{text}</time>;
}
