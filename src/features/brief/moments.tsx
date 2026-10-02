"use client";

import { memo, useMemo, useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { shortDate, type EntryKind } from "@/features/cases/schema";
import { addDays, daysBetween, KIND_WORD, span } from "@/features/cases/words";
import { cn } from "@/lib/utils";
import { LANES, type SectionProps } from "./schema";
import { SourceLinks, useSource } from "./source-panel";

// ---- What is drawn ----

/** The rows of the strip: every dated entry of the file sits on one of them, by what it is. */
const ROWS: { label: string; kinds: EntryKind[] }[] = [
  { label: "Notes, tasks, costs", kinds: ["note", "task", "expense"] },
  { label: "Emails and calls", kinds: ["email", "call"] },
  { label: "Documents", kinds: ["document"] },
  { label: "Calendar", kinds: ["event"] },
];

const RANGES = [
  { id: "all", label: "Whole case", days: 0, words: "the whole case" },
  { id: "year", label: "Last 12 months", days: 365, words: "the last 12 months" },
  { id: "quarter", label: "Last 90 days", days: 90, words: "the last 90 days" },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const ROW_HEIGHT = 24;
const LEVEL_HEIGHT = 24;
const AXIS_HEIGHT = 40;
/** How far apart two numbers must be, as a share of the strip's width, to sit on the same level. */
const MIN_GAP = 3.2;
/** A stretch with nothing dated in the file is pointed out once it is this many days long. */
const QUIET_DAYS = 60;

const COLUMNS = "grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-3 pl-2";

const NUMBER_WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const inWords = (count: number) => NUMBER_WORDS[count] ?? String(count);
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const time = (day: string) => Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
const isDay = (day: string) => /^\d{4}-\d{2}-\d{2}/.test(day) && !Number.isNaN(time(day));
const monthName = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

type Mark = { ref: string; day: string; kind: EntryKind; title: string; row: number };
type Placed = Mark & { left: number };
type Hover = { mark: Placed; more: number };
type AxisMark = { left: number; label: string; major: boolean };

/** Month starts (and, on a short strip, weeks) between two days, labelled as the length of the strip allows. */
function axisMarks(start: string, end: string, at: (day: string) => number): AxisMark[] {
  const months = daysBetween(start, end) / 30.44;
  const marks: AxisMark[] = [];
  const cursor = new Date(time(start));
  cursor.setUTCDate(1);
  for (cursor.setUTCMonth(cursor.getUTCMonth() + 1); cursor.getTime() <= time(end); cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    const january = cursor.getUTCMonth() === 0;
    const year = String(cursor.getUTCFullYear());
    const month = monthName.format(cursor);
    const label = months > 14 ? (january ? year : "") : january ? `${month} ${year}` : month;
    marks.push({ left: at(cursor.toISOString().slice(0, 10)), label, major: january || months <= 4 });
  }
  if (months <= 4) {
    // On a strip of a few months, a small tick for every Monday.
    for (let day = start; day <= end; day = addDays(day, 1)) {
      if (new Date(time(day)).getUTCDay() === 1) marks.push({ left: at(day), label: "", major: false });
    }
  }
  return marks;
}

/** Numbers too close to share a level step up, each on a stem down to its day. `moments` is oldest first. */
function onLevels<T extends { day: string }>(moments: T[], at: (day: string) => number) {
  const lastOnLevel: number[] = [];
  const placed = moments.map((moment) => {
    const left = at(moment.day);
    let level = lastOnLevel.findIndex((last) => left - last >= MIN_GAP);
    if (level < 0) level = lastOnLevel.length;
    lastOnLevel[level] = left;
    return { ...moment, left, level };
  });
  return { placed, levels: Math.max(1, lastOnLevel.length) };
}

/** Where a day falls between two others, as a percentage of the way across. */
function across(start: string, end: string) {
  const width = time(end) - time(start);
  return (day: string) => ((time(day) - time(start)) / width) * 100;
}

/** The ticks of one row. Kept apart so that pointing at the strip does not redraw every entry. */
const TickRow = memo(function TickRow({ marks, wide }: { marks: Placed[]; wide: boolean }) {
  return (
    <div className="relative border-t border-border" style={{ height: ROW_HEIGHT }}>
      {marks.map((mark) => (
        <span
          key={mark.ref}
          className={cn("absolute top-1 h-4 bg-foreground/35", wide ? "w-0.5" : "w-px")}
          style={{ left: `${mark.left}%` }}
        />
      ))}
    </div>
  );
});

function NumberMark({ number, selected }: { number: number; selected: boolean }) {
  return (
    <span
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full border text-[11px] leading-none font-medium tabular-nums",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-foreground/60 bg-background",
      )}
    >
      {number}
    </span>
  );
}

