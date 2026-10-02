import { getBrief } from "@/features/brief/server";
import { getCaseFile, listCases, listMatters } from "@/features/cases/server";
import { todayIso } from "@/lib/calc";
import { matterRow, type MatterRow } from "./schema";

// The rows behind the case table and the sidebar. Reading them never calls a model.

/** Every matter that has been read into Case Desk, from the database only (no Clio call): for the sidebar and search. */
export async function storedMatterRows(): Promise<MatterRow[]> {
  const today = todayIso();
  // A matter id of 0 or below is not a Clio matter (a teammate's test copy); the case page does not open those either.
  const cases = (await listCases()).filter((summary) => summary.matterId > 0);
  const rows = await Promise.all(
    cases.map(async (summary) => {
      const [file, stored] = await Promise.all([getCaseFile(summary.matterId), getBrief(summary.matterId)]);
      return file ? matterRow(file, stored?.brief ?? null, summary.syncedAt, today) : null;
    }),
  );
  return rows.filter((row): row is MatterRow => row !== null);
}

/** Every matter in the connected Clio account (read live), with the figures of those already read. */
export async function listMatterRows(): Promise<{ connected: boolean; rows: MatterRow[] }> {
  const [{ connected, matters }, stored] = await Promise.all([listMatters(), storedMatterRows()]);
  const byId = new Map(stored.map((row) => [row.matterId, row]));
  const rows = matters.map(
    (matter): MatterRow =>
      byId.get(matter.matterId) ?? {
        matterId: matter.matterId,
        number: matter.number,
        client: matter.client,
        description: matter.description,
        stage: matter.stage,
        read: false,
        syncedAt: null,
        injuryDate: "",
        sol: "",
        solDays: null,
        solSatisfied: false,
        specials: null,
        limits: null,
        waitingOn: [],
        overdue: 0,
        lastActivity: "",
      },
  );
  return { connected, rows };
}
