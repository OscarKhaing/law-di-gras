import { supabase } from "@/server/supabase";
import type { CaseFile, CaseSummary } from "./schema";

// Reading cases. A case is read from Clio by `syncCase` and kept in the `case_files` table, so the
// screens never call Clio themselves.

/** The cases that have been read from Clio, most recently read first. */
export async function listCases(): Promise<CaseSummary[]> {
  const { data, error } = await supabase()
    .from("case_files")
    .select("file, synced_at")
    .order("synced_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const file = row.file as CaseFile;
    return {
      matterId: file.matterId,
      number: file.number,
      client: file.client.name,
      description: file.description,
      stage: file.stage,
      stages: file.stages,
      syncedAt: row.synced_at as string,
    };
  });
}

/** A case as last read from Clio, or null when it has not been read yet. */
export async function getCaseFile(matterId: number): Promise<CaseFile | null> {
  const { data, error } = await supabase().from("case_files").select("file").eq("matter_id", matterId).maybeSingle();
  if (error) throw error;
  return (data?.file as CaseFile | undefined) ?? null;
}

/** Read every part of a matter from Clio and store it as a CaseFile. Lane 1 builds this next. */
export async function syncCase(matterId: number): Promise<CaseFile> {
  throw new Error(`Reading case ${matterId} from Clio is not built yet.`);
}
