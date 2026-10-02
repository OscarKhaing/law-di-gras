import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { CaseBrief } from "@/features/brief/case-brief";
import type { StoredBrief } from "@/features/brief/schema";
import type { CaseFile } from "@/features/cases/schema";

export const dynamic = "force-dynamic";

// Development only, deleted at the 3:00 cleanup: the brief page on a made-up case kept in the
// git-ignored challenge/fixture.json, for building the screen before a real case has been read.
export default async function PreviewPage() {
  let fixture: { file: CaseFile; brief: StoredBrief | null; documentUrls?: Record<string, string> };
  try {
    fixture = JSON.parse(await readFile(path.join(process.cwd(), "challenge", "fixture.json"), "utf8"));
  } catch {
    notFound();
  }
  return <CaseBrief file={fixture.file} stored={fixture.brief} documentUrls={fixture.documentUrls ?? {}} />;
}
