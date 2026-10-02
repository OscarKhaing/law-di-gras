"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { StatusPill } from "@/components/status";
import { fullNames, mentions, nameKeys, parseSource, shortDate, type CaseFile, type Entry } from "@/features/cases/schema";
import { addDays, daysBetween, span } from "@/features/cases/words";
import type { PageNote } from "@/features/documents/schema";
import { cn } from "@/lib/utils";
import { useFold } from "./fold";
import type { CheckedBrief, SectionProps } from "./schema";
import { useSource } from "./source-panel";

// ---- What counts ----

/** A stretch with no dated record is pointed out once it is longer than this many days. */
const STRETCH_DAYS = 30;
/** A provider whose last record is at least this many days old is said to have none since. */
const STALE_DAYS = 90;
/** Pages that are in a provider's file but are not a record of care on a day. */
const NOT_CARE = /\b(bill(s|ed|ing)?|ledgers?|invoices?|statements?|covers?|fax(es|ed)?|blank)\b/i;

const LANE_HEIGHT = 22;
const HEAD_HEIGHT = 20;
const AXIS_HEIGHT = 40;
/** How many calendar entries are drawn beside a lane; the ledger names the next one. */
const CALENDAR_MARKS = 3;

const COLUMNS = "grid grid-cols-[11rem_minmax(0,1fr)] gap-x-3";
const linkClass =
  "cursor-pointer rounded-sm text-left underline decoration-input underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

const time = (day: string) => Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
const isDay = (day: string) => /^\d{4}-\d{2}-\d{2}/.test(day) && !Number.isNaN(time(day));
const monthName = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** One date of service with a provider, and the first page of the records that carries it. */
type Visit = { day: string; ref: string; page: number; kind: string; pages: number };

type Lane = {
  key: string;
  name: string;
  /** The contact on the case this provider is; null when the records name someone who is not one. */
  contact: Entry | null;
  treating: boolean;
  /** One per date of service, oldest first. */
  visits: Visit[];
  first: Visit;
  last: Visit;
  /** Calendar entries that name the provider and are dated after its last record, soonest first. */
  later: Entry[];
  /** Those of them that are still to come. */
  ahead: Entry[];
  /** Days from the last record to today. */
  since: number;
};

type Stretch = { from: string; to: string; days: number };

/** A name as written on a page, in the shape the name helpers of the case file take. */
const named = (text: string): Entry => ({
  ref: "",
  kind: "contact",
  clioId: "",
  etag: "",
  date: "",
  title: text,
  text: "",
  people: [],
  facts: {},
  createdAt: "",
  updatedAt: "",
});

/** A written name without titles, when it is at least two words: one word alone is too loose to look for. */
const writtenKeys = (text: string) => fullNames(named(text)).filter((key) => key.includes(" "));

/**
 * Every dated page of care in the documents that were read, as one lane of visits per provider,
 * with the stretches no provider has a dated record for.
 *
 * Whose page it is: the provider written on the page is matched to a contact on the case, first by
 * the contact's name ("Riverside Orthopaedic Associates, Dr. A. Rivera" is the contact "Riverside
 * Orthopaedic Associates, PLLC"), then by a contact whose role names that clinician ("Treating
 * provider, orthopaedics (A. Rivera, M.D.)"). A page with no letterhead continues the page before it.
 *
 * Which pages count: a page is a record of care when it is not a bill, cover, fax or blank, and
 * either (a) its provider is a contact the brief marks as treating, or (b) its provider is nobody
 * on the case but the page sits with records of care: in a document, or in a folder of Clio, that
 * holds pages of kind (a). A page from a contact who is not treating (an insurer, the other side's
 * counsel) never counts, and neither does a pleading or an expert's report filed elsewhere. Nothing
 * is decided from the name of a file or a folder.
 */
