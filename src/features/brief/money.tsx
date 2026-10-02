"use client";

import { ChevronDown } from "lucide-react";
import { firmCosts, firmSpend, shortDate } from "@/features/cases/schema";
import { dollars } from "@/features/cases/words";
import { cn } from "@/lib/utils";
import { useFold } from "./fold";
import { MONEY_KINDS, type CheckedBrief, type SectionProps } from "./schema";
import { SourceLinks, useSource } from "./source-panel";

type Figure = CheckedBrief["money"][number];
type Kind = (typeof MONEY_KINDS)[number];

function kindOf(raw: string): Kind {
  const kind = raw.trim().toLowerCase().replace(/[_-]+/g, " ");
  return (MONEY_KINDS as readonly string[]).includes(kind) ? kind as Kind : "other";
}

// Category colours describe what a figure is. Labels always carry the same meaning.
const CATEGORY: Record<Kind, { label: string; colour: string; bar: string }> = {
  value: { label: "Estimate", colour: "text-violet-700 dark:text-violet-300", bar: "bg-violet-500" },
  coverage: { label: "Coverage", colour: "text-sky-700 dark:text-sky-300", bar: "bg-sky-500" },
  specials: { label: "Medical bills", colour: "text-teal-700 dark:text-teal-300", bar: "bg-teal-600" },
  "wage loss": { label: "Lost income", colour: "text-indigo-700 dark:text-indigo-300", bar: "bg-indigo-500" },
  lien: { label: "Lien", colour: "text-amber-700 dark:text-amber-300", bar: "bg-amber-500" },
  offer: { label: "Offer", colour: "text-slate-600 dark:text-slate-300", bar: "bg-slate-500" },
  demand: { label: "Demand / court papers", colour: "text-slate-600 dark:text-slate-300", bar: "bg-slate-500" },
  other: { label: "Other", colour: "text-slate-600 dark:text-slate-300", bar: "bg-slate-500" },
};

/** Figures retain their recorded meaning; translate the unfamiliar billing term for the reader. */
function plainLabel(figure: Figure) {
  return (figure.label || CATEGORY[kindOf(figure.kind)].label)
    .replace(/medical specials/gi, "Medical bills")
    .replace(/\bspecials\b/gi, "medical bills")
    .replace(/damages stated in discovery response/gi, "Amount stated in court papers");
}

/** A visual comparison first; each figure unfolds into its qualifications and original sources. */
export function Money({ file, stored, overview = false }: SectionProps & { overview?: boolean }) {
  const headingId = overview ? "worth-and-coverage-overview" : "worth-and-coverage";
  const figures = stored.brief.money;
  const ofKind = (kind: Kind) => figures.filter((figure) => kindOf(figure.kind) === kind && figure.amount > 0).sort((a, b) => b.amount - a.amount);
  const estimates = ofKind("value");
  const limits = ofKind("coverage");
  const estimate = estimates[0];
  const coverage = limits[0];
  const costs = figures.filter((figure) => ["specials", "wage loss", "lien"].includes(kindOf(figure.kind)));
  const other = figures.filter((figure) => figure !== estimate && figure !== coverage && !costs.includes(figure));

  return (
    <section aria-labelledby={headingId} data-money-summary className="space-y-6">
      <div className="space-y-1">
        <h2 id={headingId} className="font-heading text-xl font-semibold tracking-tight">Worth and coverage</h2>
        <p className="text-sm text-muted-foreground">Select a figure for its notes and sources.</p>
      </div>

      {figures.length === 0 ? (
        <p className="border-y py-3 text-sm text-muted-foreground">The saved brief has no financial figures. Check the full file or update the brief.</p>
      ) : (
        <>
          <div className={cn("grid items-center gap-6", estimate && coverage && "sm:grid-cols-[12rem_minmax(0,1fr)]")}>
            {estimate && coverage && <CoverageRing estimate={estimate} coverage={coverage} />}
            <div className="min-w-0 divide-y">
              <Headline figure={estimate} kind="value" title={estimates.length > 1 ? "Highest recorded estimate" : "Case value estimate"} />
              <Headline figure={coverage} kind="coverage" title={limits.length > 1 ? "Highest reported coverage" : "Reported coverage"} />
              {estimate && coverage && <CoverageDifference estimate={estimate} coverage={coverage} />}
            </div>
          </div>
          {costs.length > 0 && (
            <div className="border-t pt-5">
              <h3 className="text-sm font-semibold">Bills, lost income & liens</h3>
              <p className="mt-1 text-xs text-muted-foreground">Compare the amounts. These are separate figures, not a total.</p>
              <AmountBars figures={costs} />
            </div>
          )}
          {other.length > 0 && (
            <details data-other-money className="border-y [&[open]>summary_.money-show]:hidden [&[open]>summary_.money-hide]:inline">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                <span className="font-medium">Other amounts in the file <span className="ml-1 text-muted-foreground">({other.length})</span></span>
                <span className="money-show shrink-0 font-medium text-primary">Show</span>
                <span className="money-hide hidden shrink-0 font-medium text-primary">Hide</span>
              </summary>
              <FigureRows figures={other} />
            </details>
          )}
        </>
      )}
      <div className="border-t pt-3"><Spend file={file} /></div>
    </section>
  );
}

