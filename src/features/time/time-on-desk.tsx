"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { figuresOf } from "@/features/brief/bills";
import { Disclosure, foldClass, useFold } from "@/features/brief/fold";
import type { SectionProps } from "@/features/brief/schema";
import { SourceLinks, useSource } from "@/features/brief/source-panel";
import { byRef, parseSource, shortDate } from "@/features/cases/schema";
import { dollars } from "@/features/cases/words";
import { postJson } from "@/lib/fetch-json";
import { parseDollars, parsePercent, sumDollars } from "@/lib/settle";
import { cn } from "@/lib/utils";
import {
  RULES,
  STEP,
  WORK_WORD,
  byPhase,
  hours,
  timeOnDesk,
  totals,
  worth,
  type Basis,
  type Rules,
  type Share,
  type StageStart,
  type TimeRow,
} from "./schema";

/** Working out when each phase began: not asked for yet, being read, failed, or back. */
type PhaseState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "failed"; message: string }
  | { status: "done"; stages: StageStart[] };

/** The fee the comparison starts from: one third, written the way a retainer writes it. An assumption. */
const ASSUMED_FEE = "33 1/3";

const listed = new Intl.ListFormat("en-US", { style: "long", type: "conjunction" });

/** The figures of the rule a reader can change, as typed, so a half-typed number is not rewritten under the cursor. */
const TYPED = ["loggedCall", "emailShort", "emailMedium", "emailLong", "emailRead", "note", "noteLong", "pagesPerHour", "documentLeast", "workingDayHours"] as const;
type TypedKey = (typeof TYPED)[number];
type TypedRules = Record<TypedKey, string> & { calendarUnattended: boolean };

const START: TypedRules = {
  ...(Object.fromEntries(TYPED.map((key) => [key, String(RULES[key])])) as Record<TypedKey, string>),
  calendarUnattended: RULES.calendarUnattended,
};

