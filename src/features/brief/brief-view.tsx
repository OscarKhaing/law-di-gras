import type { CaseFile } from "@/features/cases/schema";
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
 * A case, read top to bottom. With a brief: the bottom line, what is new, the facts, the money, the
 * moments that matter, what needs doing, the weaknesses, the injuries, the providers, then the whole
 * file. Without one: the file as read from Clio and the control that writes the brief.
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

  return (
    <SourceProvider file={file}>
      <div className="space-y-10">
        <CaseHeader file={file} photoUrl={photoUrl}>
          {brief.incident.text ? (
            <div className="max-w-prose space-y-1">
              <p className="font-serif text-[15px] leading-snug">{brief.incident.text}</p>
              <SourceLinks evidence={brief.incident.evidence} />
            </div>
          ) : (
            file.description && <p className="max-w-prose font-serif text-[15px] leading-snug">{file.description}</p>
          )}
        </CaseHeader>

        {!stored.current && <ReadCase matterId={file.matterId} situation="stale" />}

        <section aria-label="The bottom line" className="max-w-[46rem] space-y-2">
          {brief.bottomLine.text ? (
            <>
              <p className="font-serif text-2xl leading-snug text-pretty">{brief.bottomLine.text}</p>
              <SourceLinks evidence={brief.bottomLine.evidence} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">The brief gives no bottom line. Update the brief to write one.</p>
          )}
        </section>

        <SinceStrip file={file} today={today} />
        <Glance {...section} />
        <Money {...section} />
        <Moments {...section} />
        <Attention {...section} />
        <Flags {...section} />
        <Injuries {...section} />
        <Providers {...section} />
        <FullFile file={file} />
        <HowMade {...section} />
      </div>
    </SourceProvider>
  );
}
