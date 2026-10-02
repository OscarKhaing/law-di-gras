// A matter as one row of the case table, and who holds the next step on something. Browser-safe.
// Everything here is computed in code from the case file read from Clio and the stored brief.

import type { CheckedBrief } from "@/features/brief/schema";
import { overdue, type CaseFile, type Entry } from "@/features/cases/schema";
import { daysUntil } from "@/lib/calc";

export const PARTIES = ["Firm", "Provider", "Insurer", "Client"] as const;
export type Party = (typeof PARTIES)[number];

type Known = { ref: string; name: string; keys: string[] };
/** The people a line of text can be about, with the short forms the file writes them in. */
export type Parties = { client: string[]; providers: Known[]; insurers: Known[] };

const PROVIDER_ROLE = /provider|treating|hospital|physician|therap|chiro|radiolog|imaging|surg|neurolog|physiatr|orthop/i;
const INSURER_ROLE = /insur|carrier|claims|adjust|adverse|defen[cs]|counsel|self-insured/i;

/** A name and its short forms, lower case: "mcculloch orthopaedic surgical services, pllc", "mcculloch", "mcculloch orthopaedic". */
export function keysOf(entry: Entry) {
  const name = entry.title.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const words = name.split(" ").filter(Boolean);
  const keys = [name, words.slice(0, 2).join(" ")];
  if (words[0] && words[0].length >= 5) keys.push(words[0]);
  if (entry.facts.isCompany !== true && words.length > 1 && words.at(-1)!.length >= 3) keys.push(words.at(-1)!);
  return [...new Set(keys.filter((key) => key.length >= 3))];
}

/** The client, the treating providers and the other side (insurer, adjuster, defendant), from the case file and the brief. */
export function partiesOf(file: CaseFile, brief: CheckedBrief | null): Parties {
  const contacts = file.entries.filter((entry) => entry.kind === "contact" && entry.facts.isClient !== true);
  const treatingRefs = new Set((brief?.people ?? []).filter((person) => person.treating).map((person) => person.contact));
  const isProvider = (entry: Entry) =>
    treatingRefs.size > 0 ? treatingRefs.has(entry.ref) : PROVIDER_ROLE.test(String(entry.facts.role ?? entry.text));
  const known = (entry: Entry): Known => ({ ref: entry.ref, name: entry.title, keys: keysOf(entry) });
  const clientWords = file.client.name.toLowerCase().split(/\s+/).filter((word) => word.length >= 3);
  return {
    client: [file.client.name.toLowerCase(), ...clientWords.slice(-1)],
    providers: contacts.filter(isProvider).map(known),
    insurers: contacts
      .filter((entry) => !isProvider(entry) && INSURER_ROLE.test(String(entry.facts.role ?? entry.text)))
      .map(known),
  };
}

/** Who a line of text puts the next step on. Anything that names nobody outside the firm is the firm's. */
export function partyOf(text: string, parties: Parties): Party {
  const said = ` ${text.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ")} `;
  const names = (list: Known[]) => list.some((known) => known.keys.some((key) => said.includes(key)));
  if (names(parties.providers)) return "Provider";
  if (names(parties.insurers) || /\b(adjuster|insurer|carrier|defen[cs]e|counsel)\b/.test(said)) return "Insurer";
  if (/\bclient\b/.test(said) || parties.client.some((key) => said.includes(key))) return "Client";
  return "Firm";
}

/** The Clio custom field whose name matches, or null. */
export function field(file: CaseFile, name: RegExp): Entry | null {
  return file.entries.find((entry) => entry.kind === "field" && name.test(entry.title)) ?? null;
}

/** The date of injury: Clio's own field when there is one, otherwise the brief's incident date. */
export function injuryDate(file: CaseFile, brief: CheckedBrief | null) {
  const stated = field(file, /date of (incident|injury|accident|loss)/i)?.text.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}/.test(stated)) return stated.slice(0, 10);
  return brief?.incident.date ?? "";
}

/** True when the file shows the limitations deadline as dealt with: a statute-of-limitations task marked complete. */
export function solSatisfied(file: CaseFile) {
  return file.entries.some(
    (entry) => entry.kind === "task" && /limitation|statute/i.test(entry.title) && entry.facts.status === "complete",
  );
}

