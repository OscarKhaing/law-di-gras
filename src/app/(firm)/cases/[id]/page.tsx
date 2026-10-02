import { notFound } from "next/navigation";
import { BriefView } from "@/features/brief/brief-view";
import type { UpdateHead } from "@/features/brief/facts-panel";
import { ReadCase } from "@/features/brief/read-case";
import { getBrief } from "@/features/brief/server";
import { getCaseFile } from "@/features/cases/server";
import { injuryDate, partiesOf, solSatisfied } from "@/features/matters/schema";
import { sharesFor, updateHead } from "@/features/shares/server";
import { daysUntil, olderThanADay, todayIso } from "@/lib/calc";

export const dynamic = "force-dynamic";

const messageOf = (err: unknown) => (err as { message?: string } | null)?.message ?? "The database could not be reached.";

/** Something the page can do without: if it cannot be loaded, the brief still opens. */
async function optional<T>(what: string, load: Promise<T>, fallback: T): Promise<T> {
  try {
    return await load;
  } catch (err) {
    console.error(`[case page] ${what}: ${messageOf(err)}`);
    return fallback;
  }
}

// The brief for one matter. This page only loads what is stored and works out the figures; opening
// it never calls Clio or a model.
export default async function CasePage({ params }: PageProps<"/cases/[id]">) {
  const { id } = await params;
  const matterId = Number(id);
  if (!Number.isInteger(matterId) || matterId <= 0) notFound();

  let loaded: Awaited<ReturnType<typeof load>> | null = null;
  let failure = "";
  try {
    loaded = await load(matterId);
  } catch (err) {
    failure = messageOf(err);
  }

  if (!loaded) {
    return (
      <div role="alert" className="mx-auto flex w-full max-w-prose flex-col gap-1 rounded-lg border border-danger/40 bg-card p-4 text-sm">
        <p className="font-medium text-danger">This matter could not be opened</p>
        <p>{failure}</p>
        <p className="text-muted-foreground">Nothing was lost. Reload the page in a minute.</p>
      </div>
    );
  }
  if (!loaded.file) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <ReadCase matterId={matterId} situation="unread" />
      </div>
    );
  }

  const { file, stored, shares } = loaded;
  const today = todayIso();
  const brief = stored?.brief ?? null;
  const contacts = new Map(file.entries.filter((entry) => entry.kind === "contact").map((entry) => [entry.ref, entry]));
  const heads: Record<string, UpdateHead> = {};
  for (const person of brief?.people ?? []) {
    const contact = contacts.get(person.contact);
    if (person.treating && contact) heads[contact.ref] = updateHead(file, contact);
  }

  return (
    <BriefView
      file={file}
      stored={stored}
      shares={shares}
      heads={heads}
      parties={partiesOf(file, brief)}
      injury={injuryDate(file, brief)}
      solDays={daysUntil(file.limitationDate, today)}
      solMet={solSatisfied(file)}
      stale={olderThanADay(file.syncedAt)}
      today={today}
    />
  );
}

async function load(matterId: number) {
  const [file, stored, shares] = await Promise.all([
    getCaseFile(matterId),
    getBrief(matterId),
    optional("shared updates", sharesFor(matterId), []),
  ]);
  return { file, stored, shares };
}
