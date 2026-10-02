import { notFound } from "next/navigation";
import { CaseBrief } from "@/features/brief/case-brief";
import { getBrief } from "@/features/brief/server";
import { getCaseFile } from "@/features/cases/server";

export const dynamic = "force-dynamic";

// The brief for one case. This page only loads the case file and the stored brief and hands them
// down. Opening it never calls Clio or a model.
export default async function CasePage({ params }: PageProps<"/cases/[id]">) {
  const { id } = await params;
  const matterId = Number(id);
  if (!Number.isInteger(matterId)) notFound();
  const [file, stored] = await Promise.all([getCaseFile(matterId), getBrief(matterId)]);
  if (!file) notFound();

  // Signed document URLs come from lane 1's documents/server.ts once documents are copied to Storage.
  return <CaseBrief file={file} stored={stored} documentUrls={{}} />;
}
