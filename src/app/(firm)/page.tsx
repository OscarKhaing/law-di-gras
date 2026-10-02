import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LocalTime } from "@/features/cases/local-time";
import type { CaseSummary } from "@/features/cases/schema";
import { listMatters } from "@/features/cases/server";
import { StageTrack } from "@/features/cases/stage-track";

// Read on every request: the list is the matters in Clio now, and which of them have been read.
export const dynamic = "force-dynamic";

export default async function CasesPage() {
  let connected = false;
  let matters: CaseSummary[] = [];
  let failure = "";
  try {
    ({ connected, matters } = await listMatters());
  } catch (err) {
    failure = (err as { message?: string } | null)?.message ?? "Clio or the database could not be reached.";
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Cases</h1>
        <p className="mt-1 text-muted-foreground">The matters in your Clio account. Open one to read its brief.</p>
      </div>

      {failure ? (
        <div role="alert" className="max-w-prose border-l-2 border-destructive pl-3 text-sm">
          <p className="font-medium text-destructive">The cases could not be loaded</p>
          <p className="mt-1">{failure}</p>
          <p className="mt-1 text-muted-foreground">
            Reload the page. If Clio is refusing the connection,{" "}
            <a href="/api/clio/connect" className="text-foreground underline underline-offset-2">
              connect Clio again
            </a>
            .
          </p>
        </div>
      ) : !connected ? (
        <div className="max-w-prose space-y-4 border-y py-5">
          <p className="text-sm">
            Case Desk reads each case from Clio, so it needs your permission to read your Clio account. It only reads:
            nothing in Clio is changed.
          </p>
          <a href="/api/clio/connect" className={buttonVariants({ size: "lg" })}>
            Connect Clio
          </a>
        </div>
      ) : matters.length === 0 ? (
        <p className="max-w-prose border-y py-5 text-sm text-muted-foreground">
          Clio is connected, but the account has no matters. Open a matter in Clio and it will be listed here.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-0 text-muted-foreground">Client</TableHead>
              <TableHead className="text-muted-foreground">Matter</TableHead>
              <TableHead className="text-muted-foreground">Stage</TableHead>
              <TableHead className="pr-0 text-right text-muted-foreground">Read from Clio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matters.map((matter) => (
              <TableRow key={matter.matterId} className="relative hover:bg-transparent">
                <TableCell className="py-3.5 pl-0">
                  {/* The link's ::after covers the row, so the whole row opens the case. */}
                  <Link
                    href={`/cases/${matter.matterId}`}
                    className="font-heading text-lg font-semibold tracking-tight underline-offset-4 outline-none after:absolute after:inset-0 hover:underline focus-visible:underline"
                  >
                    {matter.client || "Client not named in Clio"}
                  </Link>
                  {matter.description && (
                    <p className="max-w-md truncate text-sm text-muted-foreground">{matter.description}</p>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">{matter.number}</TableCell>
                <TableCell>
                  <StageTrack stage={matter.stage} stages={matter.stages} />
                </TableCell>
                <TableCell className="pr-0 text-right text-muted-foreground">
                  {matter.syncedAt ? <LocalTime iso={matter.syncedAt} /> : "Not read yet"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
