// Time on desk, server side: working out when each stage of a case began. Clio keeps the stage a
// matter is at and no history of the ones before, so the dates are read from the record by a model
// and checked here before anything is shown.

import { z } from "zod";
import { byRef, type CaseFile } from "@/features/cases/schema";
import { getCaseFile } from "@/features/cases/server";
import { KIND_WORD } from "@/features/cases/words";
import { extract } from "@/server/llm";
import { supabase } from "@/server/supabase";
import type { StageStart } from "./schema";

const MODEL = "claude-sonnet-5-5";

const StageDates = z.object({
  stages: z.array(
    z.object({
      stage: z.string().describe("The stage's name, exactly as given"),
      ref: z.string().describe('The ref of the one entry that shows this stage beginning, e.g. "N12"; empty string when no entry shows it'),
      date: z.string().describe("That entry's date, YYYY-MM-DD; empty string when no entry shows the stage beginning"),
    }),
  ),
});

const SYSTEM = `You read the index of a personal injury matter from a law firm's case management system: one line per entry, with its ref, its kind, its date and its title. The system records the stage the matter is at now and keeps no history of earlier stages.

For each stage in the firm's ordered list, find the entry that shows the work of that stage beginning, and give that entry's ref and date.

- Use only the entries listed. Cite a ref exactly as written.
- A stage begins with the earliest entry that shows its work under way, not with a later one that mentions it.
- The stages happen in the order given, so their dates never go backwards.
- A stage after the one the matter is at now has not begun: give empty strings.
- When no entry shows a stage beginning, give empty strings. Do not guess.
- Return every stage once, in the order given.`;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const plain = (text: string) => text.trim().toLowerCase();

/** The index the model reads: the dated entries, oldest first, by title only. */
function indexOf(file: CaseFile) {
  return file.entries
    .filter((entry) => DAY.test(entry.date) && entry.kind !== "field" && entry.kind !== "contact")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => `${entry.ref} | ${KIND_WORD[entry.kind]} | ${entry.date} | ${entry.title.replace(/\s+/g, " ").trim()}`)
    .join("\n");
}

/**
 * What the model returned, held to the file: one start per stage in the firm's order; a ref must be
 * an entry of the file and the date is that entry's own; a stage after the current one has not
 * begun; a date earlier than a stage before it is dropped. What fails is left blank, not repaired.
 */
export function checkStages(file: CaseFile, found: z.infer<typeof StageDates>["stages"]): StageStart[] {
  const entries = byRef(file);
  const current = file.stages.findIndex((stage) => plain(stage) === plain(file.stage));
  let latest = "";
  return file.stages.map((stage, index) => {
    const blank = { stage, date: "", ref: "" };
    const answer = found.find((item) => plain(item.stage) === plain(stage));
    const ref = answer?.ref.trim().toUpperCase() ?? "";
    const entry = entries.get(ref);
    if (!entry || !DAY.test(entry.date)) return blank;
    if (current >= 0 && index > current) return blank;
    if (entry.date < latest) return blank;
    latest = entry.date;
    return { stage, date: entry.date, ref };
  });
}

/** The cached answer for this state of the file, or null. A missing table is the same as nothing cached. */
async function cached(matterId: number, fingerprint: string): Promise<StageStart[] | null> {
  try {
    const { data, error } = await supabase()
      .from("case_extras")
      .select("fingerprint, value")
      .eq("matter_id", matterId)
      .eq("kind", "stages")
      .maybeSingle();
    if (error || !data || data.fingerprint !== fingerprint || !Array.isArray(data.value)) return null;
    return data.value as StageStart[];
  } catch {
    return null;
  }
}

async function keep(matterId: number, fingerprint: string, value: StageStart[]) {
  try {
    await supabase()
      .from("case_extras")
      .upsert({ matter_id: matterId, kind: "stages", fingerprint, value, created_at: new Date().toISOString() }, { onConflict: "matter_id,kind" });
  } catch {
    // Not kept: the next request works it out again.
  }
}

/** When each stage of a case began and the entry that shows it, in the firm's order. One model call, kept until Clio changes. */
export async function stageDates(matterId: number, signal?: AbortSignal): Promise<StageStart[]> {
  const file = await getCaseFile(matterId);
  if (!file) throw new Error("This case has not been read from Clio yet.");
  if (file.stages.length === 0) return [];
  const before = await cached(matterId, file.fingerprint);
  if (before) return before;

  const { data } = await extract(StageDates, {
    model: MODEL,
    system: SYSTEM,
    maxTokens: 8000,
    signal,
    prompt: `The firm's stages, in order:\n${file.stages.map((stage, index) => `${index + 1}. ${stage}`).join("\n")}\n\nThe matter is now at: ${file.stage || "not recorded"}\n\nEntries (ref | kind | date | title), oldest first:\n${indexOf(file)}`,
  });
  const starts = checkStages(file, data.stages);
  await keep(matterId, file.fingerprint, starts);
  return starts;
}
