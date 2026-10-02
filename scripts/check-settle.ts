// Check the settlement arithmetic on worked cases, without a browser or the case file:
//   pnpm -s script scripts/check-settle.ts
// Every number here is made up for the check; none comes from a case.
import { parseDollars, parsePercent, settle, sumDollars, type Settled } from "@/lib/settle";

let failures = 0;
function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `  (got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)})`}`);
}

/** The parts of a result must add back up to the settlement, to the cent. */
function addsUp(what: string, result: Settled) {
  const back = Math.round((result.fee + result.costs + result.deducted + result.net) * 100) / 100;
  check(`${what}: fee, costs, deductions and net add up to the settlement`, back, result.amount);
}

const THIRD = 100 / 3;

// 1. Fee on the gross settlement. 90,000 at one third is 30,000; costs 3,000; a lien of 12,000.
//    90,000 - 30,000 - 3,000 - 12,000 = 45,000.
const gross = settle({
  amount: 90_000,
  feePercent: THIRD,
  feeOn: "gross",
  costs: 3_000,
  deductions: [{ amount: 12_000, reducePercent: 0 }],
});
check("fee on gross: the fee is a third of the whole settlement", gross.fee, 30_000);
check("fee on gross: the fee base is the settlement", gross.feeBase, 90_000);
check("fee on gross: net", gross.net, 45_000);
check("fee on gross: total taken out", gross.total, 45_000);
addsUp("fee on gross", gross);

// 2. The same case with the fee after costs. (90,000 - 3,000) at one third is 29,000.
//    90,000 - 29,000 - 3,000 - 12,000 = 46,000: the client keeps 1,000 more.
const afterCosts = settle({
  amount: 90_000,
  feePercent: THIRD,
  feeOn: "net of costs",
  costs: 3_000,
  deductions: [{ amount: 12_000, reducePercent: 0 }],
});
check("fee after costs: the fee base is the settlement less costs", afterCosts.feeBase, 87_000);
check("fee after costs: the fee", afterCosts.fee, 29_000);
check("fee after costs: net", afterCosts.net, 46_000);
check("fee after costs leaves the client a third of the costs more than fee on gross", afterCosts.net - gross.net, 1_000);
addsUp("fee after costs", afterCosts);

// 3. Reductions: none, a quarter, and all of it. 8,000 stays 8,000; 6,000 less 25% is 4,500; 5,000 less 100% is 0.
const reduced = settle({
  amount: 50_000,
  feePercent: 40,
  feeOn: "gross",
  costs: 0,
  deductions: [
    { amount: 8_000, reducePercent: 0 },
    { amount: 6_000, reducePercent: 25 },
    { amount: 5_000, reducePercent: 100 },
  ],
});
check("a 0% reduction takes the whole amount", reduced.deductions[0], 8_000);
check("a 25% reduction takes three quarters", reduced.deductions[1], 4_500);
check("a 100% reduction takes nothing", reduced.deductions[2], 0);
check("reductions: the deductions total", reduced.deducted, 12_500);
check("reductions: fee at 40%", reduced.fee, 20_000);
check("reductions: net", reduced.net, 17_500);
addsUp("reductions", reduced);

// 4. More is taken out than the settlement holds. 10,000: fee 2,500, costs 1,000, deductions 9,000.
//    10,000 - 12,500 = -2,500.
const short = settle({
  amount: 10_000,
  feePercent: 25,
  feeOn: "gross",
  costs: 1_000,
  deductions: [
    { amount: 7_000, reducePercent: 0 },
    { amount: 2_000, reducePercent: 0 },
  ],
});
check("deductions above the settlement: total taken out", short.total, 12_500);
check("deductions above the settlement: net is below zero", short.net, -2_500);
addsUp("deductions above the settlement", short);

// 5. No settlement at all: no fee, but the costs and the lien are still owed.
const nothing = settle({
  amount: 0,
  feePercent: THIRD,
  feeOn: "gross",
  costs: 500,
  deductions: [{ amount: 2_000, reducePercent: 50 }],
});
check("zero settlement: no fee", nothing.fee, 0);
check("zero settlement: the lien is still halved", nothing.deductions, [1_000]);
check("zero settlement: net is what is still owed, below zero", nothing.net, -1_500);
const nothingAfterCosts = settle({ amount: 0, feePercent: THIRD, feeOn: "net of costs", costs: 500, deductions: [] });
check("zero settlement, fee after costs: the fee base does not go below zero", nothingAfterCosts.feeBase, 0);
check("zero settlement, fee after costs: no fee", nothingAfterCosts.fee, 0);
check("zero settlement with nothing to take out: everything is zero", settle({ amount: 0, feePercent: 0, feeOn: "gross", costs: 0, deductions: [] }).net, 0);

// 6. Cents. One third of 70,000 is 23,333.33 and the client's side carries the odd cent.
const cents = settle({ amount: 70_000, feePercent: THIRD, feeOn: "gross", costs: 0, deductions: [] });
check("one third of 70,000 is 23,333.33", cents.fee, 23_333.33);
check("the rest is 46,666.67", cents.net, 46_666.67);
addsUp("cents", cents);
const odd = settle({
  amount: 1_234.56,
  feePercent: 33,
  feeOn: "net of costs",
  costs: 34.56,
  deductions: [{ amount: 199.99, reducePercent: 12.5 }],
});
// (1,234.56 - 34.56) * 33% = 396.00; 199.99 less 12.5% = 174.99125, rounded 174.99.
check("odd cents: fee", odd.fee, 396);
check("odd cents: the reduced deduction is rounded to the cent", odd.deductions[0], 174.99);
check("odd cents: net", odd.net, 629.01);
addsUp("odd cents", odd);

// 7. Input out of bounds is held to its bounds rather than trusted.
const bounded = settle({
  amount: 1_000,
  feePercent: 250,
  feeOn: "gross",
  costs: -40,
  deductions: [
    { amount: 100, reducePercent: -10 },
    { amount: 100, reducePercent: 400 },
    { amount: Number.NaN, reducePercent: 0 },
  ],
});
check("a fee above 100% is held to 100%", bounded.fee, 1_000);
check("costs below zero count as none", bounded.costs, 0);
check("reductions outside 0 to 100 are held to 0 and 100; an unreadable amount is 0", bounded.deductions, [100, 0, 0]);

// 8. What is typed.
check('"$250,000" is 250000', parseDollars("$250,000"), 250_000);
check('"1,234.567" is rounded to the cent', parseDollars("1,234.567"), 1_234.57);
check("an empty amount is 0", parseDollars(""), 0);
check('"40" is 40%', parsePercent("40"), 40);
check('"12.5%" is 12.5%', parsePercent("12.5%"), 12.5);
check('"33 1/3" is one third', parsePercent("33 1/3"), 33 + 1 / 3);
check('"1/3" is one third', parsePercent("1/3"), (1 / 3) * 100);
check('"33 1/3" of 90,000 is 30,000', settle({ amount: 90_000, feePercent: parsePercent("33 1/3"), feeOn: "gross", costs: 0, deductions: [] }).fee, 30_000);
check("a percentage above 100 is held to 100", parsePercent("140"), 100);
check("an empty percentage is 0", parsePercent(""), 0);
check("a fraction over zero is 0, not an error", parsePercent("1/0"), 0);
check("sums are to the cent, without the drift of adding fractions", sumDollars([0.1, 0.2, 1_000.01]), 1_000.31);

if (failures > 0) {
  console.error(`\n${failures} check${failures === 1 ? "" : "s"} failed.`);
  process.exit(1);
}
console.log("\nThe settlement arithmetic checks out.");
