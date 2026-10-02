"use client";

import { StatusIcon } from "@/components/status";
import { contactNamed, shortDate, type CaseFile, type Entry } from "@/features/cases/schema";
import { dollars } from "@/features/cases/words";
import { sumDollars } from "@/lib/settle";
import { cn } from "@/lib/utils";
import { useFold } from "./fold";
import type { CheckedBrief, SectionProps } from "./schema";
import { SourceLinks, useSource } from "./source-panel";

type Figure = CheckedBrief["money"][number];

/** What one provider has billed: the charges Clio records under its name. */
export type ProviderCharge = {
  /** Stable within a case: the contact's ref, or the entry's own when no contact is named. */
  key: string;
  /** The contact's name as Clio has it; the entry's title when the entry names no contact. */
  name: string;
  /** The charges, oldest first. */
  entries: Entry[];
  /** Their sum, in dollars. */
  amount: number;
};

const amountOf = (entry: Entry) => Number(entry.facts.amount) || 0;

/**
 * The provider charges on a case, largest first. Clio holds a provider's bill as an expense the
 * firm did not pay itself (see `facts.billable`); the firm's own costs are the other expenses.
 * Charges that name the same contact are one row; a charge that names none stands alone.
 */
export function providerCharges(file: CaseFile): ProviderCharge[] {
  const groups = new Map<string, ProviderCharge>();
  for (const entry of file.entries) {
    if (entry.kind !== "expense" || entry.facts.billable !== false) continue;
    const contact = contactNamed(file, entry.text) ?? contactNamed(file, entry.title);
    const key = contact?.ref ?? entry.ref;
    const group = groups.get(key) ?? { key, name: contact?.title || entry.title || "Charge with no name", entries: [], amount: 0 };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      entries: group.entries.sort((a, b) => a.date.localeCompare(b.date)),
      amount: sumDollars(group.entries.map(amountOf)),
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** The brief's figures of one kind that state an amount, largest first. The kind is the model's free string. */
export function figuresOf(brief: CheckedBrief, kind: string): Figure[] {
  const plain = (text: string) => text.trim().toLowerCase().replace(/[_-]+/g, " ");
  return brief.money
    .filter((figure) => plain(figure.kind) === kind && figure.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

// Provider, the day the charge is dated, the amount. The amount column is as wide as the one in
// worth and coverage below, so the figures line up down the page.
const ROW = "grid grid-cols-[minmax(0,1fr)_6.5rem_5.5rem] items-baseline gap-x-4 sm:grid-cols-[minmax(0,1fr)_8rem_6.5rem] sm:gap-x-5";

/** How many providers show before the rest is asked for. */
const FIRST_PROVIDERS = 12;

/**
 * Bills by provider: every charge Clio records that the firm did not pay itself, under the provider
 * it names, with the total summed in code and held against the specials figure the brief cites.
 */
export function Bills({ file, stored }: SectionProps) {
  const { openRef } = useSource();
  const charges = providerCharges(file);
  const { shown, control } = useFold(charges, FIRST_PROVIDERS);
  const total = sumDollars(charges.map((charge) => charge.amount));
  const specials = figuresOf(stored.brief, "specials")[0] ?? null;
  // To the cent: the two agree only when there is not a cent between them.
  const gap = specials ? Math.round(Math.abs(total - specials.amount) * 100) / 100 : 0;
  const agrees = gap === 0;

  return (
    <section aria-labelledby="bills-by-provider" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="bills-by-provider" className="font-heading text-xl font-semibold tracking-tight">
          Bills by provider
        </h2>
        {charges.length > 0 && (
          <p className="text-sm text-muted-foreground">Charges billed as recorded in Clio, not balances owed.</p>
        )}
      </div>

      {charges.length === 0 ? (
        <p className="border-y py-3 text-sm text-muted-foreground">
          Clio holds no provider charges on this matter. A bill entered in Clio as an expense the firm did not pay
          itself is listed here.
        </p>
      ) : (
        <div>
          <div className={cn(ROW, "pb-1.5 text-xs text-muted-foreground")}>
            <span>Provider</span>
            <span>Dated</span>
            <span className="text-right">Billed</span>
          </div>
          <ul className="divide-y border-y">
            {shown.map((charge) =>
              charge.entries.length === 1 ? (
                <li key={charge.key}>
                  <ChargeRow entry={charge.entries[0]} name={charge.name} onOpen={openRef} />
                </li>
              ) : (
                // A provider with several charges: its total, then each charge under it.
                <li key={charge.key}>
                  <div className={cn(ROW, "pt-2 pb-0.5")}>
                    <span className="font-serif text-[15px] leading-snug">{charge.name}</span>
                    <span className="text-xs text-muted-foreground">{charge.entries.length} charges</span>
                    <span className="text-right font-serif text-[15px] tabular-nums">{dollars(charge.amount)}</span>
                  </div>
                  <ul className="pb-1">
                    {charge.entries.map((entry) => (
                      <li key={entry.ref}>
                        <ChargeRow entry={entry} name={entry.title || "Charge"} onOpen={openRef} within />
                      </li>
                    ))}
                  </ul>
                </li>
              ),
            )}
          </ul>
          {control && <div className="pt-2">{control}</div>}

          <div className={cn(ROW, "pt-2.5")}>
            <span className="text-sm font-medium">
              Total billed by {charges.length} {charges.length === 1 ? "provider" : "providers"}
            </span>
            <span />
            <span className="text-right font-serif text-[15px] font-semibold tabular-nums">{dollars(total)}</span>
          </div>

          <p className="mt-1.5 flex items-baseline gap-1.5 text-sm text-muted-foreground">
            {specials ? (
              <>
                <StatusIcon tone={agrees ? "done" : "mild"} className="translate-y-0.5" />
                <span>
                  {agrees ? (
                    "Agrees with the specials figure in the file."
                  ) : (
                    <>
                      Differs from the specials figure in the file by{" "}
                      <span className="font-serif text-[15px] text-foreground tabular-nums">{dollars(gap)}</span>: the file
                      gives <span className="font-serif text-[15px] text-foreground tabular-nums">{dollars(specials.amount)}</span>.
                    </>
                  )}{" "}
                  {specials.evidence.length > 0 ? (
                    <SourceLinks evidence={specials.evidence} />
                  ) : (
                    "The brief gives no source for that figure."
                  )}
                </span>
              </>
            ) : (
              "The brief gives no specials figure to hold this total against."
            )}
          </p>
        </div>
      )}
    </section>
  );
}

/** One charge: selecting it opens the entry in Clio's own words. */
function ChargeRow({
  entry,
  name,
  onOpen,
  within = false,
}: {
  entry: Entry;
  name: string;
  onOpen: (ref: string) => void;
  /** Under a provider's own row: set in, and quieter. */
  within?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(entry.ref)}
      className={cn(
        ROW,
        "group/charge w-full cursor-pointer rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        within ? "py-1" : "py-2",
      )}
    >
      <span
        className={cn(
          "font-serif leading-snug decoration-input underline-offset-2 group-hover/charge:underline",
          within ? "pl-4 text-sm text-muted-foreground" : "text-[15px]",
        )}
      >
        {name}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">{shortDate(entry.date, true) || "Undated"}</span>
      <span className={cn("text-right font-serif tabular-nums", within ? "text-sm text-muted-foreground" : "text-[15px]")}>
        {dollars(amountOf(entry))}
      </span>
    </button>
  );
}
