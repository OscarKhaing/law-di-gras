"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { SolCountdown } from "@/components/sol-countdown";
import type { CaseFile, Entry } from "@/features/cases/schema";
import { field, keysOf } from "@/features/matters/schema";
import { SendUpdateDialog } from "@/features/shares/send-update-dialog";
import type { ProviderUpdate, ShareStatus } from "@/features/shares/schema";
import { daysUntil, formatDate, usd } from "@/lib/calc";
import type { CheckedBrief } from "./schema";
import { CitationChips } from "./citation-chip";
import { SectionLabel } from "./section";
import { useFirst } from "./show-all";

export type UpdateHead = Pick<ProviderUpdate, "firm" | "contactLine" | "patient" | "provider" | "stage" | "stages">;

const ADJUSTER_ROLE = /adjust|claims/i;
const TREATMENT = /treat|therap|chiro|appointment|visit|physio|session|surgery|arthroscop|consult/i;

/** "SIR068120 (Metro-North …)" as "••••8120": enough to match a letter, not enough to copy. */
function masked(text: string) {
  const token = text.trim().split(/[\s(]/)[0] ?? "";
  return token.length > 4 ? `••••${token.slice(-4)}` : token;
}

const firstSentence = (text: string) => (text.split(/(?<=\.)\s/)[0] ?? text).trim();

/** What the firm holds of a provider's bills: the matter's charges that name the provider, added up in code. */
function billed(file: CaseFile, provider: Entry) {
  const keys = keysOf(provider);
  const charges = file.entries.filter(
    (entry) =>
      entry.kind === "expense" &&
      entry.facts.billable === false &&
      keys.some((key) => `${entry.title} ${entry.text}`.toLowerCase().includes(key)),
  );
  return { amount: charges.reduce((sum, entry) => sum + (Number(entry.facts.amount) || 0), 0), charges };
}

/** Sent, viewed or replied, from the latest update shared with this office. */
function linkStatus(shares: ShareStatus[], ref: string, today: string) {
  const latest = shares.filter((share) => share.contactRef === ref).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
  if (!latest) return null;
  if (latest.revoked) return "Withdrawn";
  if (latest.expiresAt.slice(0, 10) < today) return "Expired";
  if (latest.replies.length > 0) return "Replied";
  if (latest.opens > 0) return "Viewed";
  return "Sent";
}

/** The facts beside the brief: coverage, providers, key dates, team. Each one from Clio, worked out in code. */
export function FactsPanel({
  file,
  brief,
  shares,
  heads,
  injury,
  solDays,
  solMet,
  today,
}: {
  file: CaseFile;
  brief: CheckedBrief;
  shares: ShareStatus[];
  heads: Record<string, UpdateHead>;
  injury: string;
  solDays: number | null;
  solMet: boolean;
  today: string;
}) {
  const contacts = new Map(file.entries.filter((entry) => entry.kind === "contact").map((entry) => [entry.ref, entry]));
  const carrier = field(file, /insurance carrier|carrier|insurer/i);
  const policy = field(file, /policy (number|no)/i);
  const claim = field(file, /claim (number|no)/i);
  const limitsField = field(file, /policy limits?$/i);
  const layers = brief.money.filter((figure) => figure.kind.trim().toLowerCase() === "coverage" && figure.amount > 0);
  const adjusters = [...contacts.values()].filter(
    (entry) => entry.facts.isClient !== true && ADJUSTER_ROLE.test(String(entry.facts.role ?? entry.text)),
  );

  const providers = brief.people
    .filter((person) => person.treating)
    .map((person) => ({ person, entry: contacts.get(person.contact) ?? null }))
    .filter((item): item is { person: (typeof brief.people)[number]; entry: Entry } => item.entry !== null);
  const providerKeys = providers.flatMap(({ entry }) => keysOf(entry));
  const lastTreatment = file.entries
    .filter(
      (entry) =>
        (entry.kind === "event" || entry.kind === "call" || entry.kind === "note") &&
        entry.date &&
        entry.date <= today &&
        entry.kind === "event" &&
        (TREATMENT.test(entry.title) || providerKeys.some((key) => entry.title.toLowerCase().includes(key))),
    )
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const demandSent = file.entries
    .filter((entry) => (entry.kind === "email" || entry.kind === "note") && /demand (package|letter)/i.test(entry.title))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const responseDue = file.entries
    .filter((entry) => (entry.kind === "task" || entry.kind === "event") && entry.date >= today && /respon|reply|answer/i.test(entry.title))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const assigned = [...new Set(file.entries.filter((entry) => entry.kind === "task").flatMap((entry) => entry.people))];

  const dated = (entry: Entry | undefined) =>
    entry ? (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono">{formatDate(entry.date)}</span>
        <CitationChips evidence={[{ source: entry.ref, quote: "", found: true }]} />
      </span>
    ) : (
      <Missing />
    );

  return (
    <aside aria-label="Facts" className="flex flex-col gap-6 rounded-lg border bg-card p-4 text-sm">
      <Block id="facts-coverage" label="Coverage">
        <Fact label="Carrier">
          {carrier ? (
            <span className="flex flex-col gap-1">
              {firstSentence(carrier.text)}
              <CitationChips evidence={[{ source: carrier.ref, quote: "", found: true }]} />
            </span>
          ) : (
            <Missing />
          )}
        </Fact>
        <Fact label={policy ? "Policy no." : "Claim no."}>
          {policy || claim ? <span className="font-mono">{masked((policy ?? claim)!.text)}</span> : <Missing />}
        </Fact>
        <Fact label="Limits">
          {layers.length > 0 ? (
            <span className="flex flex-col gap-1">
              {layers.map((layer, index) => (
                <span key={index} className="flex flex-col">
                  <span className="font-mono">{usd(layer.amount)}</span>
                  <span className="text-xs text-muted-foreground">{layer.label}</span>
                </span>
              ))}
            </span>
          ) : limitsField ? (
            <span className="whitespace-pre-line">{limitsField.text}</span>
          ) : (
            <Missing />
          )}
        </Fact>
        <Fact label="Adjuster">
          {adjusters.length > 0 ? (
            <span className="flex flex-col gap-1.5">
              {adjusters.map((entry) => (
                <span key={entry.ref} className="flex flex-col">
                  <span>{entry.title}</span>
                  {typeof entry.facts.email === "string" && entry.facts.email && (
                    <a href={`mailto:${entry.facts.email}`} className="truncate text-xs text-primary underline-offset-2 hover:underline">
                      {entry.facts.email}
                    </a>
                  )}
                  {typeof entry.facts.phone === "string" && entry.facts.phone && (
                    <a href={`tel:${entry.facts.phone}`} className="font-mono text-xs text-primary underline-offset-2 hover:underline">
                      {entry.facts.phone}
                    </a>
                  )}
                </span>
              ))}
            </span>
          ) : (
            <Missing />
          )}
        </Fact>
      </Block>

      <Providers file={file} providers={providers} shares={shares} heads={heads} today={today} />

      <Block id="facts-dates" label="Key dates">
        <Fact label="Injury">{injury ? <span className="font-mono">{formatDate(injury)}</span> : <Missing />}</Fact>
        <Fact label="SOL">
          <SolCountdown sol={file.limitationDate} days={solDays} satisfied={solMet} withDate />
        </Fact>
        <Fact label="Last treatment">{dated(lastTreatment)}</Fact>
        <Fact label="Demand sent">{dated(demandSent)}</Fact>
        <Fact label="Response due">
          {responseDue ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono">{formatDate(responseDue.date)}</span>
              <span className="font-mono text-xs text-muted-foreground">in {daysUntil(responseDue.date, today)}d</span>
              <CitationChips evidence={[{ source: responseDue.ref, quote: "", found: true }]} />
            </span>
          ) : (
            <Missing />
          )}
        </Fact>
      </Block>

      <Block id="facts-team" label="Team">
        <Fact label="Firm">{file.firm.name || <Missing />}</Fact>
        <Fact label="Clio user">{file.firm.user || <Missing />}</Fact>
        <Fact label="Tasks assigned to">{assigned.length > 0 ? assigned.join(", ") : <Missing />}</Fact>
      </Block>
    </aside>
  );
}

