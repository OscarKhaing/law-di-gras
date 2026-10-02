"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { firmCosts, firmSpend, shortDate } from "@/features/cases/schema";
import { dollars } from "@/features/cases/words";
import { cn } from "@/lib/utils";
import { MONEY_KINDS, type CheckedBrief, type SectionProps } from "./schema";
import { SourceLinks, useSource } from "./source-panel";

type Figure = CheckedBrief["money"][number];
type Kind = (typeof MONEY_KINDS)[number];

/** The order the bars are read in: what the case could bring, then what has been lost and claimed. */
const BAR_ORDER: Kind[] = ["value", "demand", "offer", "specials", "wage loss", "lien", "other"];

/** The model's kind is a free string: anything it was not asked for counts as other. */
function kindOf(raw: string): Kind {
  const kind = raw.trim().toLowerCase().replace(/[_-]+/g, " ");
  return (MONEY_KINDS as readonly string[]).includes(kind) ? (kind as Kind) : "other";
}

/** A kind with more figures than this shows its largest; the rest are listed on demand. */
const FOLD_OVER = 3;

/** How the folded figures of a kind are named on the control that lists them. */
const MORE_OF: Record<Kind, string> = {
  value: "valuations",
  coverage: "coverage figures",
  specials: "specials figures",
  "wage loss": "wage loss figures",
  lien: "liens",
  offer: "offers",
  demand: "demands",
  other: "figures",
};

// Every row has the same three columns, so the bars and the coverage lines share one dollar scale.
const ROW = "grid grid-cols-[9rem_minmax(0,1fr)_5.5rem] gap-x-4 sm:grid-cols-[17rem_minmax(0,1fr)_6.5rem] sm:gap-x-5";
/** The height of one label where the coverage lines begin. */
const HEAD = 24;

/** The kinds the picture is about. They set the scale; see `scaleTop`. */
const SCALE_BY: Kind[] = ["value", "coverage", "specials"];

/**
 * How far the scale runs. Normally to the largest figure. But one figure far beyond the value, the
 * coverage and the specials (a pleaded ceiling, say) would flatten everything else into slivers, so
 * a figure more than twice the largest of those is left off the scale and its bar is drawn cut short.
 */
function scaleTop(figures: Figure[]) {
  const amounts = figures.map((figure) => figure.amount);
  const anchor = Math.max(0, ...figures.filter((figure) => SCALE_BY.includes(kindOf(figure.kind))).map((figure) => figure.amount));
  const within = amounts.filter((amount) => anchor <= 0 || amount <= anchor * 2);
  return Math.max(0, ...within) * (within.length < amounts.length ? 1.08 : 1);
}

