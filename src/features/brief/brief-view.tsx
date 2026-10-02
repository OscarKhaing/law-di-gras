import { shortDate, type CaseFile } from "@/features/cases/schema";
import { fromToday } from "@/features/cases/words";
import type { ShareStatus } from "@/features/shares/schema";
import { Attention } from "./attention";
import { Flags } from "./flags";
import { FullFile } from "./full-file";
import { Glance } from "./glance";
import { CaseHeader } from "./header";
import { HowMade } from "./how-made";
import { Injuries } from "./injuries";
import { Moments } from "./moments";
import { Money } from "./money";
import { Providers } from "./providers";
import { ReadCase } from "./read-case";
import type { IndexUsage, SectionProps, StoredBrief } from "./schema";
import { SinceStrip } from "./since-strip";
import { SourceLinks, SourceProvider } from "./source-panel";

/**
 * A case, read top to bottom in about ninety seconds. With a brief: the bottom line beside what is
 * new, the money, the facts beside the injuries, the moments that matter, what needs doing, the
 * weaknesses, the providers, then the whole file. A statement is followed by its sources as small
 * links; the passage itself is written out only for a red flag and for the moment selected.
 * Without a brief: the file as read from Clio and the control that writes the brief.
 */
export function BriefView({
  file,
  stored,
  shares,
  index,
  today,
  photoUrl,
}: {
  file: CaseFile;
  stored: StoredBrief | null;
  shares: ShareStatus[];
  index: IndexUsage | null;
  today: string;
  photoUrl: string | null;
}) {
  if (!stored) {
    return (
      <SourceProvider file={file}>
        <div className="space-y-10">
          <CaseHeader file={file} photoUrl={photoUrl}>
            {file.description && <p className="max-w-prose font-serif text-[15px] leading-snug">{file.description}</p>}
          </CaseHeader>
          <ReadCase matterId={file.matterId} situation="no brief" />
          <SinceStrip file={file} today={today} />
          <FullFile file={file} />
        </div>
      </SourceProvider>
    );
  }

  const section: SectionProps = { file, stored, shares, index, today };
  const { brief } = stored;
  const incidentDay = shortDate(brief.incident.date, true);

  return (
    <SourceProvider file={file}>
      <div className="space-y-8">
        <CaseHeader
          file={file}
          photoUrl={photoUrl}
          incident={incidentDay ? `${incidentDay}, ${fromToday(brief.incident.date, today)}` : undefined}
        >
          {brief.incident.text ? (
            <p className="max-w-[46rem] font-serif text-[15px] leading-snug">
              {brief.incident.text} <SourceLinks evidence={brief.incident.evidence} />
            </p>
          ) : (
            file.description && <p className="max-w-prose font-serif text-[15px] leading-snug">{file.description}</p>
          )}
        </CaseHeader>

        {!stored.current && <ReadCase matterId={file.matterId} situation="stale" />}

        {/* Where the case stands, and beside it what is new since the reader last looked. */}
        <div className="grid items-start gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1fr)_23rem]">
          <section aria-label="The bottom line" className="space-y-2">
            {brief.bottomLine.text ? (
              <>
                <p className="font-serif text-[26px] leading-[1.3] text-pretty">{brief.bottomLine.text}</p>
                <p>
                  <SourceLinks evidence={brief.bottomLine.evidence} />
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">The brief gives no bottom line. Update the brief to write one.</p>
            )}
          </section>
          <SinceStrip file={file} today={today} />
        </div>

        <Money {...section} />
        <div className="grid items-start gap-x-10 gap-y-8 xl:grid-cols-2">
          <Glance {...section} />
          <Injuries {...section} />
        </div>
        <Moments {...section} />
        <Attention {...section} />
        <Flags {...section} />
        <Providers {...section} />
        <FullFile file={file} />
        <HowMade {...section} />
      </div>
    </SourceProvider>
  );
}
