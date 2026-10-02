"use client";

import { overdue, upcoming, type CaseFile } from "@/features/cases/schema";
import { PARTIES, partyOf, type Parties, type Party } from "@/features/matters/schema";
import { compactDays, daysUntil, formatDate } from "@/lib/calc";
import { cn } from "@/lib/utils";
import type { CheckedBrief, CheckedEvidence } from "./schema";
import { CitationChips } from "./citation-chip";
import { Empty, Section } from "./section";
import { useFirst } from "./show-all";

/** How soon tasks ahead count as "due soon" here. */
const AHEAD_DAYS = 14;

type Item = {
  key: string;
  party: Party;
  what: string;
  who: string;
  /** Sorts within a group: overdue first (most late first), then waiting (longest first), then due, then to decide. */
  rank: number;
  status: { tone: "danger" | "calm"; text: string };
  evidence: CheckedEvidence[];
};

/** Everything the case is waiting on, from tasks in Clio and the brief, each with who holds the next step. */
function itemsOf(file: CaseFile, brief: CheckedBrief, parties: Parties, today: string): Item[] {
  const items: Item[] = [];
  for (const task of overdue(file, today)) {
    const late = -(daysUntil(task.date, today) ?? 0);
    items.push({
      key: task.ref,
      party: partyOf(task.title, parties),
      what: task.title || "Untitled task",
      who: task.people.join(", "),
      rank: 0 - late / 10_000,
      status: { tone: "danger", text: `Overdue ${compactDays(late)}` },
      evidence: [{ source: task.ref, quote: "", found: true }],
    });
  }
  const ahead = new Date(`${today}T00:00:00Z`);
  ahead.setUTCDate(ahead.getUTCDate() + AHEAD_DAYS);
  for (const task of upcoming(file, today, ahead.toISOString().slice(0, 10)).filter((entry) => entry.kind === "task")) {
    const days = daysUntil(task.date, today) ?? 0;
    items.push({
      key: task.ref,
      party: partyOf(task.title, parties),
      what: task.title || "Untitled task",
      who: task.people.join(", "),
      rank: 2 + days / 10_000,
      status: { tone: "calm", text: days === 0 ? "Due today" : `Due in ${compactDays(days)}` },
      evidence: [{ source: task.ref, quote: "", found: true }],
    });
  }
  brief.waiting.forEach((item, index) => {
    const waited = item.since ? -(daysUntil(item.since, today) ?? 0) : null;
    const asked = item.asked > 1 ? `, asked ${item.asked} times` : item.asked === 1 ? ", asked once" : "";
    items.push({
      key: `waiting-${index}`,
      party: partyOf(`${item.on} ${item.what}`, parties),
      what: item.what,
      who: item.on,
      rank: 1 - (waited ?? 0) / 100_000,
      status: { tone: "calm", text: waited !== null && waited >= 0 ? `Waiting ${compactDays(waited)}${asked}` : `Waiting${asked}` },
      evidence: item.evidence,
    });
  });
  brief.decisions.forEach((item, index) => {
    const days = item.by ? daysUntil(item.by, today) : null;
    items.push({
      key: `decide-${index}`,
      party: "Firm",
      what: item.what,
      who: "The attorney",
      rank: days !== null && days < 0 ? 0 : 3,
      status:
        days === null
          ? { tone: "calm", text: "To decide" }
          : days < 0
            ? { tone: "danger", text: `Decision overdue ${compactDays(days)}` }
            : { tone: "calm", text: `Decide by ${formatDate(item.by)}` },
      evidence: item.evidence,
    });
  });
  return items.sort((a, b) => a.rank - b.rank);
}

const EMPTY: Record<Party, string> = {
  Firm: "Nothing is overdue or waiting on the firm.",
  Provider: "The firm is not waiting on any provider.",
  Insurer: "The firm is not waiting on the insurer or the other side.",
  Client: "The firm is not waiting on the client.",
};

/** Overdue and waiting on, grouped by who holds the next step: firm, provider, insurer, client. */
export function WaitingOn({ file, brief, parties, today }: { file: CaseFile; brief: CheckedBrief; parties: Parties; today: string }) {
  const items = itemsOf(file, brief, parties, today);
  return (
    <Section id="waiting-on" label="Overdue and waiting on">
      <div className="flex flex-col divide-y border-y">
        {PARTIES.map((party) => (
          <Group key={party} party={party} items={items.filter((item) => item.party === party)} />
        ))}
      </div>
    </Section>
  );
}

function Group({ party, items }: { party: Party; items: Item[] }) {
  const { shown, more } = useFirst(items);
  const late = items.filter((item) => item.status.tone === "danger").length;
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:gap-6">
      <h3 className="w-24 shrink-0 text-sm font-medium">
        {party}
        <span className="ml-1.5 font-mono text-xs text-muted-foreground">{items.length}</span>
        {late > 0 && <span className="block font-mono text-xs font-normal text-danger">{late} overdue</span>}
      </h3>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {items.length === 0 ? (
          <Empty>{EMPTY[party]}</Empty>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {shown.map((item) => (
              <li key={item.key} className="flex flex-col gap-0.5">
                <p className="leading-snug">
                  {item.what} <CitationChips evidence={item.evidence} />
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className={cn("font-mono", item.status.tone === "danger" && "text-danger")}>{item.status.text}</span>
                  {item.who && <span>, {item.who}</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
        {more}
      </div>
    </div>
  );
}
