import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { MattersTable } from "@/features/matters/matters-table";
import type { MatterRow } from "@/features/matters/schema";
import { listMatterRows } from "@/features/matters/server";

// Read on every request: the list is the matters in Clio now, and the figures of those read so far.
export const dynamic = "force-dynamic";

export default async function MattersPage() {
  let connected = false;
  let rows: MatterRow[] = [];
  let failure = "";
  try {
    ({ connected, rows } = await listMatterRows());
  } catch (err) {
    failure = (err as { message?: string } | null)?.message ?? "Clio or the database could not be reached.";
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Matters</h1>
        <p className="text-muted-foreground">Every matter in your Clio account. Open one to read its brief.</p>
      </div>
      {failure ? (
        <section role="alert" className="flex max-w-prose flex-col gap-1 rounded-lg border border-danger/40 bg-card p-4 text-sm">
          <p className="font-medium text-danger">The matters could not be loaded</p>
          <p>{failure}</p>
          <p className="text-muted-foreground">
            Reload the page. If Clio is refusing the connection,{" "}
            <a href="/api/clio/connect" className="text-primary underline underline-offset-2">
              connect Clio again
            </a>
            .
          </p>
        </section>
      ) : !connected ? (
        <section className="flex max-w-prose flex-col items-start gap-4 rounded-lg border bg-card p-5">
          <p className="text-sm">
            Case Desk reads each matter from Clio, so it needs permission to read your Clio account. It only reads: nothing in
            Clio is changed.
          </p>
          <a href="/api/clio/connect" className={buttonVariants()}>
            Connect Clio
          </a>
        </section>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Clio is connected, but the account has no matters yet.</p>
      ) : (
        <Suspense>
          <MattersTable rows={rows} />
        </Suspense>
      )}
    </div>
  );
}
