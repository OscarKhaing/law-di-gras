"use client";

import { CallButton } from "@/features/calls/call-button";
import type { ReactNode } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { StatusPill } from "@/components/status";
import { byRef, parseSource, shortDate, type CaseFile, type Entry, clioMatterId } from "@/features/cases/schema";
import { ReceivedFileLink } from "@/features/shares/received-file";
import type { ShareStatus } from "@/features/shares/schema";
import { cn } from "@/lib/utils";
import { Disclosure, useFold } from "./fold";
import type { CheckedBrief, SectionProps } from "./schema";
import { SourceLinks, useSource } from "./source-panel";

type Person = CheckedBrief["people"][number];
/** A person from the brief joined to their contact in Clio; `entry` is null when the contact is not there. */
type Joined = { person: Person; ref: string; entry: Entry | null };

/**
 * Treating providers, one compact ledger row each: what the office did, what the firm holds from it
 * and is still waiting for, and whether an update was shared and opened, with the control that
 * prepares one. Everyone else on the case is a plainer ledger, closed until asked for.
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
  const owing = treating.filter(({ person }) => person.owes !== "").length;
  const othersOwing = others.filter(({ person }) => person.owes !== "").length;
  const { shown, control } = useFold(treating);

  return (
    <section aria-labelledby="treating-providers" className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 id="treating-providers" className="font-heading text-xl font-semibold tracking-tight">
            Treating providers
          </h2>
          {treating.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {owing > 0
                ? `The firm is waiting on ${owing} of ${treating.length}; they come first. `
                : `Nothing is outstanding from any of the ${treating.length}. `}
              An update goes to a provider only after you have checked it.
            </p>
          )}
        </div>
        {treating.length === 0 ? (
          <p className="border-y py-3 text-sm text-muted-foreground">The brief names no treating providers on this case.</p>
        ) : (
          <div className="divide-y border-y">
            {shown.map((joined, index) => (
              <ProviderRow key={`${joined.ref}-${index}`} joined={joined} file={file} shares={shares} today={today} />
            ))}
          </div>
        )}
        {control}
      </div>

      {others.length === 0 ? (
        <p className="text-sm text-muted-foreground">The brief names nobody else on this case.</p>
      ) : (
        <Disclosure
          title="Others on the case"
          remark={
            `${others.length} ${others.length === 1 ? "person" : "people"}` +
            (othersOwing > 0 ? `, ${othersOwing} the firm is waiting on` : "")
          }
        >
          <div className="divide-y border-t">
            {others.map(({ person, ref, entry }, index) => (
              <div key={`${ref}-${index}`} className="grid gap-x-6 gap-y-1 py-2 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                <Who person={person} entry={entry} />
                <div className="space-y-1">
                  <p className="text-sm leading-5">
                    {person.did ? (
                      <>{person.did} </>
                    ) : (
                      <span className="text-muted-foreground">The file does not say what they have done. </span>
                    )}
                    <Sources person={person} file={file} />
                  </p>
                  {person.owes && <Owed>Waiting for: {person.owes}</Owed>}
                </div>
              </div>
            ))}
          </div>
        </Disclosure>
      )}
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
  const mine = shares
    .filter((share) => share.contactRef === ref)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const replies = mine
    .flatMap((share) => share.replies)
    .sort((a, b) => b.at.localeCompare(a.at));
  const files = mine
    .flatMap((share) => share.files.map((file) => ({ shareId: share.id, file })))
    .sort((a, b) => b.file.at.localeCompare(a.file.at));

  return (
    <div className="grid gap-x-6 gap-y-1.5 py-2 2xl:grid-cols-[13rem_minmax(0,1fr)_13rem_8.5rem] 2xl:grid-cols-[16rem_minmax(0,1fr)_15rem_9.5rem]">
      <Who person={person} entry={entry} />

      <div className="min-w-0 space-y-1.5">
        <p className="text-sm leading-5" title={person.holds ? `On file: ${person.holds}` : undefined}>
          {person.did ? <>{person.did} </> : <span className="text-muted-foreground">The file does not say what care was given. </span>}
          <Sources person={person} file={file} />
        </p>
      </div>
      <div className="min-w-0">
        {person.owes ? (
          <Owed>Waiting for: {person.owes}</Owed>
        ) : (
          <p className="text-sm leading-5 text-muted-foreground">Nothing outstanding.</p>
        )}
      </div>

      <div className="flex flex-col items-start gap-1 2xl:items-end 2xl:text-right">
        {entry ? (
          <Link
            href={`/cases/${clioMatterId(file.matterId)}/providers/${ref}`}
            className={buttonVariants({ size: "sm", variant: person.owes ? "default" : "outline" })}
          >
            Share an update
          </Link>
        ) : (
          <p className="text-xs text-muted-foreground">An update needs this contact in Clio first.</p>
        )}
        {entry && (
          <CallButton
            matterId={clioMatterId(file.matterId)}
            contactRef={ref}
            contactName={entry.title}
            phone={String(entry.facts.phone ?? "")}
          />
        )}
        <ShareStatusPill share={mine[0]} today={today} />
        <p className={cn("text-xs leading-4", mine.length === 0 ? "text-muted-foreground" : "text-foreground")}>
          {shareLine(mine[0], today)}
        </p>
      </div>

      {/* What the office sent back, under the row and across its width, so a reply or a file name is not squeezed into one column. */}
      {(replies.length > 0 || files.length > 0) && (
        <div className="min-w-0 space-y-1.5 2xl:col-span-3 2xl:col-start-2">
          {replies.map((reply, index) => (
            <p key={index} className="w-fit max-w-full border-l-2 border-marker bg-marker-soft px-2.5 py-1">
              <span className="block text-xs text-muted-foreground">
                From the provider, not yet in Clio ({dayAt(reply.at, today)}):
              </span>
              <span className="font-serif text-[15px] leading-snug">{reply.text}</span>
            </p>
          ))}
          {/* The newest few files, plainly: a file's name is not a quoted passage. The update's own screen lists them all. */}
          {files.length > 0 && (
            <div className="w-fit max-w-full border-l-2 pl-2.5 text-xs leading-5 text-muted-foreground">
              <p>Received from the provider, not yet in Clio:</p>
              <ul>
                {files.slice(0, 3).map(({ shareId, file }) => (
                  <li key={file.path}>
                    <ReceivedFileLink shareId={shareId} file={file} /> ({dayAt(file.at, today)})
                  </li>
                ))}
              </ul>
              {files.length > 3 && <p>and {files.length - 3} more, all listed under &ldquo;Share an update&rdquo;.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The left column of a row: the name as Clio has it, in the serif face, and their part in the case. */
function Who({ person, entry }: { person: Person; entry: Entry | null }) {
  const { openRef } = useSource();
  const role = person.role || (entry ? String(entry.facts.role ?? entry.text) : "");

  return (
    <div className="min-w-0">
      {entry ? (
        <button
          type="button"
          onClick={(event) => openRef(entry.ref, event.currentTarget)}
          className="cursor-pointer rounded-sm text-left font-serif text-base leading-snug font-medium text-pretty decoration-input underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {entry.title}
        </button>
      ) : (
        <p className="text-sm text-muted-foreground">This contact was not found in Clio.</p>
      )}
      {role && <p className="text-xs leading-5 text-muted-foreground first-letter:uppercase">{role}</p>}
    </div>
  );
}

/** Where the latest update stands, at a glance: opened is green, waiting to be opened is amber. */
function ShareStatusPill({ share, today }: { share: ShareStatus | undefined; today: string }) {
  if (!share) return <StatusPill tone="neutral">Not shared</StatusPill>;
  if (share.revoked || share.expiresAt.slice(0, 10) < today) return <StatusPill tone="neutral">Link closed</StatusPill>;
  return share.opens > 0 ? <StatusPill tone="done">Opened</StatusPill> : <StatusPill tone="mild">Not opened yet</StatusPill>;
}

/** Something the firm is still waiting for, marked because a person has to chase it. */
function Owed({ children }: { children: ReactNode }) {
  return (
    <p className="w-fit border-l-2 border-marker bg-marker-soft px-2.5 py-0.5 text-sm leading-5">{children}</p>
  );
}

function Sources({ person, file }: { person: Person; file: CaseFile }) {
  const entries = byRef(file);
  if (!person.evidence.some((item) => entries.has(parseSource(item.source).ref))) {
    return <span className="text-xs text-muted-foreground">The brief gives no source for this.</span>;
  }
  return <SourceLinks evidence={person.evidence} />;
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
