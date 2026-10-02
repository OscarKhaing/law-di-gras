import { getCaseFile } from "@/features/cases/server";
import { supabase } from "@/server/supabase";
import type { CheckedBrief, StoredBrief } from "./schema";

/** The latest brief written for a case, or null when none has been written. Never calls a model. */
export async function getBrief(matterId: number): Promise<StoredBrief | null> {
  const [file, { data, error }] = await Promise.all([
    getCaseFile(matterId),
    supabase()
      .from("briefs")
      .select("brief, fingerprint, model, input_tokens, output_tokens, created_at")
      .eq("matter_id", matterId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (error) throw error;
  if (!data) return null;
  return {
    brief: data.brief as CheckedBrief,
    fingerprint: data.fingerprint,
    current: file?.fingerprint === data.fingerprint,
    model: data.model,
    usage: { inputTokens: data.input_tokens, outputTokens: data.output_tokens },
    createdAt: data.created_at,
  };
}

/** Write the brief for a case from its file and document digests, check it, and store it. Lane 1 builds this next. */
export async function buildBrief(matterId: number): Promise<StoredBrief> {
  throw new Error(`Writing the brief for case ${matterId} is not built yet.`);
}
