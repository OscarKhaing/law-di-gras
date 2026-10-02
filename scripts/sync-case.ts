// Read a matter from Clio into Case Desk and print what was read.
// `pnpm -s script scripts/sync-case.ts [matterId]`; without an id, the first matter in the account.
import { listMatters, syncCase } from "@/features/cases/server";

async function main() {
  let matterId = Number(process.argv[2]);
  if (!matterId) {
    const { connected, matters } = await listMatters();
    if (!connected) throw new Error("Clio is not connected. Open /api/clio/connect in the app first.");
    if (matters.length === 0) throw new Error("The Clio account has no matters.");
    matterId = matters[0].matterId;
  }
  const started = Date.now();
  const file = await syncCase(matterId);
  const counts: Record<string, number> = {};
  for (const entry of file.entries) counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
  console.log(`Read case ${file.matterId} (${file.number}) in ${Math.round((Date.now() - started) / 1000)} s`);
  console.log(`Stage ${file.stage} of ${file.stages.length}; fingerprint ${file.fingerprint}`);
  console.log(counts);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
