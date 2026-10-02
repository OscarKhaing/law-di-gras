"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { panelClass } from "@/components/panel";
import { StatusPill } from "@/components/status";
import { buttonVariants } from "@/components/ui/button";
import { byRef, parseSource, shortDate, type CaseFile, type Entry } from "@/features/cases/schema";
import type { ShareStatus } from "@/features/shares/schema";
import { cn } from "@/lib/utils";
import type { CheckedBrief, SectionProps } from "./schema";
import { SourceLinks, useSource } from "./source-panel";

type Person = CheckedBrief["people"][number];
/** A person from the brief joined to their contact in Clio; `entry` is null when the contact is not there. */
type Joined = { person: Person; ref: string; entry: Entry | null };

/**
 * Treating providers, one ledger row each: what the office did, what the firm holds from it and is
 * still waiting for, the next calendar entry that names it and whether an update was shared and
 * opened. Then everyone else on the case, as a plainer ledger: who they are, what they did and anything
 * they still owe the firm.
 */
export function Providers({ file, stored, shares, today }: SectionProps) {
  const contacts = byRef(file);
  const people: Joined[] = stored.brief.people.map((person) => {
    const { ref } = parseSource(person.contact);
    const entry = contacts.get(ref);
    return { person, ref, entry: entry?.kind === "contact" ? entry : null };
  });
  // Offices the firm is still waiting on come first: they are the ones an update is for.
  const treating = [
    ...people.filter(({ person }) => person.treating && person.owes !== ""),
    ...people.filter(({ person }) => person.treating && person.owes === ""),
  ];
  const others = people.filter(({ person }) => !person.treating);

  return (
    <section aria-labelledby="treating-providers" className="space-y-8">
      <div className="space-y-3">
        <div className="space-y-1">
          <h2 id="treating-providers" className="font-heading text-xl font-semibold tracking-tight">
            Treating providers
          </h2>
          {treating.length > 0 && (
            <p className="max-w-prose text-sm text-muted-foreground">
              Offices the firm is still waiting on come first. An update goes to a provider only after you have
              checked it.
            </p>
          )}
        </div>
        {treating.length === 0 ? (
          <p className={cn(panelClass, "p-5 text-sm text-muted-foreground")}>The brief names no treating providers on this case.</p>
        ) : (
          <div className={cn(panelClass, "space-y-1 p-2")}>
            {treating.map((joined, index) => (
              <ProviderRow key={`${joined.ref}-${index}`} joined={joined} file={file} shares={shares} today={today} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 id="others-on-the-case" className="font-heading text-lg font-semibold tracking-tight">
          Others on the case
        </h3>
        {others.length === 0 ? (
          <p className={cn(panelClass, "p-5 text-sm text-muted-foreground")}>The brief names nobody else on this case.</p>
        ) : (
          <div className={cn(panelClass, "space-y-1 p-2")}>
            {others.map(({ person, ref, entry }, index) => (
              <div key={`${ref}-${index}`} className="grid gap-x-6 gap-y-1.5 rounded-lg bg-muted/50 px-4 py-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                <Who person={person} entry={entry} />
                <div className="space-y-1">
                  {person.did ? (
                    <p className="max-w-prose text-sm leading-relaxed">{person.did}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">The file does not say what they have done.</p>
                  )}
                  {person.owes && <Owed>Waiting for: {person.owes}</Owed>}
                  <Sources person={person} file={file} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ProviderRow({
  joined: { person, ref, entry },
  file,
  shares,
  today,
}: {
  joined: Joined;
  file: CaseFile;
  shares: ShareStatus[];
  today: string;
}) {
  const { openRef } = useSource();
  const visit = entry ? nextOnCalendar(file, entry, today) : null;
  const mine = shares
    .filter((share) => share.contactRef === ref)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const replies = mine
    .flatMap((share) => share.replies)
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="grid gap-x-6 gap-y-3 rounded-lg bg-muted/50 p-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
      <Who person={person} entry={entry} details />

      <div className="space-y-2">
        <Line label="Care given">
          {person.did ? <p className="max-w-prose leading-relaxed">{person.did}</p> : <Unsaid />}
        </Line>
        <Line label="On file">
          {person.holds ? <p className="max-w-prose leading-relaxed">{person.holds}</p> : <Unsaid />}
        </Line>
        <Line label="Waiting for">
          {person.owes ? (
            <Owed>{person.owes}</Owed>
          ) : (
            <p className="text-muted-foreground">Nothing outstanding from this office.</p>
          )}
        </Line>
        <Line label="Sources">
          <Sources person={person} file={file} />
        </Line>
        <Line label="On the calendar">
          {visit ? (
            <button
              type="button"
              onClick={() => openRef(visit.ref)}
              className="rounded-sm text-left underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {dayOf(visit.date, today)}, <span className="font-serif text-[15px]">{visit.title}</span>
              {typeof visit.facts.location === "string" && visit.facts.location !== "" && (
                <span className="text-muted-foreground"> at {visit.facts.location}</span>
              )}
            </button>
          ) : (
            <p className="text-muted-foreground">Nothing coming up with this office.</p>
          )}
        </Line>
        <Line label="Shared update">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
            <div className="space-y-1">
              <ShareStatusPill share={mine[0]} today={today} />
              <p className={cn("max-w-prose leading-relaxed", mine.length === 0 && "text-muted-foreground")}>
                {shareLine(mine[0], today)}
              </p>
            </div>
            {entry ? (
              <Link
                href={`/cases/${file.matterId}/providers/${ref}`}
                className={buttonVariants({ size: "sm", variant: person.owes ? "default" : "outline" })}
              >
                Prepare update
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">An update needs this contact in Clio first.</p>
            )}
          </div>
          {replies.map((reply, index) => (
            <p key={index} className="mt-2 max-w-prose border-l-2 border-marker bg-marker-soft px-2.5 py-1.5">
              <span className="block text-xs text-muted-foreground">
                From the provider, not yet in Clio ({dayAt(reply.at, today)}):
              </span>
              <span className="font-serif text-[15px] leading-snug">{reply.text}</span>
            </p>
          ))}
        </Line>
      </div>
    </div>
  );
}

/** The left column of a row: the name as Clio has it, in the serif face, and their part in the case. */
function Who({ person, entry, details = false }: { person: Person; entry: Entry | null; details?: boolean }) {
  const role = person.role || (entry ? String(entry.facts.role ?? entry.text) : "");
  const email = entry && typeof entry.facts.email === "string" ? entry.facts.email : "";
  const phone = entry && typeof entry.facts.phone === "string" ? entry.facts.phone : "";

  return (
    <div className="space-y-0.5">
      {entry ? (
        <p className="font-serif text-[17px] leading-snug font-medium text-pretty">{entry.title}</p>
      ) : (
        <p className="text-sm text-muted-foreground">This contact was not found in Clio.</p>
      )}
      {role && <p className="text-sm text-muted-foreground first-letter:uppercase">{role}</p>}
      {details && (email || phone) && (
        <p className="flex flex-col pt-1 text-xs text-muted-foreground">
          {email && (
            <a href={`mailto:${email}`} className="w-fit underline-offset-4 hover:text-foreground hover:underline">
              {email}
            </a>
          )}
          {phone && (
            <a href={`tel:${phone}`} className="w-fit underline-offset-4 hover:text-foreground hover:underline">
              {phone}
            </a>
          )}
        </p>
      )}
    </div>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-4 gap-y-0.5 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
      <p className="text-muted-foreground">{label}</p>
      <div>{children}</div>
    </div>
  );
}

/** Something the firm is still waiting for, marked because a person has to chase it. */
function Owed({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-prose border-l-2 border-mild bg-mild-soft px-2.5 py-1 text-sm leading-relaxed">{children}</p>
  );
}

function Unsaid() {
  return <p className="text-muted-foreground">The file does not say.</p>;
}

function Sources({ person, file }: { person: Person; file: CaseFile }) {
  const entries = byRef(file);
  if (!person.evidence.some((item) => entries.has(parseSource(item.source).ref))) {
    return <p className="text-xs text-muted-foreground">The brief gives no source for this.</p>;
  }
  return <SourceLinks evidence={person.evidence} />;
}

/**
 * The ways a calendar entry may name a contact, lower-cased: the name as Clio has it; the name
 * without a title or trailing credentials; for a long name, its first two words (an office is
 * rarely written out in full); for a person, "Dr. Surname".
 */
function spellings(contact: Entry): string[] {
  const full = contact.title.trim().toLowerCase();
  const plain = full
    .replace(/^(dr|mr|mrs|ms)\.?\s+/, "")
    .replace(/,.*$/, "")
    .trim();
  const words = plain.split(/\s+/).filter(Boolean);
  const all = [full, plain];
  if (words.length > 2) all.push(words.slice(0, 2).join(" "));
  if (contact.facts.isCompany === false && words.length > 1) all.push(`dr. ${words.at(-1)}`, `dr ${words.at(-1)}`);
  return [...new Set(all)].filter((spelling) => spelling.length >= 5);
}

/** The soonest calendar entry from today on whose title, text or attendees mention the provider. */
function nextOnCalendar(file: CaseFile, contact: Entry, today: string): Entry | null {
  const names = spellings(contact);
  if (names.length === 0) return null;
  const coming = file.entries
    .filter((entry) => entry.kind === "event" && entry.date >= today)
    .filter((entry) => {
      const where = [entry.title, entry.text, ...entry.people].join(" ").toLowerCase();
      return names.some((spelling) => where.includes(spelling));
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return coming[0] ?? null;
}

/** A calendar date as a day: "today", or "Sep 29, 2026". */
function dayOf(date: string, today: string) {
  return date.slice(0, 10) === today ? "today" : shortDate(date, true);
}

/**
 * The day something happened, from its timestamp: "today", or "Sep 29" (with the year when it is not
 * this year). Timestamps are in UTC, so one that falls on tomorrow's date there still happened today.
 */
function dayAt(timestamp: string, today: string) {
  const day = timestamp.slice(0, 10);
  if (day >= today) return "today";
  return shortDate(day, day.slice(0, 4) !== today.slice(0, 4));
}

/** Where the latest update stands, at a glance: opened is green, waiting to be opened is yellow. */
function ShareStatusPill({ share, today }: { share: ShareStatus | undefined; today: string }) {
  if (!share) return <StatusPill tone="neutral">Not shared</StatusPill>;
  if (share.revoked || share.expiresAt.slice(0, 10) < today) return <StatusPill tone="neutral">Link closed</StatusPill>;
  return share.opens > 0 ? <StatusPill tone="done">Opened</StatusPill> : <StatusPill tone="mild">Not opened yet</StatusPill>;
}

/** One sentence on the latest update shared with a provider. */
function shareLine(share: ShareStatus | undefined, today: string) {
  if (!share) return "Never shared.";
  const shared = `Shared ${dayAt(share.publishedAt, today)}`;
  const opened =
    share.opens === 0
      ? "not opened yet"
      : `opened ${share.opens === 1 ? "once" : `${share.opens} times`}${
          share.lastOpenedAt ? `, last ${dayAt(share.lastOpenedAt, today)}` : ""
        }`;
  const link = share.revoked
    ? " The link has been withdrawn."
    : share.expiresAt.slice(0, 10) < today
      ? ` The link expired ${shortDate(share.expiresAt, true)}.`
      : "";
  return `${shared}, ${opened}.${link}`;
}
