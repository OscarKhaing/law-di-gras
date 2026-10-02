// What a settlement leaves once the fee, the firm's costs and the claims on it are taken out.
// Pure arithmetic, safe in the browser. Everything is worked in whole cents and given back in dollars
// rounded to the cent, so the parts always add up to the whole.

export type FeeOn = "gross" | "net of costs";

export type Deduction = {
  /** The amount asserted or billed, in dollars. */
  amount: number;
  /** How far it is negotiated down, 0 to 100. A lien of 900 reduced by 25 takes 675. */
  reducePercent: number;
};

export type SettleInput = {
  /** The settlement, in dollars. */
  amount: number;
  /** The attorney's fee, 0 to 100. One third is 100 / 3. */
  feePercent: number;
  /** Whether the fee is a share of the whole settlement or of what is left after the firm's costs. */
  feeOn: FeeOn;
  /** The firm's costs reimbursed from the settlement, in dollars; 0 when they are not reimbursed. */
  costs: number;
  /** Liens and charges paid out of the settlement. */
  deductions: Deduction[];
};

export type Settled = {
  amount: number;
  /** What the fee percentage was applied to. */
  feeBase: number;
  fee: number;
  costs: number;
  /** Each deduction after its reduction, in the order given. */
  deductions: number[];
  /** The sum of the deductions after reduction. */
  deducted: number;
  /** Everything taken out: fee, costs and deductions. */
  total: number;
  /** What is left for the client. Below zero when more is taken out than the settlement holds. */
  net: number;
};

const toCents = (dollars: number) => (Number.isFinite(dollars) ? Math.max(0, Math.round(dollars * 100)) : 0);
const toDollars = (cents: number) => cents / 100;
const percent = (value: number) => (Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0);

/** Amounts in dollars added up without the drift of adding fractions: each is rounded to the cent first. */
export function sumDollars(amounts: number[]): number {
  return toDollars(amounts.reduce((sum, amount) => sum + toCents(amount), 0));
}

/**
 * Splits a settlement. The fee is a percentage of the settlement, or of the settlement less the
 * firm's costs; then the costs and every deduction, each after its own reduction, come out; the
 * client has the rest. Amounts below zero and percentages outside 0 to 100 are held to those bounds.
 */
export function settle(input: SettleInput): Settled {
  const amount = toCents(input.amount);
  const costs = toCents(input.costs);
  const feeBase = input.feeOn === "gross" ? amount : Math.max(0, amount - costs);
  const fee = Math.round((feeBase * percent(input.feePercent)) / 100);
  const deductions = input.deductions.map((deduction) =>
    Math.round((toCents(deduction.amount) * (100 - percent(deduction.reducePercent))) / 100),
  );
  const deducted = deductions.reduce((sum, cents) => sum + cents, 0);
  const total = fee + costs + deducted;
  return {
    amount: toDollars(amount),
    feeBase: toDollars(feeBase),
    fee: toDollars(fee),
    costs: toDollars(costs),
    deductions: deductions.map(toDollars),
    deducted: toDollars(deducted),
    total: toDollars(total),
    net: toDollars(amount - total),
  };
}

// ---- Reading what was typed ----

/** A typed amount in dollars: "$250,000", "250000.50". Anything unreadable, or empty, is 0. */
export function parseDollars(text: string): number {
  const value = Number.parseFloat(text.replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) ? toDollars(toCents(value)) : 0;
}

/**
 * A typed percentage, 0 to 100: "40", "12.5", and the way a fee is usually written, "33 1/3".
 * A fraction on its own that is no more than one is a share of the whole, so "1/3" is one third.
 * Anything unreadable, or empty, is 0.
 */
export function parsePercent(text: string): number {
  const clean = text.replace(/%/g, "").trim();
  const mixed = clean.match(/^(\d+(?:\.\d+)?)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed && Number(mixed[3]) > 0) return percent(Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]));
  const fraction = clean.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction && Number(fraction[2]) > 0) {
    const share = Number(fraction[1]) / Number(fraction[2]);
    return percent(share <= 1 ? share * 100 : share);
  }
  // A fraction that could not be read ("1/0", "1/") is nothing, not its first number.
  return clean.includes("/") ? 0 : percent(Number.parseFloat(clean));
}