/** A typed figure of the rule: anything unreadable, empty or below zero is 0. */
const figure = (text: string) => {
  const value = Number.parseFloat(text);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

// Measured time is drawn solid and estimated time hatched, everywhere on this part: in the bars, in
// the key under the total and beside every row. The two are told apart by texture, not by colour.
const SOLID = "bg-foreground/80";
const INK = "color-mix(in oklab, var(--foreground) 55%, transparent)";
const HATCH: CSSProperties = {
  // Two thin strokes to a tile, half a tile apart, so the tiles meet without a seam.
  backgroundImage: `linear-gradient(135deg, ${INK} 0 14%, transparent 14% 50%, ${INK} 50% 64%, transparent 64%)`,
  backgroundSize: "6px 6px",
};

/** The small square that says which of the two a figure is. Always beside the word. */
function Mark({ basis, className }: { basis: Basis; className?: string }) {
  return (
    <span
      aria-hidden
      style={basis === "estimated" ? HATCH : undefined}
      className={cn("inline-block size-2.5 shrink-0 rounded-[2px] ring-1 ring-foreground/50 ring-inset", basis === "measured" && SOLID, className)}
    />
  );
}

/** A length of time on a scale: the measured part solid, then the estimated part hatched. */
function Bar({ share, scale, tall = false }: { share: Share; scale: number; tall?: boolean }) {
  const width = (minutes: number) => `${scale > 0 ? Math.min(100, (minutes / scale) * 100) : 0}%`;
  return (
    <span aria-hidden className={cn("flex w-full overflow-hidden rounded-[2px] bg-muted", tall ? "h-4" : "h-2.5")}>
      {share.measured > 0 && <span className={cn("h-full", SOLID)} style={{ width: width(share.measured) }} />}
      {share.estimated > 0 && <span className="h-full" style={{ ...HATCH, width: width(share.estimated) }} />}
    </span>
  );
}

const HEADING = "font-heading text-lg font-semibold tracking-tight";
// A name or a kind of work, its length on the scale of the whole case, and its hours.
// A phase needs more room for its name, the day it began and the entry that shows it.
const PHASE_ROW = "grid grid-cols-[minmax(0,13rem)_minmax(0,1fr)_5.5rem] items-center gap-x-4 sm:grid-cols-[17rem_minmax(0,1fr)_6rem] sm:gap-x-5";
const SHARE_ROW = "grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_5.5rem] items-center gap-x-4 sm:grid-cols-[13rem_minmax(0,1fr)_6rem] sm:gap-x-5";
// A person, their hours, the rate typed for them, and what that comes to.
const WORTH_ROW = "grid grid-cols-[minmax(0,1fr)_4rem_10.5rem_6.5rem] items-center gap-x-4 sm:gap-x-5";
// One piece of work: its day, what it was, whose time, the minutes, and which of the two they are.
const WORK_ROW =
  "grid grid-cols-[5.5rem_minmax(0,1fr)_3rem_5.5rem] items-baseline gap-x-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_7rem_3rem_5.5rem] sm:gap-x-4";
const quiet =
  "cursor-pointer rounded-sm text-xs text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * Time on desk: what the case has cost the firm in time, and where it went. Clio holds no time
 * entries on a contingency matter, so the hours are rebuilt from the record by a rule the reader can
 * see and change; a real duration is used wherever one exists, and the two are never mixed up.
 * Nothing here is saved or sent.
 */
export function TimeOnDesk({ file, stored, pages, calls, today }: SectionProps) {
  const id = useId();
  const { openRef } = useSource();
  const [typed, setTyped] = useState<TypedRules>(START);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [leftOut, setLeftOut] = useState<string[]>([]);
  const [phase, setPhase] = useState<PhaseState>({ status: "idle" });

  // The last offer the brief holds: the one whose sources are dated latest. Null when it holds none.
  const lastOffer = useMemo(() => {
    const entries = byRef(file);
    const dateOf = (figure: { evidence: { source: string }[] }) =>
      figure.evidence.map((item) => entries.get(parseSource(item.source).ref)?.date ?? "").sort().at(-1) ?? "";
    return [...figuresOf(stored.brief, "offer")].sort((a, b) => dateOf(b).localeCompare(dateOf(a)))[0] ?? null;
  }, [file, stored]);
  const [fee, setFee] = useState(ASSUMED_FEE);
  const [offer, setOffer] = useState(lastOffer ? lastOffer.amount.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "");

  // If the phases were worked out on an earlier visit, show them at once; this asks only for the kept answer.
  useEffect(() => {
    let live = true;
    postJson<{ stages: StageStart[] | null }>("/api/time/stages", { matterId: file.matterId, kept: true })
      .then(({ stages }) => {
        if (live && stages) setPhase((now) => (now.status === "idle" ? { status: "done", stages } : now));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [file.matterId]);

  const workOutPhases = async () => {
    setPhase({ status: "working" });
    try {
      const { stages } = await postJson<{ stages: StageStart[] }>("/api/time/stages", { matterId: file.matterId });
      setPhase({ status: "done", stages });
    } catch (err) {
      setPhase({ status: "failed", message: err instanceof Error ? err.message : "The request did not finish." });
    }
  };

  const rules: Rules = useMemo(
    () => ({
      ...RULES,
      ...(Object.fromEntries(TYPED.map((key) => [key, figure(typed[key])])) as Record<TypedKey, number>),
      calendarUnattended: typed.calendarUnattended,
    }),
    [typed],
  );
  const changed = JSON.stringify(typed) !== JSON.stringify(START);
  const set = (key: TypedKey, text: string) => setTyped((current) => ({ ...current, [key]: text.replace(/[^0-9.]/g, "") }));

  const rows = useMemo(() => timeOnDesk(file, pages, calls, rules, today), [file, pages, calls, rules, today]);
  // Past calendar entries the rule leaves out because they name no one from the firm.
  const unattended = useMemo(
    () => (rules.calendarUnattended ? 0 : timeOnDesk(file, pages, calls, { ...rules, calendarUnattended: true }, today).length - rows.length),
    [file, pages, calls, rules, today, rows],
  );
  const counted = rows.filter((row) => !leftOut.includes(row.id));
  const outNow = rows.length - counted.length;
  const sum = totals(counted);
  const { shown, control } = useFold(rows, 10);

  const dated = counted.map((row) => row.date).filter(Boolean).sort();
  const deskCalls = counted.filter((row) => row.kind === "desk-call").length;
  const inWords = `Of ${hours(sum.minutes)} hours, ${hours(sum.measured)} measured and ${hours(sum.estimated)} estimated.`;

  const rated = sum.byPerson.map((person) => ({ ...person, rate: parseDollars(rates[person.person] ?? "") }));
  const anyRate = rated.some((person) => person.rate > 0);
  const unrated = rated.filter((person) => person.rate <= 0);
  const value = sumDollars(rated.map((person) => worth(person.minutes, person.rate)));
  const ratedMinutes = rated.filter((person) => person.rate > 0).reduce((minutes, person) => minutes + person.minutes, 0);

  const phases = phase.status === "done" ? byPhase(counted, phase.stages) : [];
  const firstPhase = phases.find((item) => item.stage !== "")?.stage ?? "";
  const notShown = phase.status === "done" ? phase.stages.filter((stage) => stage.date === "").map((stage) => stage.stage) : [];

  const offerAmount = parseDollars(offer);
  const feePercent = parsePercent(fee);
  const feeShare = Math.round(offerAmount * feePercent) / 100;

  const number = (key: TypedKey, label: string) => (
    <Input
      inputMode="decimal"
      autoComplete="off"
      aria-label={label}
      value={typed[key]}
      onChange={(event) => set(key, event.target.value)}
      className="mx-1 inline-block h-7 w-12 px-1.5 text-center text-sm tabular-nums md:text-sm"
    />
  );

  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id={`${id}-heading`} className="font-heading text-xl font-semibold tracking-tight">
          Time on desk
        </h2>
        <p className="text-sm text-muted-foreground">
          These hours are reconstructed from the record by the rule below, except where a real duration exists.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="border-y py-3 text-sm text-muted-foreground">
          Nothing in this file carries time yet: it holds no note, email, call, document or past calendar entry the rule
          counts. Hours appear here as the record grows, and a call placed through Case Desk is timed as it happens.
        </p>
      ) : (
        <>
          {/* The one thing the reader came for: the total, and how much of it is real. */}
          <div className="space-y-2.5">
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-5xl leading-none font-semibold tracking-tight tabular-nums">{hours(sum.minutes)}</span>
              <span className="text-xl font-medium">hours</span>
              <span className="text-sm text-muted-foreground">
                on {plural(counted.length, "piece", "pieces")} of work
                {dated.length > 0 && `, ${shortDate(dated[0], true)} to ${shortDate(dated[dated.length - 1], true)}`}
              </span>
            </p>
            <div role="img" aria-label={inWords}>
              <Bar share={sum} scale={sum.minutes} tall />
            </div>
            <dl className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
              <div>
                <dt className="flex items-center gap-2 font-medium">
                  <Mark basis="measured" />
                  Measured
                  <span className="tabular-nums">{hours(sum.measured)} h</span>
                </dt>
                <dd className="pl-[1.125rem] text-muted-foreground">
                  {sum.measured > 0
                    ? "A real duration: a call placed through Case Desk, or a calendar entry's start and end."
                    : "Nothing counted on this case has a real duration yet. A call placed through Case Desk is timed as it happens."}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 font-medium">
                  <Mark basis="estimated" />
                  Estimated
                  <span className="tabular-nums">{hours(sum.estimated)} h</span>
                </dt>
                <dd className="pl-[1.125rem] text-muted-foreground">
                  Minutes given by the rule to each note, email, logged call and document.
                </dd>
              </div>
            </dl>
            <p className="text-sm">An estimate rebuilt from the record, not a record kept at the time.</p>
          </div>

          <div className="space-y-1.5">
            <h3 className={HEADING}>By person</h3>
            <ul className="divide-y border-y">
              {sum.byPerson.map((person) => (
                <li key={person.person} className={cn(SHARE_ROW, "py-2")}>
                  <span className="font-serif text-[15px] leading-snug">{person.person}</span>
                  <Bar share={person} scale={sum.minutes} />
                  <Hours share={person} />
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-1.5">
            <h3 className={HEADING}>By kind of work</h3>
            <ul className="divide-y border-y">
              {sum.byKind.map((kind) => (
                <li key={kind.kind} className={cn(SHARE_ROW, "py-2")}>
                  <span className="text-sm leading-snug">
                    {WORK_WORD[kind.kind]} <span className="text-xs text-muted-foreground tabular-nums">{kind.count}</span>
                  </span>
                  <Bar share={kind} scale={sum.minutes} />
                  <Hours share={kind} />
                </li>
              ))}
            </ul>
            {deskCalls > 0 && (
              <p className="text-sm text-muted-foreground">
                {plural(deskCalls, "call")} placed through Case Desk {deskCalls === 1 ? "is" : "are"} measured: the phone
                carrier reports how long each lasted.
              </p>
            )}
            {unattended > 0 && (
              <p className="text-sm text-muted-foreground">
                {plural(unattended, "past calendar entry", "past calendar entries")} {unattended === 1 ? "names" : "name"} no
                one from the firm, so {unattended === 1 ? "it is" : "they are"} not counted: a case calendar also holds the
                client&rsquo;s own appointments.{" "}
                <button type="button" className={foldClass} onClick={() => setTyped((current) => ({ ...current, calendarUnattended: true }))}>
                  Count {unattended === 1 ? "it" : "them"}
                </button>
              </p>
            )}
            {rules.calendarUnattended && (
              <p className="text-sm text-muted-foreground">
                Calendar entries that name no one from the firm are counted. Leave out any that were the client&rsquo;s own
                appointments in the list of work below.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h3 className={HEADING}>By phase</h3>
              <p className="text-sm text-muted-foreground">
                Clio keeps the stage a case is at, not the day each one began. Those days are read from the record.
              </p>
            </div>
            {phase.status === "idle" && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-y py-2.5 text-sm text-muted-foreground">
                <Button variant="outline" size="sm" className="bg-card" onClick={workOutPhases}>
                  Work out the time by phase
                </Button>
                Takes about 20 seconds the first time.
              </p>
            )}
            {phase.status === "working" && (
              <p role="status" className="flex items-center gap-2 border-y py-2.5 text-sm">
                <LoaderCircleIcon aria-hidden className="size-4 animate-spin text-muted-foreground" />
                Reading the record for the day each phase began. About 20 seconds.
              </p>
            )}
            {phase.status === "failed" && (
              <div role="alert" className="border-l-2 border-destructive px-3 py-1 text-sm">
                <p className="font-medium text-destructive">The phases could not be worked out</p>
                <p className="mt-1 text-muted-foreground">{phase.message}</p>
                <Button variant="outline" size="sm" className="mt-2 bg-card" onClick={workOutPhases}>
                  Try again
                </Button>
              </div>
            )}
            {phase.status === "done" &&
              (firstPhase === "" ? (
                <p className="border-y py-2.5 text-sm text-muted-foreground">
                  The record does not show the day any phase began, so the time cannot be divided by phase.
                </p>
              ) : (
                <>
                  <ul className="divide-y border-y">
                    {phases.map((item) => (
                      <li key={item.stage || "before"} className={cn(PHASE_ROW, "py-2")}>
                        <span className="min-w-0 text-sm leading-snug">
                          {item.stage === "" ? (
                            <>
                              Before {firstPhase}
                              <span className="block text-xs text-muted-foreground">Work dated earlier, or with no date</span>
                            </>
                          ) : (
                            <>
                              {item.stage}
                              <span className="block text-xs text-muted-foreground">
                                From {shortDate(item.date, true)}, shown by <SourceLinks evidence={[{ source: item.ref, quote: "" }]} />
                              </span>
                            </>
                          )}
                        </span>
                        <Bar share={item} scale={sum.minutes} />
                        <Hours share={item} />
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm text-muted-foreground">
                    Each piece of work is counted in the phase its date falls in.
                    {notShown.length > 0 && ` The record does not show ${listed.format(notShown)} beginning.`}
                  </p>
                </>
              ))}
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h3 className={HEADING}>What the time is worth</h3>
              <p className="text-sm text-muted-foreground">
                Nothing in the file gives an hourly rate. Type one for each person.
              </p>
            </div>
            <ul className="divide-y border-y">
              {rated.map((person, index) => (
                <li key={person.person} className={cn(WORTH_ROW, "py-1.5")}>
                  <span className="font-serif text-[15px] leading-snug">{person.person}</span>
                  <span className="text-right text-sm tabular-nums">{hours(person.minutes)} h</span>
                  <label className="flex items-center gap-1 text-sm whitespace-nowrap text-muted-foreground">
                    <span aria-hidden>$</span>
                    <Input
                      id={`${id}-rate-${index}`}
                      inputMode="decimal"
                      autoComplete="off"
                      aria-label={`Hourly rate for ${person.person}, in dollars`}
                      value={rates[person.person] ?? ""}
                      onChange={(event) => setRates((current) => ({ ...current, [person.person]: event.target.value.replace(/[^0-9.,]/g, "") }))}
                      className="h-7 w-20 px-1.5 text-right text-sm text-foreground tabular-nums md:text-sm"
                    />
                    <span>an hour</span>
                  </label>
                  <output htmlFor={`${id}-rate-${index}`} className={cn("text-right text-sm tabular-nums", person.rate <= 0 && "text-muted-foreground")}>
                    {person.rate > 0 ? dollars(worth(person.minutes, person.rate)) : "No rate yet"}
                  </output>
                </li>
              ))}
            </ul>
            {anyRate && (
              <div className={cn(WORTH_ROW, "pt-1")}>
                <span className="text-sm font-medium">
                  The firm&rsquo;s time at {unrated.length === 0 && rated.length === 1 ? "this rate" : "these rates"}
                </span>
                <span className="text-right text-sm tabular-nums">{hours(ratedMinutes)} h</span>
                <span />
                <span className="text-right text-[15px] font-semibold tabular-nums">{dollars(value)}</span>
              </div>
            )}
            {anyRate && (
              <p className="text-sm text-muted-foreground">
                {unrated.length > 0 && `${plural(unrated.length, "person has", "people have")} no rate yet and ${unrated.length === 1 ? "is" : "are"} not in this figure. `}
                Hours times rate, on hours that are {sum.measured > 0 ? `${hours(sum.estimated)} estimated and ${hours(sum.measured)} measured` : "all estimated"}.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <h3 className={HEADING}>If the firm is replaced</h3>
            {!anyRate ? (
              <p className="border-y py-2.5 text-sm text-muted-foreground">
                Type an hourly rate above to set the value of the firm&rsquo;s time beside a share of the last offer.
              </p>
            ) : (
              <>
                <div className="grid gap-x-8 gap-y-4 border-y py-3 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium">The value of the firm&rsquo;s time</p>
                    <p className="mt-1 text-[1.75rem] leading-9 font-semibold tracking-tight tabular-nums">{dollars(value)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {hours(ratedMinutes)} hours at the {rated.length - unrated.length === 1 ? "rate" : "rates"} above,{" "}
                      {sum.measured > 0 ? `${hours(sum.measured)} of them measured and the rest estimated` : "all of them estimated"}.
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">A contingent share of the last offer</p>
                    <output
                      htmlFor={`${id}-fee ${id}-offer`}
                      className={cn("mt-1 block text-[1.75rem] leading-9 font-semibold tracking-tight tabular-nums", offerAmount <= 0 && "text-muted-foreground")}
                    >
                      {offerAmount > 0 ? dollars(feeShare) : "No offer yet"}
                    </output>
                    <p className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-muted-foreground">
                      <Input
                        id={`${id}-fee`}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label="Fee, as a percentage, assumed"
                        value={fee}
                        onChange={(event) => setFee(event.target.value.replace(/[^0-9./ ]/g, ""))}
                        className="h-7 w-16 px-1.5 text-right text-sm text-foreground tabular-nums md:text-sm"
                      />
                      <span>% of a last offer of $</span>
                      <Input
                        id={`${id}-offer`}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label="The last offer, in dollars"
                        placeholder="0"
                        value={offer}
                        onChange={(event) => setOffer(event.target.value.replace(/[^0-9.,]/g, ""))}
                        onBlur={() => setOffer(offerAmount > 0 ? offerAmount.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "")}
                        className="h-7 w-28 px-1.5 text-right text-sm text-foreground tabular-nums md:text-sm"
                      />
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      The fee is an assumption: set it to the retainer&rsquo;s.{" "}
                      {lastOffer ? (
                        <>
                          The last offer in the file is {dollars(lastOffer.amount)}. <SourceLinks evidence={lastOffer.evidence} />
                        </>
                      ) : (
                        "The brief holds no offer: type the last one made."
                      )}
                    </p>
                  </div>
                </div>
                <p className="max-w-prose text-sm">
                  When a client discharges a firm, or another firm takes the case over, the outgoing firm&rsquo;s claim is commonly
                  measured by the reasonable value of its time or by a share of the fee, depending on the state and the agreement.
                </p>
                <p className="text-sm text-muted-foreground">An illustration from reconstructed time, not advice.</p>
              </>
            )}
          </div>
        </>
      )}

      <Disclosure title="The rule" remark="How the hours are worked out, and the figures to change">
        <div className="space-y-3 text-sm">
          <p className="max-w-prose">
            The minutes below are assumptions, not researched figures: set them to the firm&rsquo;s own practice. Every
            figure on this part changes as you type. Nothing is saved.
          </p>
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-medium">
              <Mark basis="measured" />
              Measured
            </p>
            <ul className="divide-y border-y leading-7">
              <li className="py-1.5">A call placed through Case Desk counts for as long as it lasted, rounded up to the next minute.</li>
              <li className="py-1.5">
                A calendar entry with a start and an end counts for its length once its day has passed, up to a working day of
                {number("workingDayHours", "Hours in a working day")}hours. An all-day entry marks a date and counts for nothing.
              </li>
              <li className="py-1.5">
                <label className="flex cursor-pointer items-baseline gap-2">
                  <input
                    type="checkbox"
                    checked={typed.calendarUnattended}
                    onChange={(event) => setTyped((current) => ({ ...current, calendarUnattended: event.target.checked }))}
                    className="size-3.5 translate-y-0.5 accent-primary"
                  />
                  <span>
                    Count calendar entries that name no one from the firm. The calendar does not say whose appointment it
                    was, so this starts off.
                  </span>
                </label>
              </li>
            </ul>
          </div>
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-medium">
              <Mark basis="estimated" />
              Estimated
            </p>
            <ul className="divide-y border-y leading-7">
              <li className="py-1.5">A call logged in Clio:{number("loggedCall", "Minutes for a call logged in Clio")}minutes.</li>
              <li className="py-1.5">
                An email the firm sent: up to {RULES.emailShortWords} words{number("emailShort", "Minutes for a short email sent")}
                minutes, up to {RULES.emailMediumWords} words{number("emailMedium", "Minutes for a medium email sent")}, longer
                {number("emailLong", "Minutes for a long email sent")}.
              </li>
              <li className="py-1.5">An email the firm received:{number("emailRead", "Minutes to read an email received")}minutes to read.</li>
              <li className="py-1.5">
                A note:{number("note", "Minutes for a note")}minutes, or{number("noteLong", "Minutes for a long note")}when it runs
                over {RULES.noteLongWords} words.
              </li>
              <li className="py-1.5">
                A document: reviewed at{number("pagesPerHour", "Pages reviewed in an hour")}pages an hour, rounded up to a tenth of
                an hour, and never less than{number("documentLeast", "Least minutes for a document")}minutes. A document whose
                pages have not been read gets the least.
              </li>
              <li className="py-1.5">
                Tasks, expenses, custom fields and contacts count for nothing: a task is a reminder of work that shows up as the
                note, email or call it led to.
              </li>
            </ul>
          </div>
          <p className="max-w-prose text-muted-foreground">
            Whose time it is: the author of a note, the sender of an email the firm sent, whoever placed a call. Everything
            else goes to a member of the firm named on it, and failing that to {file.firm.user || "the Clio user"}, the Clio
            user this case was read as. The smallest estimate is {STEP} minutes, a tenth of an hour.
          </p>
          <p>
            <button type="button" disabled={!changed} onClick={() => setTyped(START)} className={cn(foldClass, "disabled:cursor-default disabled:text-muted-foreground disabled:no-underline")}>
              Reset to the defaults
            </button>
            {!changed && <span className="ml-2 text-muted-foreground">These are the defaults.</span>}
          </p>
        </div>
      </Disclosure>

      {rows.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h3 className={HEADING}>Every piece of work</h3>
            <p className="text-sm text-muted-foreground">
              Newest first. Select one to read it.
              {outNow > 0 && (
                <>
                  {" "}
                  {plural(outNow, "is", "are")} left out of the count.{" "}
                  <button type="button" className={foldClass} onClick={() => setLeftOut([])}>
                    Count {outNow === 1 ? "it" : "them"} again
                  </button>
                </>
              )}
            </p>
          </div>
          <div className={cn(WORK_ROW, "pb-1 text-xs text-muted-foreground")}>
            <span>Date</span>
            <span>What it was</span>
            <span className="hidden sm:block">Who</span>
            <span className="text-right">Minutes</span>
            <span />
          </div>
          <ul className="divide-y border-y">
            {shown.map((row) => (
              <WorkRow
                key={row.id}
                row={row}
                out={leftOut.includes(row.id)}
                onOpen={openRef}
                onToggle={() => setLeftOut((current) => (current.includes(row.id) ? current.filter((item) => item !== row.id) : [...current, row.id]))}
              />
            ))}
          </ul>
          {control && <div className="pt-1">{control}</div>}
        </div>
      )}
    </section>
  );
}

/** A share's hours, with how much of it is measured when it is not all one or the other. */
function Hours({ share }: { share: Share }): ReactNode {
  const basis: Basis = share.estimated > 0 ? "estimated" : "measured";
  // All of one kind: its mark says which. Mixed: the measured part is written out underneath.
  const single = share.minutes > 0 && (share.measured === 0 || share.estimated === 0);
  const mixed = share.measured > 0 && share.estimated > 0;
  return (
    <span className="text-right text-sm tabular-nums">
      <span className="inline-flex items-center gap-1.5">
        {single && <Mark basis={basis} />}
        {single && <span className="sr-only">{basis}: </span>}
        {hours(share.minutes)} h
      </span>
      {mixed && <span className="block text-xs text-muted-foreground">{hours(share.measured)} measured</span>}
    </span>
  );
}

/** One piece of work. Its title opens the entry in Clio's own words; a call through Case Desk has no entry to open. */
function WorkRow({ row, out, onOpen, onToggle }: { row: TimeRow; out: boolean; onOpen: (ref: string) => void; onToggle: () => void }) {
  const title = <span className="font-serif text-[15px] leading-snug">{row.title}</span>;
  return (
    <li className={cn(WORK_ROW, "py-2", out && "text-muted-foreground")}>
      <span className="text-xs text-muted-foreground tabular-nums">{shortDate(row.date, true) || "Undated"}</span>
      <span className="min-w-0">
        {row.ref ? (
          <button
            type="button"
            onClick={() => onOpen(row.ref ?? "")}
            className="block max-w-full cursor-pointer rounded-sm text-left decoration-input underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {title}
          </button>
        ) : (
          title
        )}
        <span className="block text-xs leading-snug text-muted-foreground">
          {row.why}
          <span className="sm:hidden"> {row.person}.</span>{" "}
          <button type="button" aria-pressed={out} onClick={onToggle} className={quiet}>
            {out ? "Count it" : "Leave out"}
          </button>
        </span>
      </span>
      <span className="hidden truncate text-sm sm:block">{row.person}</span>
      <span className={cn("text-right text-sm tabular-nums", out && "line-through")}>{row.minutes}</span>
      <span className="flex items-center gap-1.5 text-xs">
        <Mark basis={row.basis} />
        {row.basis === "measured" ? <span className="font-medium">measured</span> : "estimated"}
      </span>
    </li>
  );
}
