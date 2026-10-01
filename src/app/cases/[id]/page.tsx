import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentExtractor } from "@/components/document-extractor";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { CASES } from "@/lib/mock-data";

export default async function CasePage({ params }: PageProps<"/cases/[id]">) {
  const { id } = await params;
  const c = CASES.find((item) => item.id === id);
  if (!c) notFound();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Cases
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{c.client}</h1>
          <Badge variant="outline">{c.stage}</Badge>
          <StatusBadge status={c.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {c.matter} · last updated {c.updatedAt}
        </p>
      </div>
      <DocumentExtractor />
    </div>
  );
}
