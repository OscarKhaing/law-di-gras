import type { ReactNode } from "react";
import { clioMatterUrl, isFreshRead, type CaseFile } from "@/features/cases/schema";
import { LocalTime } from "@/features/cases/local-time";
import { StageTrack } from "@/features/cases/stage-track";
import { CheckClio, FreshReadLink } from "./read-case";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

/**
 * Who the case is about, as a card at the top of the side column: the client, the matter, where it
 * stands among Clio's stages, the few facts that must stay in view whatever part is open (`vitals`),
 * and when it was last read from Clio. `children` is a line under the name, used when there is no
 * brief yet.
 */
export function CaseHeader({
  file,
  photoUrl,
  vitals,
  children,
}: {
  file: CaseFile;
  photoUrl: string | null;
  vitals?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="space-y-4 rounded-2xl border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-3">
        {photoUrl ? (
          // A signed link to the client's photo ID in our own storage; it expires, so it is not optimised.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={`Photograph of ${file.client.name}`}
            className="size-12 shrink-0 rounded-full border bg-muted object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-lg text-primary"
          >
            {initials(file.client.name)}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="font-heading text-xl leading-tight font-semibold tracking-tight">{file.client.name || "Client not named in Clio"}</h1>
          <p className="text-xs text-muted-foreground">
            Matter {file.number}
            {file.practiceArea ? `, ${file.practiceArea.toLowerCase()}` : ""}
          </p>
        </div>
      </div>
      {children}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Stage</p>
        <div className="text-sm font-medium">
          <StageTrack stage={file.stage} stages={file.stages} stacked />
        </div>
      </div>
      {vitals}
      <div className="space-y-2 rounded-xl bg-muted/70 p-3 text-xs text-muted-foreground [&>div]:items-start [&_p]:text-left">
        <p>
          Read from Clio <LocalTime iso={file.syncedAt} />
        </p>
        <CheckClio matterId={file.matterId} fingerprint={file.fingerprint} entries={file.entries.length} />
        <a
          href={clioMatterUrl(file.matterId)}
          target="_blank"
          rel="noreferrer"
          className="block text-xs underline underline-offset-2 hover:text-foreground"
        >
          Open this matter in Clio
        </a>
        <a href={`/handoff/${file.matterId}`} target="_blank" rel="noreferrer" className="block text-xs underline underline-offset-2 hover:text-foreground">
          Print a handoff sheet
        </a>
        {!isFreshRead(file.matterId) && <FreshReadLink matterId={file.matterId} />}
      </div>
    </header>
  );
}