/** The circle's whole is the larger figure, so both orders (and equal amounts) remain to scale. */
function CoverageRing({ estimate, coverage }: { estimate: Figure; coverage: Figure }) {
  const coverageIsSmaller = coverage.amount <= estimate.amount;
  const share = Math.min(estimate.amount, coverage.amount) / Math.max(estimate.amount, coverage.amount);
  const percentage = Math.round(share * 1000) / 10;
  const part = coverageIsSmaller ? "coverage" : "estimate";
  const whole = coverageIsSmaller ? "estimate" : "coverage";
  const description = `${coverageIsSmaller ? "Reported coverage" : "The case estimate"} is ${percentage}% of ${coverageIsSmaller ? "the case estimate" : "reported coverage"}.`;

  return (
    <figure className="mx-auto w-48 text-center" data-coverage-chart>
      <div className="relative">
        <svg viewBox="0 0 180 180" className="size-48" role="img" aria-label={description}>
          <circle cx="90" cy="90" r="73" fill="none" strokeWidth="16" className={coverageIsSmaller ? "stroke-violet-200 dark:stroke-violet-400/30" : "stroke-sky-200 dark:stroke-sky-400/30"} />
          <circle cx="90" cy="90" r="73" fill="none" strokeWidth="16" pathLength="100"
            strokeDasharray={`${share * 100} 100`} transform="rotate(-90 90 90)"
            className={coverageIsSmaller ? "stroke-sky-500" : "stroke-violet-500"} />
        </svg>
        <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-serif text-4xl tabular-nums">{percentage}%</span>
          <span className="mt-1 text-xs leading-4 text-muted-foreground">{part}<br />of {whole}</span>
        </div>
      </div>
      <figcaption className="mt-1 text-xs text-muted-foreground">Full circle = {whole}</figcaption>
    </figure>
  );
}

function CoverageDifference({ estimate, coverage }: { estimate: Figure; coverage: Figure }) {
  const gap = Math.round((estimate.amount - coverage.amount) * 100) / 100;
  return (
    <p data-coverage-difference className="pt-3 text-sm leading-6">
      {gap === 0 ? "The estimate and reported coverage are equal." : <>
        <strong className="font-serif text-xl tabular-nums">{dollars(Math.abs(gap))}</strong>{" "}
        <span className="text-muted-foreground">{gap > 0 ? "of the estimate is above reported coverage" : "of reported coverage is above the estimate"}</span>
      </>}
    </p>
  );
}

function Headline({ figure, kind, title }: { figure?: Figure; kind: "value" | "coverage"; title: string }) {
  const category = CATEGORY[kind];
  if (!figure) return <div className="py-3"><p className="text-sm text-muted-foreground">{title}</p><p className="font-serif text-xl">Not recorded</p></div>;
  return (
    <details data-money-headline={kind} className="group/figure py-3 first:pt-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h3 className={cn("flex items-center gap-2 text-sm font-medium", category.colour)}>
            <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", category.bar)} />{title}
          </h3>
          <p className="mt-1 font-serif text-3xl leading-tight tabular-nums">{dollars(figure.amount)}</p>
        </div>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground group-open/figure:rotate-180" />
      </summary>
      <div className="space-y-1.5 pt-3">
        <p className="text-xs font-medium">{plainLabel(figure)}</p>
        {figure.note && <p className="text-[13px] leading-5 text-muted-foreground">{figure.note}</p>}
        <Sources figure={figure} />
      </div>
    </details>
  );
}

