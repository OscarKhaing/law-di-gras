import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrief } from "@/features/brief/server";
import { SourceProvider } from "@/features/brief/source-panel";
import { parseSource } from "@/features/cases/schema";
import { getCaseFile } from "@/features/cases/server";
import { Composer } from "@/features/shares/composer";
import { ContactRef } from "@/features/shares/schema";
import { getDraft, LINK_DAYS, publishedLines, sharesFor, updateHead } from "@/features/shares/server";

export const dynamic = "force-dynamic";

const messageOf = (err: unknown) => (err as { message?: string } | null)?.message ?? "The database could not be reached.";

async function load(matterId: number, contactRef: string) {
  const [file, stored, draft, shares, published] = await Promise.all([
    getCaseFile(matterId),
    getBrief(matterId),
    getDraft(matterId, contactRef),
    sharesFor(matterId),
    publishedLines(matterId, contactRef),
  ]);
  return { file, stored, draft, shares: shares.filter((share) => share.contactRef === contactRef), published };
}

// Where the attorney checks an update before it leaves the firm. This page only loads what is
// stored; drafting, publishing and withdrawing go through the routes under /api/shares, which do
// their own checking.
export default async function ProviderUpdatePage({ params }: { params: Promise<{ id: string; contact: string }> }) {
  const { id, contact: contactParam } = await params;
  const matterId = Number(id);
  const contactRef = contactParam.toUpperCase();
  if (!Number.isInteger(matterId) || matterId <= 0 || !ContactRef.safeParse(contactRef).success) notFound();

  let loaded: Awaited<ReturnType<typeof load>> | null = null;
  let failure = "";
  try {
    loaded = await load(matterId, contactRef);
  } catch (err) {
    failure = messageOf(err);
  }

  const file = loaded?.file ?? null;
  const contact = file?.entries.find((entry) => entry.kind === "contact" && entry.ref === contactRef) ?? null;
  // A case that was read, without this contact on it: there is nothing here to show.
  if (file && (!contact || contact.facts.isClient === true)) notFound();

  // The brief says who is treating the client. When it has been written and does not say so of
  // this contact, no update is prepared for them.
  const person = loaded?.stored?.brief.people.find((entry) => parseSource(entry.contact).ref === contactRef);
  const notTreating = Boolean(loaded?.stored) && person?.treating !== true;
  const now = new Date();

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground hover:underline">
          Cases
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/cases/${matterId}`} className="hover:text-foreground hover:underline">
          {file?.client.name || `Matter ${matterId}`}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{!contact ? "Provider update" : notTreating ? contact.title : `Update for ${contact.title}`}</span>
      </nav>

      {!loaded ? (
        <div role="alert" className="max-w-prose border-l-2 border-destructive pl-3 text-sm">
          <p className="font-medium text-destructive">This update could not be opened</p>
          <p className="mt-1">{failure}</p>
          <p className="mt-1 text-muted-foreground">Nothing was shared or changed. Reload the page to try again.</p>
        </div>
      ) : !file || !contact ? (
        <div className="max-w-prose space-y-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">This case has not been read from Clio yet</h1>
          <p className="text-sm text-muted-foreground">
            An update is drafted from the case as it stands in Clio.{" "}
            <Link href={`/cases/${matterId}`} className="text-primary underline underline-offset-2">
              Open the case
            </Link>{" "}
            and read it first.
          </p>
        </div>
      ) : (
        <>
          <header className="space-y-1">
            <h1 className="font-heading text-3xl leading-tight font-semibold tracking-tight text-balance">
              {notTreating ? contact.title : `Update for ${contact.title}`}
            </h1>
            {(person?.role || contact.text) && (
              <p className="text-sm text-muted-foreground first-letter:uppercase">{contact.text || person?.role}</p>
            )}
          </header>
          {notTreating ? (
            <p className="max-w-prose border-l-2 border-marker bg-marker-soft px-3 py-2 text-sm leading-relaxed">
              The brief does not list {contact.title} as a provider treating {file.client.name}, so no update is prepared for
              them. An update goes only to an office that is treating the client.{" "}
              <Link href={`/cases/${matterId}`} className="underline underline-offset-2">
                Back to the case
              </Link>
            </p>
          ) : (
            <SourceProvider file={file}>
              <Composer
                key={`${matterId}-${contactRef}`}
                matterId={matterId}
                contactRef={contactRef}
                providerName={contact.title}
                head={updateHead(file, contact)}
                storedDraft={loaded.draft}
                shares={loaded.shares}
                published={loaded.published}
                now={now.toISOString()}
                newLinkExpiresAt={new Date(now.getTime() + LINK_DAYS * 86_400_000).toISOString()}
                linkDays={LINK_DAYS}
              />
            </SourceProvider>
          )}
        </>
      )}
    </div>
  );
}
