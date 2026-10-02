import Link from "next/link";
import { StatusPill } from "@/components/status";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WORKLISTS } from "@/features/brief/schema";
import { listedCases } from "@/features/brief/server";
import { LocalTime } from "@/features/cases/local-time";
import type { CaseSummary } from "@/features/cases/schema";
import { listMatters } from "@/features/cases/server";
import { StageTrack } from "@/features/cases/stage-track";

// Read on every request: the list is the matters in Clio now, and which of them have been read.
export const dynamic = "force-dynamic";

export default async function CasesPage({ searchParams }: PageProps<"/">) {
  // `?show=overdue` narrows the list to one of the sidebar's worklists.
  const { show } = await searchParams;
  const worklist = WORKLISTS.find((list) => list.id === show);
  let connected = false;
  let matters: CaseSummary[] = [];
  let failure = "";
  try {
    ({ connected, matters } = await listMatters());
    if (worklist) {
      const onIt = new Set((await listedCases()).filter((item) => item.lists.includes(worklist.id)).map((item) => item.matterId));
      matters = matters.filter((matter) => onIt.has(matter.matterId));
    }
  } catch (err) {
    failure = (err as { message?: string } | null)?.message ?? "Clio or the database could not be reached.";
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{worklist ? worklist.label : "Cases"}</h1>
        <p className="mt-1 text-muted-foreground">
          {worklist ? (
            <>
              The cases this applies to, from what was last read from Clio.{" "}
              <Link href="/" className="text-foreground underline underline-offset-2">
                Show all cases
              </Link>
            </>
          ) : (
            "The matters in your Clio account. Open one to read its brief."
          )}
        </p>
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
          {worklist
            ? "No case is on this list. That is as of the last read of Clio; open a case and press Check Clio to bring it up to date."
            : "Clio is connected, but the account has no matters. Open a matter in Clio and it will be listed here."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-0 text-muted-foreground">Client</TableHead>
              <TableHead className="text-muted-foreground">Matter</TableHead>
              <TableHead className="text-muted-foreground">Stage</TableHead>
              <TableHead className="pr-0 text-right text-muted-foreground">Status</TableHead>
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
                <TableCell className="pr-0 text-right">
                  {matter.syncedAt ? (
                    <span className="inline-flex flex-col items-end gap-1">
                      <StatusPill tone="done">Read from Clio</StatusPill>
                      <span className="text-xs text-muted-foreground">
                        <LocalTime iso={matter.syncedAt} />
                      </span>
                    </span>
                  ) : (
                    <StatusPill tone="mild">Not read yet</StatusPill>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
