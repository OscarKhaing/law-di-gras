// Write the brief for a case that has been read from Clio, and report how its evidence checked out.
// `pnpm -s script scripts/build-brief.ts [matterId] [--print]`; without an id, the first case stored.
import { buildBrief } from "@/features/brief/server";
import { listCases } from "@/features/cases/server";

async function main() {
  const args = process.argv.slice(2);
  const matterId = Number(args.find((arg) => /^\d+$/.test(arg))) || (await listCases())[0]?.matterId;
  if (!matterId) throw new Error("No case has been read from Clio yet. Run scripts/sync-case.ts first.");
  const started = Date.now();
  const { brief, model, usage, tally } = await buildBrief(matterId);
  if (args.includes("--print")) console.log(JSON.stringify(brief, null, 2));
  console.log(`\n${brief.bottomLine.text}\n`);
  console.log(`Written by ${model} in ${Math.round((Date.now() - started) / 1000)} s: ${usage.inputTokens} tokens in, ${usage.outputTokens} out`);
  console.log(
    `${tally.sources - tally.dropped} of ${tally.sources} sources exist in the file; ${tally.quotesFound} of ${tally.quotes} quotes found word for word in their source`,
  );
  console.log(
    `${brief.moments.length} moments, ${brief.money.length} figures, ${brief.waiting.length} waiting, ${brief.decisions.length} to decide, ${brief.flags.length} flags, ${brief.injuries.length} injuries, ${brief.people.length} people`,
  );
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
