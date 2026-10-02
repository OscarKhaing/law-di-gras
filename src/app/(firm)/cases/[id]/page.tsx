import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefView } from "@/features/brief/brief-view";
import { ReadCase } from "@/features/brief/read-case";
import { getBrief } from "@/features/brief/server";
import { getCaseFile } from "@/features/cases/server";
import { clientPhotoUrl, indexUsage } from "@/features/documents/server";
import { sharesFor } from "@/features/shares/server";

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

async function load(matterId: number) {
  const [file, stored, shares, photoUrl, index] = await Promise.all([
    getCaseFile(matterId),
    getBrief(matterId),
    optional("shared updates", sharesFor(matterId), []),
    optional("client photo", clientPhotoUrl(matterId), null),
    optional("document reading cost", indexUsage(matterId), null),
  ]);
  return { file, stored, shares, photoUrl, index };
}

// The brief for one case. This page only loads what is stored and hands it down: opening it never
// calls Clio or a model.
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
  // One "today" for every section, so their sums and day counts agree.
  const today = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground hover:underline">
          Cases
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{loaded?.file?.client.name || `Matter ${matterId}`}</span>
      </nav>
      {!loaded ? (
        <div role="alert" className="max-w-prose border-l-2 border-destructive pl-3 text-sm">
          <p className="font-medium text-destructive">This case could not be opened</p>
          <p className="mt-1">{failure}</p>
          <p className="mt-1 text-muted-foreground">
            Nothing was lost. Reload the page; if it fails again, see whether the database answers under Connection checks.
          </p>
        </div>
      ) : !loaded.file ? (
        <ReadCase matterId={matterId} situation="unread" />
      ) : (
        <BriefView
          file={loaded.file}
          stored={loaded.stored}
          shares={loaded.shares}
          index={loaded.index}
          today={today}
          photoUrl={loaded.photoUrl}
        />
      )}
    </div>
  );
}