function Providers({
  file,
  providers,
  shares,
  heads,
  today,
}: {
  file: CaseFile;
  providers: { person: CheckedBrief["people"][number]; entry: Entry }[];
  shares: ShareStatus[];
  heads: Record<string, UpdateHead>;
  today: string;
}) {
  // Offices the firm is still waiting on come first: they are the ones an update is for.
  const ordered = [...providers.filter(({ person }) => person.owes), ...providers.filter(({ person }) => !person.owes)];
  const { shown, more } = useFirst(ordered);
  return (
    <Block id="facts-providers" label="Providers">
      {ordered.length === 0 ? (
        <Missing>The brief names no treating providers.</Missing>
      ) : (
        <ul className="flex flex-col divide-y">
          {shown.map(({ person, entry }) => {
            const bill = billed(file, entry);
            const records = person.owes ? "Outstanding" : person.holds ? "Received" : null;
            const status = linkStatus(shares, entry.ref, today);
            const head = heads[entry.ref];
            return (
              <li key={entry.ref} className="flex flex-col gap-1.5 py-2.5 first:pt-0">
                <span className="font-medium leading-snug">{entry.title}</span>
                <span className="text-xs text-muted-foreground first-letter:uppercase">
                  {person.role || String(entry.facts.role ?? "")}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {bill.charges.length ? <span className="font-mono">{usd(bill.amount)}</span> : <span className="text-muted-foreground">Bills not in Clio</span>}
                  {records && <Badge variant={records === "Outstanding" ? "secondary" : "outline"}>Records {records.toLowerCase()}</Badge>}
                </span>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {status ? (
                      <>
                        Link <span className="font-medium text-foreground">{status.toLowerCase()}</span>
                      </>
                    ) : (
                      "No update sent"
                    )}
                  </span>
                  {head && <SendUpdateDialog matterId={file.matterId} contactRef={entry.ref} head={head} />}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {more}
    </Block>
  );
}

function Block({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5">
      <SectionLabel id={id}>{label}</SectionLabel>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

function Missing({ children = "Not in the file" }: { children?: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
