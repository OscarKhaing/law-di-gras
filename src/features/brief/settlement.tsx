"use client";

import { useId, useState, type ReactNode } from "react";
import { StatusIcon, StatusPill } from "@/components/status";
import { Input } from "@/components/ui/input";
import { firmCosts, firmSpend } from "@/features/cases/schema";
import { dollars } from "@/features/cases/words";
import { parseDollars, parsePercent, settle, sumDollars, type FeeOn } from "@/lib/settle";
import { cn } from "@/lib/utils";
import { figuresOf, providerCharges } from "./bills";
import { foldClass } from "./fold";
import type { CheckedBrief, SectionProps } from "./schema";
import { SourceLinks } from "./source-panel";

type Figure = CheckedBrief["money"][number];

/** A figure the brief gives that the settlement can be held against, drawn on the slider's scale. */
type Mark = { key: string; label: string; figure: Figure; limit: boolean };

/** One lien or provider charge: whether it is counted, and how far it is negotiated down, as typed. */
type Row = { on: boolean; reduce: string };

type Inputs = {
  /** The settlement and the fee as typed, so a half-typed figure is not rewritten under the cursor. */
  amount: string;
  fee: string;
  feeOn: FeeOn;
  costsOn: boolean;
  liens: Row[];
  charges: Row[];
};

/** The fee the worksheet starts from: one third, written the way a retainer writes it. */
const ASSUMED_FEE = "33 1/3";

const FEE_ON: { value: FeeOn; label: string }[] = [
  { value: "gross", label: "the gross settlement" },
  { value: "net of costs", label: "the settlement after costs" },
];

/** A typed amount written back with its thousands marked: 250000 reads "250,000". */
const typed = (amount: number) => (amount > 0 ? amount.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "");

/** An amount coming out of the settlement. */
const taken = (amount: number) => (amount > 0 ? `−${dollars(amount)}` : dollars(0));

const signed = (amount: number) => (amount < 0 ? `−${dollars(-amount)}` : dollars(amount));

/** A share of the settlement as a percentage, to one decimal: "33.3%". */
const share = (part: number, whole: number) => `${Math.round((part / whole) * 1000) / 10}%`;