/** Independent bars share a scale but are never added together or treated as parts of a total. */
function AmountBars({ figures }: { figures: Figure[] }) {
  const { shown, control } = useFold(figures);
  const top = Math.max(1, ...figures.map((figure) => figure.amount));
  return (
    <div className="mt-2">
      {shown.map((figure, index) => {
        const category = CATEGORY[kindOf(figure.kind)];
        return <details key={index} data-money-bar className="group/figure py-3">
          <summary className="cursor-pointer list-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <div className="flex items-start justify-between gap-4">
              <h4 className="min-w-0 text-sm font-medium">{plainLabel(figure)}</h4>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-serif text-lg leading-5 tabular-nums">{figure.amount > 0 ? dollars(figure.amount) : "Not stated"}</span>
                <ChevronDown aria-hidden className="size-3.5 text-muted-foreground group-open/figure:rotate-180" />
              </div>
            </div>
            <div aria-hidden className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", category.bar)} style={{ width: `${Math.max(0, figure.amount) / top * 100}%` }} />
            </div>
          </summary>
          <div className="space-y-1.5 pt-3">
            <p className={cn("text-xs font-medium", category.colour)}>{category.label}</p>
            {figure.note && <p className="text-[13px] leading-5 text-muted-foreground">{figure.note}</p>}
            <Sources figure={figure} />
          </div>
        </details>;
      })}
      {control && <div className="pt-2">{control}</div>}
    </div>
  );
}

function Sources({ figure }: { figure: Figure }) {
  return <p className="text-xs leading-5">{figure.evidence.length ? <SourceLinks evidence={figure.evidence} /> : <span className="text-muted-foreground">No source supplied in the brief; check the full file.</span>}</p>;
}

/** Each recorded amount keeps its label, qualification and original evidence. */
function FigureRows({ figures }: { figures: Figure[] }) {
  const { shown, control } = useFold(figures);
  return (
    <>
      <ul className="mt-2 divide-y border-y">
        {shown.map((figure, index) => {
          const category = CATEGORY[kindOf(figure.kind)];
          return <li key={index} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-3">
            <h4 className="min-w-0 text-sm font-medium leading-5">{plainLabel(figure)}</h4>
            <p className="text-right font-serif text-lg leading-5 tabular-nums">{figure.amount > 0 ? dollars(figure.amount) : "Not stated"}</p>
            <div className="col-span-2 flex flex-wrap items-start gap-x-2 gap-y-1">
              <span className={cn("shrink-0 text-xs font-medium leading-5", category.colour)}>{category.label}</span>
              {figure.note && <p className="min-w-0 flex-1 basis-48 text-[13px] leading-5 text-muted-foreground">{figure.note}</p>}
            </div>
            <div className="col-span-2"><Sources figure={figure} /></div>
          </li>;
        })}
      </ul>
      {control && <div className="pt-2">{control}</div>}
    </>
  );
}

/** What the firm itself has paid out, summed from its own cost entries, each of which opens at its source. */
function Spend({ file }: Pick<SectionProps, "file">) {
  const { openRef } = useSource();
  const expenses = firmCosts(file).sort((a, b) => a.date.localeCompare(b.date));
  const others = file.entries.filter((entry) => entry.kind === "expense").length - expenses.length;

  if (expenses.length === 0) {
    return <p className="text-sm text-muted-foreground">The firm has recorded no expenses on this case.</p>;
  }

  return (
    <details className="group/spend text-sm">
      <summary className="cursor-pointer list-none rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        The firm has spent <span className="font-serif text-[15px] text-foreground tabular-nums">{dollars(firmSpend(file))}</span>{" "}
        on this case across {expenses.length} expense {expenses.length === 1 ? "entry" : "entries"}.{" "}
        <span className="font-medium text-primary underline-offset-2 group-open/spend:hidden hover:underline">
          List them
        </span>
        <span className="hidden font-medium text-primary underline-offset-2 group-open/spend:inline hover:underline">
          Hide them
        </span>
      </summary>
      <ul className="mt-2 max-w-2xl divide-y border-y">
        {expenses.map((entry) => (
          <li key={entry.ref}>
            <button
              type="button"
              onClick={() => openRef(entry.ref)}
              className="group/expense grid w-full cursor-pointer grid-cols-[6.5rem_minmax(0,1fr)_5.5rem] items-baseline gap-x-4 rounded-sm py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span className="text-xs text-muted-foreground tabular-nums">
                {shortDate(entry.date, true) || "Undated"}
              </span>
              <span className="font-serif text-[15px] leading-snug decoration-input underline-offset-2 group-hover/expense:underline">
                {entry.title || "Expense"}
              </span>
              <span className="text-right font-serif text-[15px] tabular-nums">
                {dollars(Number(entry.facts.amount) || 0)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {others > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {others} other expense {others === 1 ? "entry" : "entries"} in the file {others === 1 ? "is" : "are"} not the
          firm&apos;s own costs and {others === 1 ? "is" : "are"} left out of this total.
        </p>
      )}
    </details>
  );
}
