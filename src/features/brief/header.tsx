import type { ReactNode } from "react";
import type { CaseFile } from "@/features/cases/schema";
import { LocalTime } from "@/features/cases/local-time";
import { StageTrack } from "@/features/cases/stage-track";
import { CheckClio } from "./read-case";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

/**
 * The top of a case: who the client is, the matter, where it stands among Clio's stages, and when
 * it was last read from Clio. `children` is the line under the name: what happened to the client.
 * The date of the incident is written here once, so no section below repeats it.
 */
export function CaseHeader({
  file,
  photoUrl,
  incident,
  children,
}: {
  file: CaseFile;
  photoUrl: string | null;
  /** When it happened, in words: "Apr 3, 2024, 2 years ago". Written after the matter number. */
  incident?: string;
  children?: ReactNode;
}) {
  return (
    <header className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="flex min-w-0 flex-1 basis-96 items-start gap-4">
          {photoUrl ? (
            // A signed link to the client's photo ID in our own storage; it expires, so it is not optimised.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={`Photograph of ${file.client.name}`}
              className="size-16 shrink-0 rounded-full border bg-muted object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-16 shrink-0 items-center justify-center rounded-full border bg-card font-heading text-xl text-muted-foreground"
            >
              {initials(file.client.name)}
            </span>
          )}
          <div className="min-w-0 space-y-1.5">
            <h1 className="font-heading text-3xl leading-tight font-semibold tracking-tight">{file.client.name || "Client not named in Clio"}</h1>
            <p className="text-sm text-muted-foreground">
              Matter {file.number}
              {file.practiceArea ? `, ${file.practiceArea.toLowerCase()}` : ""}
              {incident ? `. Incident ${incident}.` : ""}
            </p>
            {children}
          </div>
        </div>
        <div className="flex flex-col items-start gap-1.5 text-sm text-muted-foreground sm:items-end">
          <p>
            Read from Clio <LocalTime iso={file.syncedAt} />
          </p>
          <CheckClio matterId={file.matterId} fingerprint={file.fingerprint} />
        </div>
      </div>
      <StageTrack stage={file.stage} stages={file.stages} named />
    </header>
  );
}
