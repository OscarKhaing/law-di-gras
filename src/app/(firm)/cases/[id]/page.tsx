import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrief } from "@/features/brief/server";
import { getCaseFile } from "@/features/cases/server";
import { StageTrack } from "@/features/cases/stage-track";

export const dynamic = "force-dynamic";

// The brief for one case. Lane 2 builds the sections; this page only loads the case file and the
// stored brief and hands them down. Opening it never calls Clio or a model.
export default async function CasePage({ params }: PageProps<"/cases/[id]">) {
  const { id } = await params;
  const matterId = Number(id);
  if (!Number.isInteger(matterId)) notFound();
  const [file, stored] = await Promise.all([getCaseFile(matterId), getBrief(matterId)]);
  if (!file) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-3">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground hover:underline">
            Cases
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">{file.client.name}</span>
        </nav>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{file.client.name}</h1>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>{file.number}</span>
          <StageTrack stage={file.stage} stages={file.stages} />
        </div>
      </div>
      {stored ? (
        <p className="max-w-prose font-serif text-xl leading-snug">{stored.brief.bottomLine.text}</p>
      ) : (
        <p className="max-w-prose text-sm text-muted-foreground">
          This case has been read from Clio ({file.entries.length} entries) but its brief has not been written yet.
        </p>
      )}
    </div>
  );
}
