"use client";

import { TriangleAlertIcon } from "lucide-react";
import { firmCosts, firmSpend, type CaseFile } from "@/features/cases/schema";
import { coverageLayers, specialsOf, totalLimits } from "@/features/matters/schema";
import { usd } from "@/lib/calc";
import { cn } from "@/lib/utils";
import type { CheckedBrief } from "./schema";
import { CitationChips } from "./citation-chip";
import { Empty, Section } from "./section";

type Figure = CheckedBrief["money"][number];

const kindOf = (figure: Figure) => figure.kind.trim().toLowerCase();
/** The latest figure of a kind: the one whose first source is dated last, else the largest. */
function pick(figures: Figure[], kind: string) {
  const all = figures.filter((figure) => kindOf(figure) === kind && figure.amount > 0);
  return all.length ? all.reduce((best, figure) => (figure.amount > best.amount ? figure : best)) : null;
}

/**
 * Value against coverage: one bar on one dollar scale. The coverage layers fill it from zero; the
 * specials, the demand and the offer are markers on it. Every amount is the brief's figure, and
 * every sum and gap is worked out here.
 */
export function CoverageBar({ file, brief }: { file: CaseFile; brief: CheckedBrief }) {
  const layers = coverageLayers(brief);
  const limits = totalLimits(brief);
  const specialsAmount = specialsOf(brief);
  const specials = specialsAmount === null ? null : (brief.money.find((figure) => kindOf(figure) === "specials" && figure.amount === specialsAmount) ?? null);
  const demand = pick(brief.money, "demand");
  const offer = pick(brief.money, "offer");
  const markers = [
    specials && { key: "specials", label: "Medical specials", figure: specials },
    demand && { key: "demand", label: "Demand", figure: demand },
    offer && { key: "offer", label: "Offer", figure: offer },
  ].filter((marker): marker is { key: string; label: string; figure: Figure } => Boolean(marker));
  const shown = new Set<Figure>([...layers, ...markers.map((marker) => marker.figure)]);
  const others = brief.money.filter((figure) => !shown.has(figure) && figure.amount > 0);
  const costs = firmCosts(file);
  const spend = firmSpend(file);

  const scale = Math.max(limits ?? 0, ...markers.map((marker) => marker.figure.amount)) * 1.08 || 1;
  const at = (amount: number) => `${Math.min(100, (amount / scale) * 100)}%`;
  const overDemand = demand && limits !== null && demand.amount > limits ? demand.amount - limits : 0;
  const overSpecials = specials && limits !== null && specials.amount > limits ? specials.amount - limits : 0;

  // Markers close together on the scale take separate label rows, so their labels never overlap.
  const rows: number[] = [];
  const placed = [...markers]
    .sort((a, b) => a.figure.amount - b.figure.amount)
    .map((marker) => {
      const left = (marker.figure.amount / scale) * 100;
      let row = 0;
      while (rows[row] !== undefined && left - rows[row] < 24) row++;
      rows[row] = left;
      return { ...marker, left, row };
    });
  const labelRows = Math.max(1, rows.length);

  if (layers.length === 0 && markers.length === 0) {
    return (
      <Section id="coverage" label="Value vs. coverage">
        <Empty>The brief names no coverage limits, specials, demand or offer for this case.</Empty>
      </Section>
    );
  }

  return (
    <Section id="coverage" label="Value vs. coverage">
      <figure className="flex flex-col gap-2" aria-label="Medical specials, demand and offer against the coverage limits">
        <div className="relative" style={{ height: `${labelRows * 2.25}rem` }}>
          {placed.map((marker) => (
            <span
              key={marker.key}
              className="absolute flex -translate-x-1/2 flex-col items-center text-xs whitespace-nowrap"
              style={{ left: `${marker.left}%`, bottom: `${marker.row * 2.25}rem` }}
            >
              <span className="text-muted-foreground">{marker.label}</span>
              <span className="font-mono text-foreground">{usd(marker.figure.amount)}</span>
            </span>
          ))}
        </div>
        <div className="relative h-4 rounded-full bg-muted">
          {layers.map((layer, index) => {
            const start = layers.slice(0, index).reduce((sum, item) => sum + item.amount, 0);
            return (
              <span
                key={`${layer.label}-${index}`}
                title={`${layer.label}: ${usd(layer.amount)}`}
                className={cn("absolute inset-y-0 border-r-2 border-background", index % 2 === 0 ? "bg-primary/70" : "bg-primary/40")}
                style={{ left: at(start), width: at(layer.amount), borderTopLeftRadius: index === 0 ? 999 : 0, borderBottomLeftRadius: index === 0 ? 999 : 0 }}
              />
            );
          })}
          {placed.map((marker) => (
            <span
              key={marker.key}
              aria-hidden
              className="absolute -top-1.5 -bottom-1.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
              style={{ left: `${marker.left}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between font-mono text-xs text-muted-foreground">
          <span>{usd(0)}</span>
          {limits !== null && <span>Coverage in all {usd(limits)}</span>}
        </div>
      </figure>

      {(overDemand > 0 || overSpecials > 0) && (
        <div className="flex flex-col gap-1">
          {overDemand > 0 && (
            <p className="flex items-center gap-2 text-sm text-warning">
              <TriangleAlertIcon className="size-4 shrink-0" />
              Demand exceeds available coverage by <span className="font-mono">{usd(overDemand)}</span>.
            </p>
          )}
          {overSpecials > 0 && (
            <p className="flex items-center gap-2 text-sm text-warning">
              <TriangleAlertIcon className="size-4 shrink-0" />
              Medical specials exceed available coverage by <span className="font-mono">{usd(overSpecials)}</span>.
            </p>
          )}
        </div>
      )}

      <dl className="flex flex-col divide-y border-y text-sm">
        {layers.map((layer, index) => (
          <Row key={`layer-${index}`} label={layer.label} amount={layer.amount} note={layer.note} evidence={layer.evidence} swatch={index % 2 === 0 ? "bg-primary/70" : "bg-primary/40"} />
        ))}
        {markers.map((marker) => (
          <Row key={marker.key} label={marker.figure.label || marker.label} amount={marker.figure.amount} note={marker.figure.note} evidence={marker.figure.evidence} swatch="bg-foreground" />
        ))}
        {others.map((figure, index) => (
          <Row key={`other-${index}`} label={figure.label} amount={figure.amount} note={figure.note} evidence={figure.evidence} />
        ))}
        {costs.length > 0 && (
          <Row
            label="The firm's costs to date"
            amount={spend}
            note={`${costs.length} expense ${costs.length === 1 ? "entry" : "entries"} in Clio, added up here`}
            evidence={costs.map((entry) => ({ source: entry.ref, quote: "" }))}
          />
        )}
      </dl>
    </Section>
  );
}

function Row({
  label,
  amount,
  note,
  evidence,
  swatch,
}: {
  label: string;
  amount: number;
  note?: string;
  evidence: { source: string; quote: string; found?: boolean }[];
  swatch?: string;
}) {
  return (
    <div className="flex flex-col gap-1 py-2 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", swatch ?? "bg-transparent")} />
          {label}
        </span>
        {note && <span className="pl-4 text-xs text-muted-foreground">{note}</span>}
      </dt>
      <dd className="flex flex-wrap items-center gap-2 pl-4 sm:justify-end sm:pl-0">
        <span className="font-mono tabular-nums">{usd(amount)}</span>
        <CitationChips evidence={evidence.slice(0, 3)} />
      </dd>
    </div>
  );
}
