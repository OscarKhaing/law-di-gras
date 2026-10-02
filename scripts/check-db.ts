// Check that every table in supabase/schema.sql exists: `pnpm -s script scripts/check-db.ts`.
import { supabase } from "@/server/supabase";

const TABLES = ["clio_connection", "case_files", "document_digests", "briefs", "visits", "shares", "share_events"];

async function main() {
  let missing = 0;
  for (const table of TABLES) {
    // A plain select, because a HEAD request (count only) hides the "table not found" error.
    const { data, error } = await supabase().from(table).select("*").limit(1);
    if (error) missing += 1;
    console.log(error ? `MISSING  ${table}: ${error.message}` : `ok       ${table} (${data.length ? "has rows" : "empty"})`);
  }
  if (missing) console.log("\nPaste supabase/schema.sql into the Supabase SQL editor and run it.");
  process.exit(missing ? 1 : 0);
}

main();
