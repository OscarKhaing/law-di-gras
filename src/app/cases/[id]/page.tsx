import Link from "next/link";
import { notFound } from "next/navigation";
import { CASES, shortDate } from "@/features/cases/data";
import { StageTrack } from "@/features/cases/stage-track";
import { StatusBadge } from "@/features/cases/status-badge";
import { DocumentReview } from "@/features/documents/document-review";

export default async function CasePage({ params }: PageProps<"/cases/[id]">) {
  const { id } = await params;
  const c = CASES.find((item) => item.id === id);
  if (!c) notFound();

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground hover:underline">
            Cases
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">{c.client}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">{c.client}</h1>
          <StatusBadge status={c.status} />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>{c.matter}</span>
          <StageTrack stage={c.stage} />
          <span>Updated {shortDate(c.updatedAt)}</span>
        </div>
      </div>
      <DocumentReview />
    </div>
  );
}
