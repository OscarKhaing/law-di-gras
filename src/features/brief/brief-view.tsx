"use client";

import type { CaseFile } from "@/features/cases/schema";
import type { Parties } from "@/features/matters/schema";
import type { ShareStatus } from "@/features/shares/schema";
import { CoverageBar } from "./coverage-bar";
import { FactsPanel, type UpdateHead } from "./facts-panel";
import { KeyMoments } from "./key-moments";
import { MatterHeader } from "./matter-header";
import { ReadCase } from "./read-case";
import { Risks } from "./risks";
import type { StoredBrief } from "./schema";
import { SourceProvider } from "./source-panel";
import { WaitingOn } from "./waiting-on";
import { WhereItStands } from "./where-it-stands";

const written = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * One matter, read as a document: the header, then the brief on the left and the facts beside it.
 * Every figure, date and count is worked out in code; the model wrote only the sentences, and each
 * of those carries the chips of its sources.
 */
export function BriefView({
  file,
  stored,
  shares,
  heads,
  parties,
  injury,
  solDays,
  solMet,
  stale,
  today,
}: {
  file: CaseFile;
  stored: StoredBrief | null;
  shares: ShareStatus[];
  heads: Record<string, UpdateHead>;
  parties: Parties;
  injury: string;
  solDays: number | null;
  solMet: boolean;
  stale: boolean;
  today: string;
}) {
  return (
    <SourceProvider file={file}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16">
        <MatterHeader
          file={file}
          injury={injury}
          solDays={solDays}
          solMet={solMet}
          stale={stale}
          fingerprint={file.fingerprint}
        />
        {!stored ? (
          <ReadCase matterId={file.matterId} situation="no brief" />
        ) : (
          <>
            {!stored.current && <ReadCase matterId={file.matterId} situation="stale" />}
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
              <div className="order-2 flex min-w-0 flex-1 flex-col gap-10 lg:order-1 lg:max-w-[760px]">
                <WhereItStands brief={stored.brief} />
                <CoverageBar file={file} brief={stored.brief} />
                <KeyMoments brief={stored.brief} />
                <WaitingOn file={file} brief={stored.brief} parties={parties} today={today} />
                <Risks brief={stored.brief} />
                <p className="text-xs text-muted-foreground">
                  Sentences written by <span className="font-mono">{stored.model}</span> on{" "}
                  <span className="font-mono">{written.format(new Date(stored.createdAt))}</span> from{" "}
                  <span className="font-mono">{file.entries.length}</span> entries read from Clio. Dates, sums and day counts are
                  worked out in code.
                </p>
              </div>
              <div className="order-1 w-full shrink-0 lg:sticky lg:top-20 lg:order-2 lg:max-h-[calc(100svh-6rem)] lg:w-80 lg:overflow-y-auto">
                <FactsPanel
                  file={file}
                  brief={stored.brief}
                  shares={shares}
                  heads={heads}
                  injury={injury}
                  solDays={solDays}
                  solMet={solMet}
                  today={today}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </SourceProvider>
  );
}