/**
 * The moments that matter: a strip of the whole life of the case, every dated entry a faint line,
 * with the moments the brief picked numbered above it, and the same moments as a ledger below.
 * Selecting a number on the strip marks its row in the ledger, and the other way round.
 */
export function Moments({ file, stored, today }: SectionProps) {
  const { openRef } = useSource();
  const [range, setRange] = useState<RangeId>("all");
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const ledgerRows = useRef(new Map<number, HTMLLIElement>());

  const incident = stored.brief.incident.date;
  const picked = stored.brief.moments;

  // Everything that does not depend on the period shown.
  const whole = useMemo(() => {
    const marks: Mark[] = file.entries.flatMap((entry) => {
      const row = ROWS.findIndex((candidate) => candidate.kinds.includes(entry.kind));
      if (row < 0 || !isDay(entry.date)) return [];
      return [{ ref: entry.ref, day: entry.date.slice(0, 10), kind: entry.kind, title: entry.title, row }];
    });
    marks.sort((a, b) => a.day.localeCompare(b.day));

    const moments = picked
      .map((moment) => ({ ...moment, day: isDay(moment.date) ? moment.date.slice(0, 10) : "" }))
      .sort((a, b) => (a.day || "9999").localeCompare(b.day || "9999"))
      .map((moment, index) => ({ ...moment, number: index + 1 }));
    const momentDays = moments.map((moment) => moment.day).filter(Boolean);

    const fromIncident = isDay(incident);
    let start = fromIncident ? incident.slice(0, 10) : (marks[0]?.day ?? momentDays[0] ?? today);
    if (momentDays[0] && momentDays[0] < start) start = momentDays[0];
    if (start > today) start = today;
    const end = [today, marks.at(-1)?.day ?? today, momentDays.at(-1) ?? today].sort().at(-1)!;

    // The longest stretch, up to today, with nothing dated in the file.
    const days = [...new Set(marks.map((mark) => mark.day).filter((day) => day >= start && day <= today)), today].sort();
    let quiet: { from: string; to: string; days: number } | null = null;
    for (let index = 1; index < days.length; index++) {
      const length = daysBetween(days[index - 1], days[index]);
      if (length >= QUIET_DAYS && length > (quiet?.days ?? 0)) quiet = { from: days[index - 1], to: days[index], days: length };
    }

    return {
      marks,
      moments,
      start,
      end,
      quiet,
      // The room the numbers need above the whole case, kept at every period so nothing below moves.
      levels: onLevels(moments.filter((moment) => moment.day !== ""), across(start, end > start ? end : addDays(start, 1))).levels,
      startsAtIncident: fromIncident && start === incident.slice(0, 10),
      earlier: marks.filter((mark) => mark.day < start).length,
    };
  }, [file, picked, incident, today]);

  // The period shown, and where everything in it falls across the strip.
  const shown = useMemo(() => {
    const period = RANGES.find((candidate) => candidate.id === range)!;
    let start = whole.start;
    let end = whole.end;
    if (period.days > 0) {
      const from = addDays(today, -period.days);
      start = from > whole.start ? from : whole.start;
      end = today;
    }
    if (end <= start) end = addDays(start, 1);
    const at = across(start, end);
    const inside = (day: string) => day !== "" && day >= start && day <= end;

    const rows = ROWS.map((_, row) =>
      whole.marks.filter((mark) => mark.row === row && inside(mark.day)).map((mark) => ({ ...mark, left: at(mark.day) })),
    );

    const { placed: moments, levels } = onLevels(whole.moments.filter((moment) => inside(moment.day)), at);

    return {
      period,
      start,
      end,
      at,
      inside,
      rows,
      moments,
      levels: Math.max(levels, whole.levels),
      count: rows.reduce((sum, row) => sum + row.length, 0),
      axis: axisMarks(start, end, at),
      quiet: whole.quiet && whole.quiet.to > start && whole.quiet.from < end ? whole.quiet : null,
    };
  }, [whole, range, today]);

  const total = whole.moments.length;
  const zone = shown.levels * LEVEL_HEIGHT + 4;
  const rowsHeight = ROWS.length * ROW_HEIGHT;
  const todayLeft = shown.at(today);
  const chosen = shown.moments.find((moment) => moment.number === selected);

  function pickOnStrip(number: number) {
    setSelected(number === selected ? null : number);
    ledgerRows.current.get(number)?.scrollIntoView({ block: "nearest" });
  }

  function pickInLedger(number: number, day: string) {
    setSelected(number === selected ? null : number);
    // A moment outside the period shown widens the strip again, so its number can be seen on it.
    if (number !== selected && day && !shown.inside(day)) setRange("all");
  }

  function point(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const left = ((event.clientX - box.left) / box.width) * 100;
    const row = Math.floor((event.clientY - box.top) / ROW_HEIGHT);
    const reach = (7 / box.width) * 100;
    let nearest: Placed | null = null;
    for (const mark of shown.rows[row] ?? []) {
      if (Math.abs(mark.left - left) <= reach && (!nearest || Math.abs(mark.left - left) < Math.abs(nearest.left - left))) {
        nearest = mark;
      }
    }
    if (nearest?.ref === hover?.mark.ref) return;
    const found = nearest;
    setHover(found ? { mark: found, more: shown.rows[row].filter((mark) => mark.day === found.day).length - 1 } : null);
  }

  const startWords = shortDate(shown.start, true);
  const described =
    `The file from ${startWords} to ${shortDate(shown.end, true)}. ` +
    ROWS.map((row, index) => `${row.label}: ${shown.rows[index].length}`).join(". ") +
    ".";

  return (
    <section aria-labelledby="moments" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="space-y-1">
          <h2 id="moments" className="font-heading text-xl font-semibold tracking-tight">
            {total > 0 ? `The ${inWords(total)} that matter` : "The moments that matter"}
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            {whole.marks.length === 0
              ? "Nothing in the file is dated, so there is no strip to draw."
              : range === "all"
                ? `Each line on the strip is one of the ${whole.marks.length} dated entries in the file.` +
                  (total > 0 ? ` The numbers are the ${inWords(total)} to know before picking it up.` : "")
                : `Each line on the strip is one of the ${shown.count} entries dated in ${shown.period.words}, out of ${whole.marks.length} in the file.` +
                  (total > 0 ? ` ${capital(inWords(shown.moments.length))} of the ${inWords(total)} to know ${shown.moments.length === 1 ? "falls" : "fall"} in that time.` : "")}
          </p>
        </div>
        {whole.marks.length > 0 && (
          <div role="group" aria-label="Period shown" className="flex gap-1.5">
            {RANGES.map((option) => (
              <Button
                key={option.id}
                size="sm"
                variant={range === option.id ? "secondary" : "ghost"}
                aria-pressed={range === option.id}
                onClick={() => {
                  setRange(option.id);
                  setHover(null);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {whole.marks.length > 0 && (
        <div className="space-y-1">
          <div className={COLUMNS}>
            <div aria-hidden className="text-xs text-muted-foreground" style={{ paddingTop: zone }}>
              {ROWS.map((row, index) => (
                <div key={row.label} className="flex items-center justify-between gap-2" style={{ height: ROW_HEIGHT }}>
                  <span className="truncate">{row.label}</span>
                  <span className="tabular-nums">{shown.rows[index].length}</span>
                </div>
              ))}
            </div>

            <div className="relative mr-3" style={{ height: zone + rowsHeight + AXIS_HEIGHT }}>
              {/* The numbered moments, each on a stem down to its day. */}
              <div className="absolute inset-x-0 top-0" style={{ height: zone }}>
                {shown.moments.map((moment) => {
                  const isSelected = moment.number === selected;
                  const rise = moment.level * LEVEL_HEIGHT + 4;
                  return (
                    <div key={moment.number} className="absolute bottom-0" style={{ left: `${moment.left}%` }}>
                      <span
                        aria-hidden
                        className={cn("absolute bottom-0 w-px -translate-x-1/2", isSelected ? "bg-primary" : "bg-foreground/40")}
                        style={{ height: rise }}
                      />
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={`Moment ${moment.number}, ${shortDate(moment.day, true)}: ${moment.title}`}
                        title={`${shortDate(moment.day, true)}: ${moment.title}`}
                        onClick={() => pickOnStrip(moment.number)}
                        className={cn(
                          "absolute -translate-x-1/2 cursor-pointer rounded-full ring-2 ring-background outline-none focus-visible:ring-ring",
                          isSelected && "z-10",
                        )}
                        style={{ bottom: rise }}
                      >
                        <NumberMark number={moment.number} selected={isSelected} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Every dated entry, a faint line on its row. */}
              <div
                role="img"
                aria-label={described}
                className={cn("absolute inset-x-0 border-b border-l border-b-border border-l-input", hover && "cursor-pointer")}
                style={{ top: zone, height: rowsHeight }}
                onPointerMove={point}
                onPointerLeave={() => setHover(null)}
                onClick={() => hover && openRef(hover.mark.ref)}
              >
                {todayLeft < 100 && (
                  <span className="absolute inset-y-0 right-0 bg-muted" style={{ left: `${Math.max(0, todayLeft)}%` }} />
                )}
                {shown.quiet && (
                  <span
                    className="absolute inset-y-0 bg-marker/45"
                    style={{
                      left: `${Math.max(0, shown.at(shown.quiet.from))}%`,
                      right: `${Math.max(0, 100 - shown.at(shown.quiet.to))}%`,
                    }}
                  />
                )}
                {shown.axis
                  .filter((mark) => mark.major)
                  .map((mark) => (
                    <span key={mark.left} className="absolute inset-y-0 w-px bg-border" style={{ left: `${mark.left}%` }} />
                  ))}
                <div className="relative">
                  {shown.rows.map((marks, row) => (
                    <TickRow key={row} marks={marks} wide={range !== "all"} />
                  ))}
                </div>
                {todayLeft >= 0 && todayLeft <= 100 && (
                  <span
                    className="absolute top-0 w-px -translate-x-1/2 bg-foreground/55"
                    style={{ left: `${todayLeft}%`, height: rowsHeight + 22 }}
                  />
                )}
                {chosen && (
                  <span
                    className="absolute inset-y-0 w-px -translate-x-1/2 bg-primary"
                    style={{ left: `${chosen.left}%` }}
                  />
                )}
                {hover && (
                  <span
                    className="absolute w-0.5 -translate-x-1/4 bg-foreground"
                    style={{ left: `${hover.mark.left}%`, top: hover.mark.row * ROW_HEIGHT + 3, height: ROW_HEIGHT - 5 }}
                  />
                )}
              </div>

              {/* Years and months, then where the strip starts and where today is. */}
              <div
                aria-hidden
                className="absolute inset-x-0 text-xs text-muted-foreground"
                style={{ top: zone + rowsHeight, height: AXIS_HEIGHT }}
              >
                {shown.axis.map((mark, index) => (
                  <span key={index} className="absolute top-0 flex" style={{ left: `${mark.left}%` }}>
                    <span className={cn("w-px bg-input", mark.label ? "h-2" : "h-1")} />
                    {mark.label && mark.left < 95 && <span className="pt-0.5 pl-1 leading-4 tabular-nums">{mark.label}</span>}
                  </span>
                ))}
                <span className="absolute bottom-0 left-0 leading-4">
                  {range === "all" && whole.startsAtIncident ? `Incident, ${startWords}` : `From ${startWords}`}
                </span>
                {todayLeft >= 0 && todayLeft <= 100 && (
                  <span
                    className={cn("absolute bottom-0 leading-4 text-foreground", todayLeft > 50 ? "pr-1.5" : "pl-1.5")}
                    style={todayLeft > 50 ? { right: `${100 - todayLeft}%` } : { left: `${todayLeft}%` }}
                  >
                    Today
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className={COLUMNS}>
            <span />
            <div className="space-y-1">
              <p className="flex h-5 items-baseline gap-x-2 overflow-hidden text-xs text-muted-foreground">
                {hover ? (
                  <>
                    <span className="shrink-0 tabular-nums">{shortDate(hover.mark.day, true)}</span>
                    <span className="shrink-0">{KIND_WORD[hover.mark.kind]}</span>
                    <span className="truncate font-serif text-[13px] text-foreground">{hover.mark.title || "Untitled"}</span>
                    {hover.more > 0 && <span className="shrink-0">and {hover.more} more that day</span>}
                  </>
                ) : (
                  "Point at a line to see what it is; select it to open it."
                )}
              </p>
              {(whole.quiet || whole.earlier > 0) && (
                <p className="max-w-prose text-sm text-muted-foreground">
                  {whole.quiet && (
                    <>
                      The file went quiet for{" "}
                      <span className="bg-marker/45 box-decoration-clone px-0.5 text-foreground">{span(whole.quiet.days)}</span>:
                      nothing is dated between {shortDate(whole.quiet.from, true)} and{" "}
                      {whole.quiet.to === today ? "today" : shortDate(whole.quiet.to, true)}.{" "}
                    </>
                  )}
                  {whole.earlier > 0 && (
                    <>
                      {whole.earlier} {whole.earlier === 1 ? "entry is" : "entries are"} dated before{" "}
                      {shortDate(whole.start, true)} and{" "}
                      {whole.earlier === 1 ? "is" : "are"} not drawn.
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {total === 0 ? (
        <p className="border-y py-3 text-sm text-muted-foreground">The brief picks out no moments for this case.</p>
      ) : (
        <ol className="divide-y border-y">
          {whole.moments.map((moment) => {
            const isSelected = moment.number === selected;
            const lane = moment.lane.trim().toLowerCase();
            return (
              <li
                key={moment.number}
                ref={(element) => {
                  if (element) ledgerRows.current.set(moment.number, element);
                  else ledgerRows.current.delete(moment.number);
                }}
                className={cn(COLUMNS, "gap-y-1 py-3", isSelected && "bg-card shadow-[inset_2px_0_0_var(--primary)]")}
              >
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`Moment ${moment.number}, ${shortDate(moment.day, true) || "undated"}: show on the strip`}
                  onClick={() => pickInLedger(moment.number, moment.day)}
                  className="flex cursor-pointer items-start gap-2 self-start rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <NumberMark number={moment.number} selected={isSelected} />
                  <span>
                    <span className="block text-sm leading-5 tabular-nums">{shortDate(moment.day, true) || "Undated"}</span>
                    {(LANES as readonly string[]).includes(lane) && (
                      <span className="block text-xs text-muted-foreground first-letter:uppercase">{lane}</span>
                    )}
                  </span>
                </button>
                <div className="space-y-1 pr-3">
                  <h3 className="font-serif text-[17px] leading-snug text-pretty">{moment.title}</h3>
                  {moment.why && <p className="max-w-prose text-sm leading-relaxed">{moment.why}</p>}
                  {moment.evidence.length > 0 ? (
                    <SourceLinks evidence={moment.evidence} />
                  ) : (
                    <p className="text-xs text-muted-foreground">The brief gives no source for this.</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