/** A round amount for the ends of the scale: $0, $250K, $1.5M. */
function shortDollars(amount: number) {
  const rounded = (value: number) => String(Math.round(value * 10) / 10);
  if (amount >= 1_000_000) return `$${rounded(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `$${rounded(amount / 1_000)}K`;
  return `$${rounded(amount)}`;
}

/** The next round amount at or above a figure, so the scale ends on a number that reads easily. */
function roundUp(amount: number) {
  if (amount <= 0) return 0;
  const power = 10 ** Math.floor(Math.log10(amount));
  return ([1, 2, 2.5, 5, 10].find((times) => times * power >= amount) ?? 10) * power;
}

// The ledger's columns: what the line is, the figure the file gives, how far it is reduced, and what
// comes out of the settlement. The figure in the file drops away on a narrow screen.
const LEDGER =
  "grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] items-baseline gap-x-3 sm:grid-cols-[minmax(0,1fr)_6rem_5.5rem_7rem] sm:gap-x-5";
const FROM_FILE = "hidden text-right font-serif text-[15px] tabular-nums sm:block";
const OUT = "text-right text-sm tabular-nums";

/** The parts of the bar, in the order money leaves a settlement; green is the client's alone. */
const PARTS = {
  fee: { name: "Attorney fee", colour: "bg-foreground/80" },
  costs: { name: "Costs reimbursed", colour: "bg-foreground/55" },
  liens: { name: "Liens", colour: "bg-foreground/35" },
  charges: { name: "Provider charges", colour: "bg-foreground/20" },
  net: { name: "Estimated net to client", colour: "bg-primary" },
} as const;

/**
 * A settlement worked through: for an amount the attorney types or slides to, what the fee, the
 * firm's costs, the liens and any provider charges take, and what is left for the client, against
 * the coverage limit. Every figure it starts from is the file's, with its sources; the fee is an
 * assumption and says so. Nothing here is saved or sent.
 */
export function Settlement({ file, stored }: SectionProps) {
  const id = useId();
  const liens = figuresOf(stored.brief, "lien");
  const charges = providerCharges(file);
  const costs = firmSpend(file);
  const costEntries = firmCosts(file).length;

  const coverage = figuresOf(stored.brief, "coverage")[0] ?? null;
  const value = figuresOf(stored.brief, "value")[0] ?? null;
  const marks: Mark[] = [
    ...(coverage ? [{ key: "coverage", label: "Coverage limit", figure: coverage, limit: true }] : []),
    ...(value ? [{ key: "value", label: "Estimated value", figure: value, limit: false }] : []),
    ...figuresOf(stored.brief, "offer").map((figure, index) => ({ key: `offer-${index}`, label: figure.label || "Offer", figure, limit: false })),
    ...figuresOf(stored.brief, "demand").map((figure, index) => ({ key: `demand-${index}`, label: figure.label || "Demand", figure, limit: false })),
  ].sort((a, b) => a.figure.amount - b.figure.amount);

  const start: Inputs = {
    amount: typed(coverage?.amount ?? value?.amount ?? 0),
    fee: ASSUMED_FEE,
    feeOn: "gross",
    costsOn: true,
    liens: liens.map(() => ({ on: true, reduce: "0" })),
    charges: charges.map(() => ({ on: false, reduce: "0" })),
  };
  const [inputs, setInputs] = useState<Inputs>(start);
  // The furthest amount typed: the slider's scale stretches to hold it and does not shrink back.
  const [reach, setReach] = useState(0);
  const [chargesOpen, setChargesOpen] = useState(false);
  const change = (patch: Partial<Inputs>) => setInputs((current) => ({ ...current, ...patch }));
  const changed = JSON.stringify(inputs) !== JSON.stringify(start);

  const lienRows = liens.map((figure, index) => ({ figure, row: inputs.liens[index] ?? start.liens[index] }));
  const chargeRows = charges.map((charge, index) => ({ charge, row: inputs.charges[index] ?? start.charges[index] }));
  const setLien = (index: number, patch: Partial<Row>) =>
    change({ liens: lienRows.map(({ row }, at) => (at === index ? { ...row, ...patch } : row)) });
  const setCharge = (index: number, patch: Partial<Row>) =>
    change({ charges: chargeRows.map(({ row }, at) => (at === index ? { ...row, ...patch } : row)) });

  const amount = parseDollars(inputs.amount);
  const feePercent = parsePercent(inputs.fee);
  const countedLiens = lienRows.filter(({ row }) => row.on);
  const countedCharges = chargeRows.filter(({ row }) => row.on);
  const result = settle({
    amount,
    feePercent,
    feeOn: inputs.feeOn,
    costs: inputs.costsOn ? costs : 0,
    deductions: [
      ...countedLiens.map(({ figure, row }) => ({ amount: figure.amount, reducePercent: parsePercent(row.reduce) })),
      ...countedCharges.map(({ charge, row }) => ({ amount: charge.amount, reducePercent: parsePercent(row.reduce) })),
    ],
  });
  // The result lists the deductions in the order given: the counted liens, then the counted charges.
  const lienOut = new Map(countedLiens.map(({ figure }, index) => [figure, result.deductions[index]]));
  const chargeOut = new Map(countedCharges.map(({ charge }, index) => [charge.key, result.deductions[countedLiens.length + index]]));
  const liensTaken = sumDollars([...lienOut.values()]);
  const chargesTaken = sumDollars([...chargeOut.values()]);

  // The scale runs a little past the larger of the coverage limit and the estimated value. A figure
  // far beyond both (a pleaded ceiling, say) would squeeze everything else against the left edge, so
  // one more than twice that is left off the scale and named under it, unless the amount tried
  // reaches it. With no coverage or value the scale holds every mark, and with no mark at all it
  // runs to twice what could come out, so there is still something to slide along.
  const anchor = Math.max(coverage?.amount ?? 0, value?.amount ?? 0);
  const within = marks.filter((mark) => anchor <= 0 || mark.figure.amount <= anchor * 2);
  const largestMark = Math.max(0, ...within.map((mark) => mark.figure.amount));
  const allDeductions = sumDollars([costs, ...liens.map((figure) => figure.amount), ...charges.map((charge) => charge.amount)]);
  const top = roundUp(Math.max(largestMark > 0 ? largestMark * 1.2 : allDeductions * 2, reach, amount));
  const step = top > 0 ? Math.max(1, 10 ** Math.floor(Math.log10(top / 400))) : 1;
  const at = (dollarsAt: number) => (top > 0 ? Math.max(0, Math.min(100, (dollarsAt / top) * 100)) : 0);
  const onScale = marks.filter((mark) => mark.figure.amount <= top);
  const offScale = marks.filter((mark) => mark.figure.amount > top);

  const setAmount = (next: number) => {
    change({ amount: typed(next) });
    setReach((current) => Math.max(current, next));
  };

  const blank = amount <= 0;
  const short = !blank && result.net < 0;
  const beyond = coverage && amount > coverage.amount ? sumDollars([amount]) - coverage.amount : 0;
  const nothingToDeduct = liens.length === 0 && charges.length === 0 && costs <= 0;

  // The bar divides the settlement. When more comes out than it holds, the bar is everything that
  // comes out instead, with the point the settlement reaches marked on it.
  const whole = short ? result.total : result.amount;
  const segments = [
    { ...PARTS.fee, amount: result.fee },
    { ...PARTS.costs, amount: result.costs },
    { ...PARTS.liens, amount: liensTaken },
    { ...PARTS.charges, amount: chargesTaken },
    { ...PARTS.net, amount: Math.max(0, result.net) },
  ].filter((segment) => segment.amount > 0);
  const inWords = blank
    ? "No settlement amount yet."
    : `Of a ${dollars(result.amount)} settlement: ${segments
        .map((segment) => `${segment.name.toLowerCase()} ${dollars(segment.amount)}, ${share(segment.amount, result.amount)}`)
        .join("; ")}.${short ? ` That is ${dollars(-result.net)} more than the settlement.` : ""}`;

  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id={`${id}-heading`} className="font-heading text-xl font-semibold tracking-tight">
          Settlement breakdown
        </h2>
        <p className="text-sm text-muted-foreground">
          Try a figure: what each party takes from it, and what is left for the client.
        </p>
      </div>

      {!coverage && (
        <p className="text-sm text-muted-foreground">
          {value
            ? "The brief gives no coverage limit, so the amount starts at the estimated value and nothing here marks what the coverage pays."
            : "The brief gives no coverage limit and no estimated value, so there is no figure to start from. Type a settlement amount to work it through."}
        </p>
      )}

      {/* The question and its answer on one line: the amount tried, and what it leaves the client. */}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <label htmlFor={`${id}-amount`} className="block text-sm font-medium">
            Settlement amount
          </label>
          <div className="mt-1 flex items-baseline gap-1">
            <span aria-hidden className="text-xl text-muted-foreground">
              $
            </span>
            <Input
              id={`${id}-amount`}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={inputs.amount}
              onChange={(event) => {
                const text = event.target.value.replace(/[^0-9.,]/g, "");
                change({ amount: text });
                setReach((current) => Math.max(current, parseDollars(text)));
              }}
              onBlur={() => change({ amount: typed(amount) })}
              className="h-10 w-44 px-2 text-xl font-medium tabular-nums md:text-xl"
            />
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium">Estimated net to client</p>
          <output
            htmlFor={`${id}-amount ${id}-slider`}
            className={cn(
              "mt-1 block h-10 text-[1.75rem] leading-10 font-semibold tracking-tight tabular-nums",
              blank ? "text-muted-foreground" : short ? "text-urgent-ink" : "text-primary",
            )}
          >
            {blank ? "No amount yet" : signed(result.net)}
          </output>
        </div>
      </div>

      {top > 0 && (
        <div>
          <div className="relative" style={{ height: onScale.length * MARK_ROW + 28 }}>
            {onScale.map((mark, index) => {
              const left = at(mark.figure.amount);
              // The label sits on the side of its rule with more room, and is cut to fit that room.
              const toRight = left <= 50;
              return (
                <div key={mark.key}>
                  <span
                    aria-hidden
                    className={cn("absolute -translate-x-1/2", mark.limit ? "w-0.5 bg-foreground/70" : "w-px bg-foreground/30")}
                    style={{ left: `${left}%`, top: index * MARK_ROW + 4, bottom: 10 }}
                  />
                  <p
                    className="absolute z-10 flex items-baseline gap-x-1.5 overflow-hidden bg-card px-1 text-xs leading-5 whitespace-nowrap"
                    style={{
                      top: index * MARK_ROW,
                      maxWidth: `calc(${toRight ? 100 - left : left}% - 4px)`,
                      ...(toRight ? { left: `calc(${left}% + 4px)` } : { right: `calc(${100 - left}% + 4px)` }),
                    }}
                  >
                    <button
                      type="button"
                      title={`${mark.figure.label}. Set the settlement to this figure.`}
                      onClick={() => setAmount(mark.figure.amount)}
                      className="flex min-w-0 cursor-pointer items-baseline gap-x-1.5 rounded-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <span className={cn("truncate", mark.limit && "font-medium")}>{mark.label}</span>
                      <span className="font-serif text-sm tabular-nums">{dollars(mark.figure.amount)}</span>
                    </button>
                    <SourceLinks evidence={mark.figure.evidence} />
                  </p>
                </div>
              );
            })}
            {/* The track, filled as far as the amount; the slider itself lies over it. */}
            <div aria-hidden className="absolute inset-x-0 bottom-2 h-1 rounded-full bg-input/70" />
            <div aria-hidden className="absolute bottom-2 left-0 h-1 rounded-full bg-foreground/60" style={{ width: `${at(amount)}%` }} />
            <input
              id={`${id}-slider`}
              type="range"
              aria-label="Settlement amount"
              aria-valuetext={dollars(amount)}
              min={0}
              max={top}
              step={step}
              value={Math.min(amount, top)}
              onChange={(event) => setAmount(Number(event.target.value))}
              className={SLIDER}
            />
          </div>
          <div aria-hidden className="flex justify-between pt-0.5 text-xs text-muted-foreground tabular-nums">
            <span>$0</span>
            <span>{shortDollars(top)}</span>
          </div>
          {offScale.length > 0 && (
            <ul className="space-y-0.5 pt-1.5 text-xs text-muted-foreground">
              {offScale.map((mark) => (
                <li key={mark.key}>
                  Beyond this scale:{" "}
                  <button
                    type="button"
                    title="Set the settlement to this figure."
                    onClick={() => setAmount(mark.figure.amount)}
                    className="cursor-pointer rounded-sm text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {mark.label} <span className="font-serif text-sm tabular-nums">{dollars(mark.figure.amount)}</span>
                  </button>
                  {mark.figure.note && `. ${mark.figure.note.replace(/\.$/, "")}.`} <SourceLinks evidence={mark.figure.evidence} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="space-y-2">
        {blank ? (
          <p className="rounded-[3px] bg-muted px-3 py-1.5 text-sm text-muted-foreground">
            Type a settlement amount{top > 0 ? ", or slide to one," : ""} to see how it divides.
          </p>
        ) : (
          <>
            <div className="relative">
              <div role="img" aria-label={inWords} className="flex h-6 overflow-hidden rounded-[3px] bg-muted">
                {segments.map((segment) => (
                  <span
                    key={segment.name}
                    title={`${segment.name}: ${dollars(segment.amount)}`}
                    className={cn("min-w-0.5 border-r-2 border-card last:border-r-0", segment.colour)}
                    style={{ width: `${(segment.amount / whole) * 100}%` }}
                  />
                ))}
              </div>
              {short && (
                // Where the settlement runs out, and the stretch of the bar there is no money for.
                <>
                  <span aria-hidden className="absolute -inset-y-1 w-0.5 -translate-x-1/2 bg-foreground" style={{ left: `${(result.amount / whole) * 100}%` }} />
                  <span aria-hidden className="absolute -bottom-1.5 right-0 h-1 bg-urgent" style={{ left: `${(result.amount / whole) * 100}%` }} />
                </>
              )}
            </div>
            <ul aria-hidden className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              {segments.map((segment) => (
                <li key={segment.name} className="flex items-center gap-1.5">
                  <span className={cn("size-2.5 rounded-[2px]", segment.colour)} />
                  {segment.name} <span className="tabular-nums">{share(segment.amount, result.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {short && (
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <StatusPill tone="urgent">Net below zero</StatusPill>
            <span>
              The fee, costs and deductions come to <span className="tabular-nums">{dollars(result.total)}</span>, which is{" "}
              <span className="font-medium tabular-nums">{dollars(-result.net)}</span> more than this settlement. The bar
              is everything owed; the rule marks where the settlement runs out.
            </span>
          </p>
        )}
        {coverage && beyond > 0 && (
          <p className="flex items-baseline gap-1.5 text-sm">
            <StatusIcon tone="mild" className="translate-y-0.5" />
            <span>
              This amount is <span className="font-medium tabular-nums">{dollars(beyond)}</span> above the coverage limit
              of <span className="font-serif text-[15px] tabular-nums">{dollars(coverage.amount)}</span>: more than that
              coverage pays.
            </span>
          </p>
        )}
      </div>

      <div>
        <ul className="divide-y border-y">
          <li className={cn(LEDGER, "py-2.5")}>
            <div className="col-span-2 space-y-1 sm:col-span-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
                <label htmlFor={`${id}-fee`} className="font-medium">
                  Attorney fee
                </label>
                <Percent
                  id={`${id}-fee`}
                  value={inputs.fee}
                  onChange={(fee) => change({ fee })}
                  onBlur={() => feePercent >= 100 && change({ fee: "100" })}
                  wide
                />
                <span>of</span>
                <div role="radiogroup" aria-label="What the fee is taken on" className="inline-flex rounded-lg border border-input p-0.5">
                  {FEE_ON.map((option) => (
                    <label
                      key={option.value}
                      className="cursor-pointer rounded-md px-2 py-0.5 text-muted-foreground has-checked:bg-accent has-checked:font-medium has-checked:text-primary has-focus-visible:ring-2 has-focus-visible:ring-ring/50"
                    >
                      <input
                        type="radio"
                        name={`${id}-fee-on`}
                        className="sr-only"
                        checked={inputs.feeOn === option.value}
                        onChange={() => change({ feeOn: option.value })}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Assumed, not from the file: the file holds no fee agreement. Type the retainer&apos;s percentage.
                {inputs.feeOn === "net of costs" &&
                  (inputs.costsOn && costs > 0
                    ? ` Taken on ${dollars(result.feeBase)}.`
                    : " With no costs reimbursed, that is the whole settlement.")}
              </p>
            </div>
            <span className={OUT}>{taken(result.fee)}</span>
          </li>

          {costs > 0 ? (
            <li className={cn(LEDGER, "py-2.5")}>
              <div className="flex items-baseline gap-2.5">
                <Switch on={inputs.costsOn} onChange={(costsOn) => change({ costsOn })} label="Reimburse the firm's costs from the settlement" />
                <div className={cn("text-sm", !inputs.costsOn && "text-muted-foreground")}>
                  <span className="font-medium">Firm&apos;s costs reimbursed</span>
                  <span className="block text-xs text-muted-foreground">
                    {costEntries} expense {costEntries === 1 ? "entry" : "entries"} in Clio
                  </span>
                </div>
              </div>
              <span className={cn(FROM_FILE, !inputs.costsOn && "text-muted-foreground")}>{dollars(costs)}</span>
              <span />
              <Out on={inputs.costsOn} amount={result.costs} />
            </li>
          ) : (
            <li className="py-2.5 text-sm text-muted-foreground">The firm has recorded no costs on this case to reimburse.</li>
          )}

          <li>
            <GroupHead title="Liens asserted" figure="Asserted" />
            {lienRows.length === 0 ? (
              <p className="pb-2.5 text-sm text-muted-foreground">The brief gives no lien on this case.</p>
            ) : (
              <ul>
                {lienRows.map(({ figure, row }, index) => (
                  <li key={index} className={cn(LEDGER, "py-1.5")}>
                    <div className="flex items-baseline gap-2.5">
                      <Switch on={row.on} onChange={(on) => setLien(index, { on })} label={`Count ${figure.label}`} />
                      <div className={cn("min-w-0 text-sm", !row.on && "text-muted-foreground")}>
                        <span className="font-medium">{figure.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {figure.note}
                          {figure.note && " "}
                          {figure.evidence.length > 0 ? <SourceLinks evidence={figure.evidence} /> : "The brief gives no source for this."}
                        </span>
                      </div>
                    </div>
                    <span className={cn(FROM_FILE, !row.on && "text-muted-foreground")}>{dollars(figure.amount)}</span>
                    <Percent
                      value={row.reduce}
                      onChange={(reduce) => setLien(index, { reduce })}
                      disabled={!row.on}
                      label={`Reduce ${figure.label} by this percentage`}
                    />
                    <Out on={row.on} amount={lienOut.get(figure) ?? 0} />
                  </li>
                ))}
              </ul>
            )}
          </li>

          <li>
            <GroupHead
              title="Provider charges billed, balance unknown"
              figure={chargesOpen && chargeRows.length > 0 ? "Billed" : ""}
              remark={
                chargeRows.length === 0
                  ? ""
                  : `${chargeRows.length} ${chargeRows.length === 1 ? "provider" : "providers"}, ${
                      countedCharges.length === 0 ? "none counted" : `${countedCharges.length} counted`
                    }`
              }
              out={!chargesOpen && countedCharges.length > 0 ? taken(chargesTaken) : ""}
            >
              {chargeRows.length > 0 && (
                <button type="button" aria-expanded={chargesOpen} onClick={() => setChargesOpen(!chargesOpen)} className={foldClass}>
                  {chargesOpen ? "Hide them" : "List them"}
                </button>
              )}
            </GroupHead>
            {chargeRows.length === 0 && (
              <p className="pb-2.5 text-sm text-muted-foreground">Clio holds no provider charges on this matter.</p>
            )}
            {countedCharges.length > 0 && countedLiens.length > 0 && (
              <p className="flex items-baseline gap-1.5 pb-2 text-sm">
                <StatusIcon tone="mild" className="translate-y-0.5" />
                <span>
                  A lien may already cover the same care as a provider&apos;s charge. With both counted, the same bill can
                  come out of the settlement twice.
                </span>
              </p>
            )}
            {chargesOpen && chargeRows.length > 0 && (
              <>
                <ul>
                  {chargeRows.map(({ charge, row }, index) => (
                    <li key={charge.key} className={cn(LEDGER, "py-1.5")}>
                      <div className="flex items-baseline gap-2.5">
                        <Switch on={row.on} onChange={(on) => setCharge(index, { on })} label={`Count the charges of ${charge.name}`} />
                        <div className={cn("min-w-0", !row.on && "text-muted-foreground")}>
                          <span className="block font-serif text-[15px] leading-snug">{charge.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            <SourceLinks evidence={charge.entries.map((entry) => ({ source: entry.ref, quote: "" }))} />
                          </span>
                        </div>
                      </div>
                      <span className={cn(FROM_FILE, !row.on && "text-muted-foreground")}>{dollars(charge.amount)}</span>
                      <Percent
                        value={row.reduce}
                        onChange={(reduce) => setCharge(index, { reduce })}
                        disabled={!row.on}
                        label={`Reduce the charges of ${charge.name} by this percentage`}
                      />
                      <Out on={row.on} amount={chargeOut.get(charge.key) ?? 0} />
                    </li>
                  ))}
                </ul>
                <p className="flex flex-wrap items-baseline gap-x-4 pt-1 pb-2.5 text-xs text-muted-foreground">
                  <span>Charges billed as recorded in Clio. What is still owed on them is not in the file.</span>
                  <button
                    type="button"
                    onClick={() =>
                      change({ charges: chargeRows.map(({ row }) => ({ ...row, on: countedCharges.length < chargeRows.length })) })
                    }
                    className={cn(foldClass, "text-xs")}
                  >
                    {countedCharges.length < chargeRows.length ? "Count all of them" : "Count none of them"}
                  </button>
                </p>
              </>
            )}
          </li>

          <li className={cn(LEDGER, "py-2.5")}>
            <div className="col-span-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm sm:col-span-3">
              <span aria-hidden className={cn("size-2.5 self-center rounded-[2px]", short ? "bg-urgent" : "bg-primary")} />
              <span className="font-semibold">Estimated net to client</span>
              {short && <StatusPill tone="urgent">Below zero</StatusPill>}
              {nothingToDeduct && (
                <span className="text-xs text-muted-foreground">
                  The file gives no liens, provider charges or firm costs, so only the fee comes out.
                </span>
              )}
            </div>
            <span className={cn(OUT, "text-base font-semibold", blank ? "text-muted-foreground" : short && "text-urgent-ink")}>
              {blank ? "No amount yet" : signed(result.net)}
            </span>
          </li>
        </ul>
        {/* The way back sits under the ledger: anything appearing above the slider would move it mid-drag. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-2">
          <p className="text-xs text-muted-foreground">An illustration from the figures in the file, not advice.</p>
          {changed && (
            <button
              type="button"
              onClick={() => {
                setInputs(start);
                setReach(0);
              }}
              className={foldClass}
            >
              Reset to the file&apos;s figures
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** The height of one labelled figure above the slider. */
const MARK_ROW = 22;

// The slider is the browser's own, drawn over the track. It is a thumb's width wider than the
// track, so the middle of the thumb travels exactly from the track's start to its end and sits on
// a marked figure when the amount equals it.
const SLIDER = cn(
  "absolute bottom-0 -left-2 h-5 w-[calc(100%+1rem)] cursor-pointer appearance-none rounded-full bg-transparent outline-none",
  "[&::-webkit-slider-runnable-track]:h-5 [&::-webkit-slider-runnable-track]:bg-transparent",
  "[&::-webkit-slider-thumb]:mt-0.5 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-card [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm",
  "[&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-card [&::-moz-range-thumb]:bg-primary",
  "focus-visible:[&::-webkit-slider-thumb]:ring-3 focus-visible:[&::-webkit-slider-thumb]:ring-ring/40",
);

/** The first line of a group of deductions, which also names the columns under it. */
function GroupHead({
  title,
  remark = "",
  figure,
  out = "",
  children,
}: {
  title: string;
  remark?: string;
  /** What the file's figure is for these rows: asserted, billed. Empty when no rows show. */
  figure: string;
  /** The group's total, for a group whose rows are folded away. */
  out?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn(LEDGER, "pt-2.5 pb-1")}>
      <div className={cn("flex flex-wrap items-baseline gap-x-3", !figure && "col-span-2 sm:col-span-3")}>
        <h3 className="text-sm font-medium">{title}</h3>
        {remark && <span className="text-xs text-muted-foreground">{remark}</span>}
        {children}
      </div>
      {figure && (
        <>
          <span className="hidden text-right text-xs text-muted-foreground sm:block">{figure}</span>
          <span className="text-xs text-muted-foreground">Reduced by</span>
        </>
      )}
      <span className={out ? OUT : "text-right text-xs text-muted-foreground"}>{out || (figure && "From settlement")}</span>
    </div>
  );
}

/** The last column of a row: what it takes from the settlement, or that it is left out. */
function Out({ on, amount }: { on: boolean; amount: number }) {
  return on ? <span className={OUT}>{taken(amount)}</span> : <span className="text-right text-xs text-muted-foreground">Not counted</span>;
}

/** A typed percentage. Only what a percentage is written with can be typed into it. */
function Percent({
  id,
  value,
  onChange,
  onBlur,
  disabled = false,
  label,
  wide = false,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  label?: string;
  /** Room for a fee written as a mixed number, "33 1/3". */
  wide?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <Input
        id={id}
        aria-label={label}
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(wide ? /[^0-9./ ]/g : /[^0-9.]/g, ""))}
        onBlur={() => {
          if (!wide) onChange(String(parsePercent(value)));
          onBlur?.();
        }}
        className={cn("h-7 px-1.5 text-right tabular-nums", wide ? "w-16" : "w-12")}
      />
      <span className={cn("text-sm", disabled && "text-muted-foreground")}>%</span>
    </span>
  );
}

/** An on and off switch; green when on, as the user's own choice. */
function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-4 w-7 shrink-0 translate-y-0.5 cursor-pointer items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1",
        on ? "bg-primary" : "bg-input",
      )}
    >
      <span className={cn("inline-block size-3 rounded-full bg-card shadow-xs", on ? "translate-x-3.5" : "translate-x-0.5")} />
    </button>
  );
}
