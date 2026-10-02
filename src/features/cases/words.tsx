// How the screens say things about a case: the firm's word for each kind of entry, and dates as a
// reader thinks of them ("3 days late", "in 5 months"). Pure functions, safe on server and browser.

import type { EntryKind } from "./schema";

/** The firm's word for each kind of entry. */
export const KIND_WORD: Record<EntryKind, string> = {
  note: "note",
  email: "email",
  call: "call",
  task: "task",
  event: "calendar",
  expense: "expense",
  document: "document",
  field: "field",
  contact: "contact",
};

const DAY = 86_400_000;
const toTime = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`).getTime();

/** Whole days from one YYYY-MM-DD to another; negative when `to` is earlier. NaN for an unreadable date. */
export function daysBetween(from: string, to: string) {
  return Math.round((toTime(to) - toTime(from)) / DAY);
}

/** The day `count` days after (or, negative, before) a YYYY-MM-DD day. */
export function addDays(day: string, count: number) {
  return new Date(toTime(day) + count * DAY).toISOString().slice(0, 10);
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** A length of time in the largest units that read naturally: "12 days", "5 months", "1 year 7 months". */
export function span(days: number) {
  const length = Math.abs(days);
  if (length < 60) return plural(length, "day");
  const months = Math.round(length / 30.44);
  if (months < 24) return plural(months, "month");
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${plural(years, "year")} ${plural(rest, "month")}` : plural(years, "year");
}

/** Where a day sits against today: "today", "12 days ago", "in 5 months". "" for an unreadable date. */
export function fromToday(day: string, today: string) {
  const days = daysBetween(day, today);
  if (Number.isNaN(days)) return "";
  if (days === 0) return "today";
  return days > 0 ? `${span(days)} ago` : `in ${span(days)}`;
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** An amount in dollars, without cents when there are none. */
export function dollars(amount: number) {
  return money.format(amount).replace(/\.00$/, "");
}