const amountsOf = (brief: CheckedBrief | null, kind: string) =>
  (brief?.money ?? []).filter((figure) => figure.kind.trim().toLowerCase() === kind && figure.amount > 0);

/** Medical specials: the largest specials figure in the brief, or null. */
export function specialsOf(brief: CheckedBrief | null) {
  const figures = amountsOf(brief, "specials");
  return figures.length ? Math.max(...figures.map((figure) => figure.amount)) : null;
}

/** The coverage layers the brief names (e.g. bodily injury, UM/UIM), each with its limit. */
export function coverageLayers(brief: CheckedBrief | null) {
  return amountsOf(brief, "coverage");
}

/** The coverage available in all: the sum of the layers' limits, or null when the brief names none. */
export function totalLimits(brief: CheckedBrief | null) {
  const layers = coverageLayers(brief);
  return layers.length ? layers.reduce((sum, layer) => sum + layer.amount, 0) : null;
}

/** The latest day anything happened on the case, up to today. */
export function lastActivity(file: CaseFile, today: string) {
  return file.entries
    .filter((entry) => entry.kind !== "field" && entry.kind !== "contact" && entry.date && entry.date <= today)
    .reduce((latest, entry) => (entry.date > latest ? entry.date : latest), "");
}

export type MatterRow = {
  matterId: number;
  number: string;
  client: string;
  description: string;
  stage: string;
  /** False for a matter in Clio that has not been read into Case Desk: every figure below is empty. */
  read: boolean;
  syncedAt: string | null;
  injuryDate: string;
  sol: string;
  solDays: number | null;
  solSatisfied: boolean;
  specials: number | null;
  limits: number | null;
  waitingOn: Party[];
  overdue: number;
  lastActivity: string;
};

/** One row of the table for a matter that has been read. */
export function matterRow(file: CaseFile, brief: CheckedBrief | null, syncedAt: string | null, today: string): MatterRow {
  const parties = partiesOf(file, brief);
  const late = overdue(file, today);
  const waiting = new Set<Party>();
  for (const item of brief?.waiting ?? []) waiting.add(partyOf(`${item.on} ${item.what}`, parties));
  for (const task of late) waiting.add(partyOf(task.title, parties));
  if ((brief?.decisions ?? []).length > 0) waiting.add("Firm");
  return {
    matterId: file.matterId,
    number: file.number,
    client: file.client.name,
    description: file.description,
    stage: file.stage,
    read: true,
    syncedAt,
    injuryDate: injuryDate(file, brief),
    sol: file.limitationDate,
    solDays: daysUntil(file.limitationDate, today),
    solSatisfied: solSatisfied(file),
    specials: specialsOf(brief),
    limits: totalLimits(brief),
    waitingOn: PARTIES.filter((party) => waiting.has(party)),
    overdue: late.length,
    lastActivity: lastActivity(file, today),
  };
}

export const FILTERS = [
  { id: "all", label: "All matters" },
  { id: "overdue", label: "Overdue" },
  { id: "provider", label: "Waiting on provider" },
  { id: "insurer", label: "Waiting on insurer" },
  { id: "limits", label: "Near policy limits" },
  { id: "sol", label: "SOL within 90 days" },
] as const;
export type FilterId = (typeof FILTERS)[number]["id"];

/** Specials at 80% of the coverage or more count as near the limits. */
const NEAR_LIMITS = 0.8;

export function matches(row: MatterRow, filter: FilterId) {
  switch (filter) {
    case "all":
      return true;
    case "overdue":
      return row.overdue > 0;
    case "provider":
      return row.waitingOn.includes("Provider");
    case "insurer":
      return row.waitingOn.includes("Insurer");
    case "limits":
      return row.specials !== null && row.limits !== null && row.specials >= row.limits * NEAR_LIMITS;
    case "sol":
      return !row.solSatisfied && row.solDays !== null && row.solDays <= 90;
  }
}

export function isFilter(value: string | null | undefined): value is FilterId {
  return FILTERS.some((filter) => filter.id === value);
}