function readTreatment(
  file: CaseFile,
  people: CheckedBrief["people"],
  pages: Record<string, PageNote[]>,
  incident: string,
  today: string,
) {
  const contacts = file.entries.filter((entry) => entry.kind === "contact" && entry.facts.isClient !== true);
  const treating = new Set(people.filter((person) => person.treating).map((person) => parseSource(person.contact).ref));
  const documents = file.entries.filter((entry) => entry.kind === "document" && (pages[entry.ref]?.length ?? 0) > 0);

  const known = new Map<string, Entry | null>();
  const contactFor = (provider: string) => {
    if (!known.has(provider)) {
      const written = writtenKeys(provider);
      known.set(
        provider,
        contacts.find((contact) => mentions(provider, fullNames(contact))) ??
          contacts.find((contact) => mentions(provider, nameKeys(contact))) ??
          (written.length > 0 ? contacts.find((contact) => mentions(contact.text, written)) : undefined) ??
          null,
      );
    }
    return known.get(provider) ?? null;
  };

  const dated: { document: Entry; note: PageNote; provider: string; contact: Entry | null }[] = [];
  for (const document of documents) {
    let provider = "";
    for (const note of [...pages[document.ref]].sort((a, b) => a.page - b.page)) {
      if (note.provider.trim()) provider = note.provider.trim();
      if (!provider || !isDay(note.date) || NOT_CARE.test(note.kind)) continue;
      dated.push({ document, note, provider, contact: contactFor(provider) });
    }
  }

  const folderOf = (document: Entry) => String(document.facts.folder ?? "").trim();
  const byTreating = dated.filter((page) => page.contact !== null && treating.has(page.contact.ref));
  const careDocuments = new Set(byTreating.map((page) => page.document.ref));
  const careFolders = new Set(byTreating.map((page) => folderOf(page.document)).filter(Boolean));
  const counted = dated.filter((page) =>
    page.contact
      ? treating.has(page.contact.ref)
      : careDocuments.has(page.document.ref) || careFolders.has(folderOf(page.document)),
  );

  const startsAtIncident = isDay(incident);
  const start = startsAtIncident
    ? incident.slice(0, 10)
    : (counted.map((page) => page.note.date.slice(0, 10)).sort()[0] ?? today);

  // The dates of service of each provider, inside the time the strip covers.
  const found = new Map<string, { name: string; contact: Entry | null; days: Map<string, Visit> }>();
  let outside = 0;
  for (const { document, note, provider, contact } of counted) {
    const day = note.date.slice(0, 10);
    if (day < start || day > today) {
      outside++;
      continue;
    }
    const key = contact?.ref ?? fullNames(named(provider)).at(-1) ?? provider;
    const lane = found.get(key) ?? { name: contact?.title ?? provider, contact, days: new Map<string, Visit>() };
    const visit = lane.days.get(day);
    if (visit) visit.pages++;
    else lane.days.set(day, { day, ref: document.ref, page: note.page, kind: note.kind.trim(), pages: 1 });
    found.set(key, lane);
  }

  const calendar = file.entries
    .filter((entry) => entry.kind === "event" && isDay(entry.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  const lanes: Lane[] = [...found].map(([key, { name, contact, days }]) => {
    const visits = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
    const last = visits.at(-1)!;
    const keys = contact ? nameKeys(contact) : writtenKeys(name);
    const later = keys.length > 0 ? calendar.filter((entry) => entry.date.slice(0, 10) > last.day && mentions(entry.title, keys)) : [];
    return {
      key,
      name,
      contact,
      treating: contact !== null,
      visits,
      first: visits[0],
      last,
      later,
      ahead: later.filter((entry) => entry.date.slice(0, 10) > today),
      since: daysBetween(last.day, today),
    };
  });
  // Treating contacts first, then the providers the calendar runs ahead of, then in order of first visit.
  const rank = (lane: Lane) => (lane.treating ? 0 : 2) + (lane.later.length > 0 ? 0 : 1);
  lanes.sort((a, b) => rank(a) - rank(b) || a.first.day.localeCompare(b.first.day) || a.name.localeCompare(b.name));

  // Across all providers together: the stretches, from the start to today, with no dated record.
  const days = [...new Set(lanes.flatMap((lane) => lane.visits.map((visit) => visit.day)))].sort();
  const points = [...new Set([...(startsAtIncident ? [start] : []), ...days, today])].sort();
  const stretches: Stretch[] = [];
  for (let index = 1; index < points.length; index++) {
    const length = daysBetween(points[index - 1], points[index]);
    if (days.length > 0 && length > STRETCH_DAYS) stretches.push({ from: points[index - 1], to: points[index], days: length });
  }

  return {
    lanes,
    stretches,
    start,
    startsAtIncident,
    outside,
    visits: lanes.reduce((sum, lane) => sum + lane.visits.length, 0),
    longest: stretches.reduce<Stretch | null>((longest, stretch) => (longest && longest.days >= stretch.days ? longest : stretch), null),
  };
}

type Treatment = ReturnType<typeof readTreatment>;

const until = (day: string, today: string) => (day === today ? "today" : shortDate(day, true));
const stretchWords = (stretch: Stretch, today: string) =>
  `No dated records held from ${shortDate(stretch.from, true)} to ${until(stretch.to, today)} (${plural(stretch.days, "day")})`;

// ---- The part ----

/**
 * Treatment as the records show it: one lane per provider with a mark for every date of service,
 * the stretches no record is dated in drawn across all of them, and under the strip how far each
 * provider's records run, which is what tells a records clerk what to request.
 */
export function Treatment({ file, stored, pages, today }: SectionProps) {
  const incident = stored.brief.incident.date;
  const people = stored.brief.people;
  const treatment = useMemo(() => readTreatment(file, people, pages, incident, today), [file, people, pages, incident, today]);
  const documentsRead = Object.values(pages).filter((notes) => notes.length > 0).length;
  const { lanes, visits, longest } = treatment;

  return (
    <section aria-labelledby="treatment" className="space-y-3">
      <div className="space-y-1">
        <h2 id="treatment" className="font-heading text-xl font-semibold tracking-tight">
          Treatment on record
        </h2>
        {lanes.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {plural(lanes.length, "provider")}, {plural(visits, "dated visit")} in the records the firm holds.{" "}
            {longest
              ? `The longest stretch with no dated records is ${span(longest.days)}.`
              : `No stretch of more than ${STRETCH_DAYS} days is without a dated record.`}
          </p>
        )}
      </div>

      {documentsRead === 0 ? (
        <p className="border-y py-3 text-sm text-muted-foreground">
          None of the documents on this case has been read page by page yet. Reading the case fills this in with every
          date of service in the records and how far each provider&rsquo;s records run.
        </p>
      ) : lanes.length === 0 ? (
        <p className="border-y py-3 text-sm text-muted-foreground">
          {plural(documentsRead, "document")} {documentsRead === 1 ? "was" : "were"} read, and no page of{" "}
          {documentsRead === 1 ? "it" : "them"} is a dated record of care from a treating provider. Once medical records
          are on the case in Clio, read the case again to see them here.
        </p>
      ) : (
        <>
          <Strip treatment={treatment} today={today} />
          <Ledger lanes={lanes} />
        </>
      )}
    </section>
  );
}

// ---- The strip ----

type Placed = Visit & { left: number };
type Pointed = { lane: number; visit: Placed };
type AxisMark = { left: number; label: string; major: boolean };

/** Month starts between two days; on a long strip only the years are named. */
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
  return marks;
}

