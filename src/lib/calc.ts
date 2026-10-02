// Pure helpers for what the screens show as numbers: money, dates and day counts. Browser-safe.
// Every figure on screen that is a sum, a gap or a count of days comes from here or from
// features/cases/schema.ts, never from a model.

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "$118,400". */
export function usd(amount: number) {
  return currency.format(amount);
}

const DAY_MS = 86_400_000;
const time = (day: string) => Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
const isDay = (day: string) => /^\d{4}-\d{2}-\d{2}/.test(day) && !Number.isNaN(time(day));

/** Whole days from `today` to `day` (both YYYY-MM-DD): positive ahead, negative past, null when either is not a date. */
export function daysUntil(day: string, today: string): number | null {
  if (!isDay(day) || !isDay(today)) return null;
  return Math.round((time(day) - time(today)) / DAY_MS);
}

const long = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const numeric = new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric", timeZone: "UTC" });

/** The one date format: "Apr 23, 2023". `short` gives "4/23". An empty or unreadable date gives "". */
export function formatDate(day: string, short = false) {
  if (!isDay(day)) return "";
  return (short ? numeric : long).format(new Date(time(day)));
}

/** A count of days as the table writes it: "142d". */
export function compactDays(days: number) {
  return `${Math.abs(days)}d`;
}

/** Today in the server's calendar as YYYY-MM-DD, so every section of a page agrees on it. */
export function todayIso(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** How urgent a count of days is: under 30 is danger, under 90 a warning. */
export function urgency(days: number | null): "danger" | "warning" | "calm" {
  if (days === null) return "calm";
  if (days < 30) return "danger";
  if (days < 90) return "warning";
  return "calm";
}

/** True when `iso` is more than a day before now: a read of Clio that old is stale. */
export function olderThanADay(iso: string, now = Date.now()) {
  const at = Date.parse(iso);
  return !Number.isNaN(at) && now - at > DAY_MS;
}