/** A round amount for the scale: $0, $250K, $1.5M. Written by hand so server and browser agree. */
function shortDollars(amount: number) {
  const rounded = (value: number) => String(Math.round(value * 10) / 10);
  if (amount >= 1_000_000) return `$${rounded(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `$${rounded(amount / 1_000)}K`;
  return `$${rounded(amount)}`;
}

/** Round dollar amounts to label the scale with: four or so steps from zero up to the largest figure. */
function scaleSteps(top: number): number[] {
  if (top <= 0) return [0];
  const rough = top / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((times) => times * power).find((size) => size >= rough) ?? rough;
  const steps: number[] = [];
  for (let amount = 0; amount <= top * 1.0001; amount += step) steps.push(amount);
  return steps;
}

/**
 * Worth and coverage: every figure in the brief as a bar on one dollar scale, and each coverage
 * figure as a marker line drawn down through the bars, so a reader sees at once which figures sit
 * inside the coverage and which run past it. The firm's own spend, summed in code, sits underneath.
 */
export function Money({ file, stored }: SectionProps) {
  const [listed, setListed] = useState<Kind[]>([]);
  const figures = stored.brief.money;
  const largestFirst = (kind: Kind) =>
    figures.filter((figure) => kindOf(figure.kind) === kind).sort((a, b) => b.amount - a.amount);
  const coverage = largestFirst("coverage");
  const top = scaleTop(figures);
  const at = (amount: number) => (top > 0 ? Math.max(0, Math.min(100, (amount / top) * 100)) : 0);
  // One line for each coverage figure the file states; the largest is the strong one.
  const lines: Line[] = coverage
    .filter((figure) => figure.amount > 0)
    .map((figure, index) => ({ figure, left: at(figure.amount), strong: index === 0 }));
  const limit = lines[0]?.figure ?? null;

  return (
    <section aria-labelledby="worth-and-coverage" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="worth-and-coverage" className="font-heading text-xl font-semibold tracking-tight">
          Worth and coverage
        </h2>
        {figures.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {limit
              ? `One dollar scale. ${lines.length === 1 ? "The marked line is the coverage limit" : "Each marked line is a coverage limit"}: a bar that runs past it is more than that coverage pays.`
              : "One dollar scale. The brief gives no coverage figure, so there is no limit to hold the others against."}
          </p>
        )}
      </div>

      {figures.length === 0 ? (
        <p className="border-y py-3 text-sm text-muted-foreground">
          The brief gives no figures for what this case is worth or what coverage sits behind it.
        </p>
      ) : (
        <div>
          <LineHeads lines={lines} />
          <ul className="border-y">
            {BAR_ORDER.map((kind) => {
              const group = largestFirst(kind);
              const folds = group.length > FOLD_OVER;
              const isListed = listed.includes(kind);
              const shown = folds && !isListed ? group.slice(0, 1) : group;
              return shown.flatMap((figure, index) => {
                const beyond = limit && figure.amount > limit.amount ? figure.amount - limit.amount : 0;
                const cutShort = figure.amount > top;
                const row = (
                  <li key={`${kind}-${index}`} className={cn(ROW, "border-t first:border-t-0")}>
                    <Label figure={figure} />
                    <div className="relative border-l border-input">
                      <Lines lines={lines} />
                      {figure.amount > 0 && (
                        <div
                          role="img"
                          aria-label={describe(figure, limit) + (cutShort ? ", drawn cut short" : "")}
                          className={cn(
                            "absolute top-2 left-0 h-3 min-w-0.5",
                            !cutShort && "rounded-r-[3px]",
                            kind === "value" ? "bg-foreground" : "bg-foreground/45",
                          )}
                          style={{ width: `${at(figure.amount)}%` }}
                        >
                          {cutShort && (
                            // The break: two slanted gaps near the end of a bar that goes on past the edge.
                            <>
                              <span className="absolute -inset-y-0.5 right-3 w-[3px] -skew-x-[24deg] bg-background" />
                              <span className="absolute -inset-y-0.5 right-5 w-[3px] -skew-x-[24deg] bg-background" />
                            </>
                          )}
                        </div>
                      )}
                      <Caveat figure={figure}>
                        {limit && beyond > 0 && (
                          <span className="bg-marker box-decoration-clone px-0.5 text-foreground">
                            {dollars(beyond)} beyond {lines.length === 1 ? "the limit" : limit.label}
                          </span>
                        )}
                        {cutShort && " Drawn cut short: it runs off this scale."}
                      </Caveat>
                    </div>
                    <Amount amount={figure.amount} />
                  </li>
                );
                if (!folds || index > 0) return [row];
                // After the largest figure of a long kind: the control that lists the rest.
                return [
                  row,
                  <li key={`${kind}-more`} className={cn(ROW, "border-t")}>
                    <div className="py-1.5">
                      <button
                        type="button"
                        aria-expanded={isListed}
                        onClick={() =>
                          setListed(isListed ? listed.filter((other) => other !== kind) : [...listed, kind])
                        }
                        className="cursor-pointer rounded-sm text-xs font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        {isListed
                          ? `Hide the ${group.length - 1} smaller ${MORE_OF[kind]}`
                          : `${group.length - 1} more ${MORE_OF[kind]}`}
                      </button>
                    </div>
                    <div className="relative border-l border-input">
                      <Lines lines={lines} />
                    </div>
                    <span />
                  </li>,
                ];
              });
            })}
            {coverage.map((figure, index) => (
              <li key={`coverage-${index}`} className={cn(ROW, "border-t first:border-t-0")}>
                <Label figure={figure} />
                <div className="relative border-l border-input">
                  <Lines lines={lines} />
                  {figure.amount > 0 && (
                    <span
                      aria-hidden
                      className="absolute top-3.5 size-2.5 -translate-1/2 rounded-full border border-foreground/70 bg-marker"
                      style={{ left: `${at(figure.amount)}%` }}
                    />
                  )}
                  <Caveat figure={figure} />
                </div>
                <Amount amount={figure.amount} />
              </li>
            ))}
          </ul>
          <Scale top={top} at={at} />
        </div>
      )}

      <Spend file={file} />
    </section>
  );
}

/** A bar in words, for a reader who cannot see it: the figure and how it stands against the coverage. */
function describe(figure: Figure, limit: Figure | null) {
  const amount = `${figure.label}: ${dollars(figure.amount)}`;
  if (!limit) return amount;
  const against = `${limit.label} of ${dollars(limit.amount)}`;
  if (figure.amount > limit.amount) return `${amount}, ${dollars(figure.amount - limit.amount)} beyond the ${against}`;
  return `${amount}, ${Math.round((figure.amount / limit.amount) * 100)}% of the ${against}`;
}

/** The left column of a row: what the figure is. */
function Label({ figure }: { figure: Figure }) {
  return <h3 className="py-2 text-sm leading-5 font-medium text-pretty">{figure.label}</h3>;
}

/** Under a bar: how far it runs past the coverage, any caveat the file attaches to it, and its sources. */
function Caveat({ figure, children }: { figure: Figure; children?: ReactNode }) {
  return (
    <p className="relative pt-6 pb-1.5 pl-2 text-xs leading-4 text-muted-foreground">
      {children}
      {children && " "}
      {figure.note}
      {figure.note && " "}
      {figure.evidence.length > 0 ? <SourceLinks evidence={figure.evidence} /> : "The brief gives no source for this."}
    </p>
  );
}

/** The right column of a row: the amount as the file gives it. Zero means the file does not say. */
function Amount({ amount }: { amount: number }) {
  return amount > 0 ? (
    <p className="py-2 text-right font-serif text-[15px] leading-5 tabular-nums">{dollars(amount)}</p>
  ) : (
    <p className="py-2 text-right text-sm leading-5 text-muted-foreground">Not stated</p>
  );
}

type Line = { figure: Figure; left: number; strong: boolean };

const lineClass = (line: Line) => cn("absolute bottom-0 -translate-x-1/2 bg-marker", line.strong ? "w-1" : "w-0.5");

/** The coverage lines as they cross one row. Rows meet edge to edge, so the pieces read as one line. */
function Lines({ lines }: { lines: Line[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <span key={index} aria-hidden className={cn(lineClass(line), "-top-px")} style={{ left: `${line.left}%` }} />
      ))}
    </>
  );
}

/**
 * Where the coverage lines begin, above the first bar: each line's label and amount written in the
 * marker beside its head. The largest is on top and every label sits to the left of its own line,
 * so no label is crossed by another line.
 */
function LineHeads({ lines }: { lines: Line[] }) {
  if (lines.length === 0) return null;
  return (
    <div className={ROW}>
      <span />
      <div className="relative" style={{ height: lines.length * HEAD + 6 }}>
        {lines.map((line, index) => {
          const middle = index * HEAD + HEAD / 2;
          return (
            <div key={index}>
              <span aria-hidden className={lineClass(line)} style={{ left: `${line.left}%`, top: middle }} />
              <span
                aria-hidden
                className={cn("absolute -translate-1/2 rounded-full bg-marker", line.strong ? "size-2.5" : "size-2")}
                style={{ left: `${line.left}%`, top: middle }}
              />
              <p
                className={cn(
                  "absolute flex max-w-[calc(var(--at)+8rem)] items-baseline gap-1.5 px-1 leading-5 sm:max-w-[calc(var(--at)+16rem)]",
                  line.strong ? "bg-marker" : "bg-marker/45",
                )}
                style={
                  { "--at": `${line.left}%`, top: middle - 10, right: `calc(${100 - line.left}% + 9px)` } as CSSProperties
                }
              >
                <span className="truncate text-xs" title={line.figure.label}>
                  {line.figure.label}
                </span>
                <span className="font-serif text-[15px] tabular-nums">{dollars(line.figure.amount)}</span>
              </p>
            </div>
          );
        })}
      </div>
      <span />
    </div>
  );
}

/** The dollar scale under the bars. Every bar carries its own amount, so this only says how far the picture runs. */
function Scale({ top, at }: { top: number; at: (amount: number) => number }) {
  if (top <= 0) return null;
  return (
    <div aria-hidden className={ROW}>
      <span />
      <div className="relative h-6 text-xs text-muted-foreground tabular-nums">
        {scaleSteps(top).map((amount) => {
          const left = at(amount);
          return (
            <span key={amount} className="absolute top-0 flex flex-col" style={{ left: `${left}%` }}>
              <span className="h-1 w-px bg-input" />
              <span className={cn("pt-0.5", amount > 0 && (left > 94 ? "-translate-x-full" : "-translate-x-1/2"))}>
                {shortDollars(amount)}
              </span>
            </span>
          );
        })}
      </div>
      <span />
    </div>
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
