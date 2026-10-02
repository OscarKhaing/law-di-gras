import Link from "next/link";
import { shortDate, type CaseSummary } from "@/features/cases/schema";
import { listCases } from "@/features/cases/server";
import { StageTrack } from "@/features/cases/stage-track";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Read on every request: the list is whatever has been read from Clio so far.
export const dynamic = "force-dynamic";

export default async function CasesPage() {
  let cases: CaseSummary[] = [];
  let failure: string | null = null;
  try {
    cases = await listCases();
  } catch (err) {
    failure = (err as { message?: string } | null)?.message ?? "The database could not be reached.";
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Cases</h1>
        <p className="mt-1 text-muted-foreground">Read from your Clio account.</p>
      </div>
      {failure ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">The cases could not be loaded</p>
          <p className="mt-1 text-muted-foreground">{failure}</p>
        </div>
      ) : cases.length === 0 ? (
        <p className="max-w-prose text-sm text-muted-foreground">
          No case has been read from Clio yet. Connect Clio, then read a case to see its brief here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 text-muted-foreground">Client</TableHead>
                <TableHead className="text-muted-foreground">Matter</TableHead>
                <TableHead className="text-muted-foreground">Stage</TableHead>
                <TableHead className="px-4 text-right text-muted-foreground">Read from Clio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((c) => (
                <TableRow key={c.matterId} className="relative">
                  <TableCell className="px-4 py-3 font-medium">
                    {/* The link's ::after covers the row, so the whole row opens the case. */}
                    <Link href={`/cases/${c.matterId}`} className="after:absolute after:inset-0">
                      {c.client}
                    </Link>
                  </TableCell>
                  <TableCell>{c.number}</TableCell>
                  <TableCell>
                    <StageTrack stage={c.stage} stages={c.stages} />
                  </TableCell>
                  <TableCell className="px-4 text-right text-muted-foreground tabular-nums">
                    {shortDate(c.syncedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
