// Print what is stored for the first case: `pnpm -s script scripts/peek.ts` for a summary,
// `... peek.ts file` for the whole case file, `... peek.ts brief` for the stored brief,
// `... peek.ts entries note` for every entry of one kind.
import { getBrief } from "@/features/brief/server";
import { getCaseFile, listCases } from "@/features/cases/server";

async function main() {
  const [what, kind] = process.argv.slice(2);
  const [first] = await listCases();
  if (!first) return console.log("No case has been read from Clio yet.");
  const file = (await getCaseFile(first.matterId))!;
  const stored = await getBrief(first.matterId);
  if (what === "file") return console.log(JSON.stringify(file, null, 2));
  if (what === "brief") return console.log(stored ? JSON.stringify(stored, null, 2) : "No brief has been written yet.");
  if (what === "entries") {
    return console.log(JSON.stringify(file.entries.filter((entry) => !kind || entry.kind === kind), null, 2));
  }
  const counts: Record<string, number> = {};
  for (const entry of file.entries) counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
  console.log(`Case ${file.matterId} (${file.number}), stage ${file.stage}, read ${file.syncedAt}`);
  console.log("Entries:", counts);
  console.log(stored ? `Brief: written ${stored.createdAt} by ${stored.model}, current: ${stored.current}` : "Brief: not written yet");
}

main();