function Strip({ treatment, today }: { treatment: Treatment; today: string }) {
  const { lanes, stretches, start, startsAtIncident, outside } = treatment;
  const { open, openRef } = useSource();
  const [pointed, setPointed] = useState<Pointed | null>(null);
  const [opened, setOpened] = useState<{ lane: string; day: string } | null>(null);
  const { shown: listed, control } = useFold(stretches, 3);

  const drawn = useMemo(() => {
    const end = today > start ? today : addDays(start, 1);
    const width = time(end) - time(start);
    const at = (day: string) => ((time(day) - time(start)) / width) * 100;
    return {
      at,
      rows: lanes.map((lane) => lane.visits.map((visit) => ({ ...visit, left: at(visit.day) }))),
      axis: axisMarks(start, end, at),
    };
  }, [lanes, start, today]);

  const rowsHeight = lanes.length * LANE_HEIGHT;
  const calendarShown = lanes.some((lane) => lane.ahead.length > 0);

  /** The date of service nearest the pointer on the lane it is over, if one is within reach. */
  function nearest(event: MouseEvent<HTMLDivElement>): Pointed | null {
    const box = event.currentTarget.getBoundingClientRect();
    const left = ((event.clientX - box.left) / box.width) * 100;
    const lane = Math.floor((event.clientY - box.top) / LANE_HEIGHT);
    const reach = (7 / box.width) * 100;
    let found: Placed | null = null;
    for (const visit of drawn.rows[lane] ?? []) {
      const distance = Math.abs(visit.left - left);
      if (distance <= reach && (!found || distance < Math.abs(found.left - left))) found = visit;
    }
    return found ? { lane, visit: found } : null;
  }

  const described =
    `Dates of service from ${shortDate(start, true)} to today. ` +
    lanes
      .map((lane) => {
        const when = lane.first.day === lane.last.day ? `on ${shortDate(lane.first.day, true)}` : `${shortDate(lane.first.day, true)} to ${shortDate(lane.last.day, true)}`;
        return `${lane.name}: ${plural(lane.visits.length, "dated visit")}, ${when}`;
      })
      .join(". ") +
    ". " +
    stretches.map((stretch) => `${stretchWords(stretch, today)}.`).join(" ");

  return (
    <div className="space-y-2">
      <div className={COLUMNS}>
        <div aria-hidden style={{ paddingTop: HEAD_HEIGHT }}>
          {lanes.map((lane) => (
            <div key={lane.key} className="flex items-center justify-between gap-2" style={{ height: LANE_HEIGHT }}>
              <span className="truncate font-serif text-[13px]" title={lane.name}>
                {lane.name}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">{lane.visits.length}</span>
            </div>
          ))}
        </div>

        <div className="flex">
          <div className="relative min-w-0 flex-1" style={{ height: HEAD_HEIGHT + rowsHeight + AXIS_HEIGHT }}>
            {/* How long each stretch with no dated record is, above its band. */}
            <div aria-hidden className="absolute inset-x-0 top-0 text-xs font-medium text-mild-ink" style={{ height: HEAD_HEIGHT }}>
              {stretches.map((stretch) => {
                const left = drawn.at(stretch.from);
                const width = drawn.at(stretch.to) - left;
                if (width < 9) return null;
                return (
                  <span key={stretch.from} className="absolute truncate pl-1.5 leading-5" style={{ left: `${left}%`, width: `${width}%` }}>
                    {plural(stretch.days, "day")}
                    {width >= 40 && " with no dated records"}
                  </span>
                );
              })}
            </div>

            <div
              role="img"
              aria-label={described}
              className={cn("absolute inset-x-0 border-r border-b border-l border-r-foreground/55 border-b-border border-l-input", pointed && "cursor-pointer")}
              style={{ top: HEAD_HEIGHT, height: rowsHeight }}
              onPointerMove={(event) => {
                const found = nearest(event);
                if (found?.visit.day !== pointed?.visit.day || found?.lane !== pointed?.lane) setPointed(found);
              }}
              onPointerLeave={() => setPointed(null)}
              onClick={(event) => {
                const found = nearest(event);
                if (!found) return;
                setOpened({ lane: lanes[found.lane].key, day: found.visit.day });
                open({ source: `${found.visit.ref} p.${found.visit.page}`, quote: "" });
              }}
            >
              {stretches.map((stretch) => (
                <span
                  key={stretch.from}
                  className="absolute inset-y-0 border-x border-mild-ink/25 bg-mild-soft"
                  style={{ left: `${drawn.at(stretch.from)}%`, right: `${Math.max(0, 100 - drawn.at(stretch.to))}%` }}
                />
              ))}
              {drawn.axis
                .filter((mark) => mark.major)
                .map((mark) => (
                  <span key={mark.left} className="absolute inset-y-0 w-px bg-border" style={{ left: `${mark.left}%` }} />
                ))}
              <div className="relative">
                {drawn.rows.map((visits, row) => (
                  <div key={lanes[row].key} className={cn("relative", row > 0 && "border-t border-border")} style={{ height: LANE_HEIGHT }}>
                    {visits.map((visit) => (
                      <span key={visit.day} className="absolute top-1 bottom-1 w-0.5 -translate-x-1/2 bg-foreground/60" style={{ left: `${visit.left}%` }} />
                    ))}
                  </div>
                ))}
              </div>
              {drawn.rows.map((visits, row) =>
                visits
                  .filter((visit) => opened?.lane === lanes[row].key && opened.day === visit.day)
                  .map((visit) => (
                    <span
                      key={`${row}-${visit.day}`}
                      className="absolute w-[3px] -translate-x-1/2 bg-primary"
                      style={{ left: `${visit.left}%`, top: row * LANE_HEIGHT + 2, height: LANE_HEIGHT - 4 }}
                    />
                  )),
              )}
              {pointed && (
                <span
                  className="absolute w-[3px] -translate-x-1/2 bg-foreground"
                  style={{ left: `${pointed.visit.left}%`, top: pointed.lane * LANE_HEIGHT + 2, height: LANE_HEIGHT - 4 }}
                />
              )}
            </div>

            {/* Years and months, then where the strip starts and where today is. */}
            <div aria-hidden className="absolute inset-x-0 text-xs text-muted-foreground" style={{ top: HEAD_HEIGHT + rowsHeight, height: AXIS_HEIGHT }}>
              {drawn.axis.map((mark, index) => (
                <span key={index} className="absolute top-0 flex" style={{ left: `${mark.left}%` }}>
                  <span className={cn("w-px bg-input", mark.label ? "h-2" : "h-1")} />
                  {mark.label && mark.left < 92 && <span className="pt-0.5 pl-1 leading-4 tabular-nums">{mark.label}</span>}
                </span>
              ))}
              <span className="absolute bottom-0 left-0 leading-4">
                {startsAtIncident ? `Incident, ${shortDate(start, true)}` : `From ${shortDate(start, true)}`}
              </span>
              <span className="absolute right-0 bottom-0 leading-4 text-foreground">Today</span>
            </div>
          </div>

          {/* Past today: what the calendar holds with each provider. Not to scale. */}
          {calendarShown && (
            <div className="w-16 shrink-0" style={{ paddingTop: HEAD_HEIGHT }}>
              {lanes.map((lane, row) => (
                <div
                  key={lane.key}
                  className={cn("flex items-center gap-1 border-border bg-muted pl-2", row > 0 && "border-t", row === lanes.length - 1 && "border-b")}
                  style={{ height: LANE_HEIGHT + (row === lanes.length - 1 ? 1 : 0) }}
                >
                  {lane.ahead.slice(0, CALENDAR_MARKS).map((entry) => (
                    <button
                      key={entry.ref}
                      type="button"
                      title={`${shortDate(entry.date, true)}: ${entry.title}`}
                      aria-label={`On the calendar ${shortDate(entry.date, true)}: ${entry.title}`}
                      onClick={() => openRef(entry.ref)}
                      className="size-2.5 cursor-pointer rounded-full border-[1.5px] border-foreground/70 bg-card outline-none hover:border-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                  ))}
                </div>
              ))}
              <p aria-hidden className="pt-0.5 pl-2 text-xs leading-4 text-muted-foreground">
                Calendar
              </p>
            </div>
          )}
        </div>
      </div>

      <div className={COLUMNS}>
        <span />
        <div className="space-y-1.5">
          <p className="flex h-5 items-baseline gap-x-2 overflow-hidden text-xs text-muted-foreground">
            {pointed ? (
              <>
                <span className="shrink-0 tabular-nums">{shortDate(pointed.visit.day, true)}</span>
                <span className="truncate font-serif text-[13px] text-foreground">{lanes[pointed.lane].name}</span>
                <span className="shrink-0">
                  {pointed.visit.kind ? `${pointed.visit.kind}, ` : ""}page {pointed.visit.page}
                  {pointed.visit.pages > 1 && ` and ${plural(pointed.visit.pages - 1, "more page")} that day`}
                </span>
              </>
            ) : (
              "Each mark is a date of service. Select one to open that page of the records."
            )}
          </p>
          {calendarShown && (
            <p className="flex items-baseline gap-2 text-xs text-muted-foreground">
              <span aria-hidden className="size-2.5 shrink-0 translate-y-px rounded-full border-[1.5px] border-foreground/70" />
              <span>An open circle is an entry on the calendar after today that names the provider. It is not a record yet.</span>
            </p>
          )}

          {stretches.length > 0 && (
            <div className="space-y-1">
              <ul className="space-y-0.5 text-sm">
                {listed.map((stretch) => (
                  <li key={stretch.from} className="flex items-baseline gap-2">
                    <span aria-hidden className="h-3 w-4 shrink-0 translate-y-0.5 border border-mild-ink/25 bg-mild-soft" />
                    <span>{stretchWords(stretch, today)}</span>
                  </li>
                ))}
              </ul>
              {control}
              <p className="max-w-prose text-xs text-muted-foreground">
                A shaded stretch is time the firm holds no dated record for, from any provider. It may be time without
                treatment, or records that have not been requested or received.
              </p>
            </div>
          )}
          {outside > 0 && (
            <p className="text-xs text-muted-foreground">
              {plural(outside, "dated page")} of the records {outside === 1 ? "falls" : "fall"} before {shortDate(start, true)} or
              after today and {outside === 1 ? "is" : "are"} not drawn.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- How far each provider's records run ----

function Ledger({ lanes }: { lanes: Lane[] }) {
  const { open, openRef } = useSource();
  const { shown, control } = useFold(lanes);
  const openPage = (visit: Visit) => open({ source: `${visit.ref} p.${visit.page}`, quote: "" });
  const heading = "py-1.5 pr-4 font-normal whitespace-nowrap";

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y text-left text-xs text-muted-foreground">
              <th scope="col" className={heading}>
                Provider
              </th>
              <th scope="col" className={cn(heading, "text-right")}>
                Dated visits
              </th>
              <th scope="col" className={heading}>
                First record
              </th>
              <th scope="col" className="py-1.5 font-normal whitespace-nowrap">
                Records held through
              </th>
            </tr>
          </thead>
          <tbody className="divide-y border-b">
            {shown.map((lane) => {
              // The next thing on the calendar with this provider, or failing that the latest one gone by.
              const onCalendar = lane.ahead[0] ?? lane.later.at(-1);
              // Records are owed when the calendar shows a date with the provider that has already
              // gone by, or one still to come long after the last record. A record from last week
              // and an appointment next week is care in step with its records.
              const behind = lane.since >= STALE_DAYS || lane.later.length > lane.ahead.length;
              return (
                <tr key={lane.key} className="align-top">
                  <th scope="row" className="py-1.5 pr-4 text-left font-normal">
                    {lane.contact ? (
                      <button
                        type="button"
                        onClick={() => openRef(lane.contact!.ref)}
                        className="cursor-pointer rounded-sm text-left font-serif text-[15px] leading-snug font-medium text-pretty decoration-input underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        {lane.name}
                      </button>
                    ) : (
                      <>
                        <span className="font-serif text-[15px] leading-snug font-medium text-pretty">{lane.name}</span>
                        <span className="block text-xs text-muted-foreground">Named in the records, not a contact on the case</span>
                      </>
                    )}
                    {onCalendar ? (
                      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        {behind && <StatusPill tone="mild">No records for the last {span(lane.since)}</StatusPill>}
                        <button
                          type="button"
                          title={onCalendar.title}
                          onClick={() => openRef(onCalendar.ref)}
                          className={cn(linkClass, "text-xs whitespace-nowrap text-muted-foreground hover:text-foreground")}
                        >
                          On the calendar {shortDate(onCalendar.date, true)}
                        </button>
                      </div>
                    ) : lane.since >= STALE_DAYS ? (
                      <p className="text-xs leading-5 text-muted-foreground">No records for the last {span(lane.since)}</p>
                    ) : null}
                  </th>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{lane.visits.length}</td>
                  <td className="py-1.5 pr-4 whitespace-nowrap">
                    <button
                      type="button"
                      aria-label={`Open the first record, ${shortDate(lane.first.day, true)}`}
                      onClick={() => openPage(lane.first)}
                      className={cn(linkClass, "tabular-nums")}
                    >
                      {shortDate(lane.first.day, true)}
                    </button>
                  </td>
                  <td className="py-1.5 whitespace-nowrap">
                    <button
                      type="button"
                      aria-label={`Open the last record, ${shortDate(lane.last.day, true)}`}
                      onClick={() => openPage(lane.last)}
                      className={cn(linkClass, "tabular-nums")}
                    >
                      {shortDate(lane.last.day, true)}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {control}
    </div>
  );
}
