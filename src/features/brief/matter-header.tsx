"use client";

import { ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { SolCountdown } from "@/components/sol-countdown";
import type { CaseFile } from "@/features/cases/schema";
import { LocalTime } from "@/features/cases/local-time";
import { formatDate } from "@/lib/calc";
import { clioMatterUrl } from "@/lib/clio-url";
import { cn } from "@/lib/utils";
import { CheckClio, RegenerateBrief } from "./read-case";

/**
 * Who the matter is for and where it stands: client, matter number, stage, date of injury, the
 * statute of limitations as a countdown worked out in code, and the controls that read Clio again.
 */
export function MatterHeader({
  file,
  injury,
  solDays,
  solMet,
  stale,
  fingerprint,
}: {
  file: CaseFile;
  injury: string;
  solDays: number | null;
  solMet: boolean;
  /** True when the matter was last read from Clio more than a day ago. */
  stale: boolean;
  fingerprint: string;
}) {
  const level = solMet || solDays === null ? "calm" : solDays < 30 ? "danger" : solDays < 90 ? "warning" : "calm";
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{file.client.name || "Client not named in Clio"}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
            <span className="font-mono text-foreground">{file.number}</span>
            {file.stage && <Badge variant="secondary">{file.stage}</Badge>}
            <span>
              Injured <span className="font-mono text-foreground">{formatDate(injury) || "date not in the file"}</span>
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
                level === "danger" && "border-danger/50 bg-danger/5",
                level === "warning" && "border-warning/50 bg-warning-soft",
              )}
            >
              <span>SOL</span>
              <SolCountdown sol={file.limitationDate} days={solDays} satisfied={solMet} withDate />
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2 lg:justify-end">
          <a
            href={clioMatterUrl(file.matterId)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ExternalLinkIcon />
            Open in Clio
          </a>
          <RegenerateBrief matterId={file.matterId} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Last synced from Clio <LocalTime iso={file.syncedAt} />. Clio is only read, never changed.
      </p>
      {stale && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
          <p>
            Synced more than a day ago. Anything added in Clio since then is not in this brief.
          </p>
          <CheckClio matterId={file.matterId} fingerprint={fingerprint} />
        </div>
      )}
    </header>
  );
}
