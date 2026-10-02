import { Banknote, CalendarDays, Flag, FolderOpen, Info, LayoutDashboard, ListTodo, Stethoscope } from "lucide-react";
import { overdue, upcoming, type CaseFile } from "@/features/cases/schema";
import { addDays } from "@/features/cases/words";
import type { ShareStatus } from "@/features/shares/schema";
import { Attention } from "./attention";
import { CaseTabs, StatusTiles, type CaseTab } from "./case-tabs";
import { Flags, weightOf } from "./flags";
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

/** Days ahead that count as "this week" on the overview and the To do tab. */
const WEEK = 7;

/**
 * A case: the header, then one tab per subject. The overview answers "where does it stand and
 * what needs me"; each other tab holds one part of the brief, so nothing has to be scrolled past.
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
          <FullFile file={file} today={today} />
        </div>
      </SourceProvider>
    );
  }

  const section: SectionProps = { file, stored, shares, index, today };
  const { brief } = stored;
  const late = overdue(file, today);
  const thisWeek = upcoming(file, today, addDays(today, WEEK));
  const flagsOf = (weight: string) => brief.flags.filter((flag) => weightOf(flag.weight) === weight).length;
  const owedRecords = brief.people.filter((person) => person.treating && person.owes.trim() !== "").length;

  const overview = (
    <div className="space-y-10">
      <StatusTiles
        tiles={[
          { tab: "todo", label: "Overdue", count: late.length, tone: "urgent", some: "Tasks past their due date", none: "Nothing is overdue" },
          {
            tab: "todo",
            label: "Due this week",
            count: thisWeek.length,
            tone: "mild",
            some: `Tasks and appointments, next ${WEEK} days`,
            none: `Nothing due in the next ${WEEK} days`,
          },
          {
            tab: "todo",
            label: "Waiting on others",
            count: brief.waiting.length,
            tone: "mild",
            some: "Requests the firm is still waiting on",
            none: "Nobody owes the firm anything",
          },
          { tab: "flags", label: "High red flags", count: flagsOf("high"), tone: "urgent", some: "Weaknesses to deal with first", none: "No high red flags" },
        ]}
      />
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
      {(brief.incident.text || file.description) && (
        <section aria-labelledby="incident-heading" className="max-w-prose space-y-1.5">
          <h2 id="incident-heading" className="text-sm font-medium text-muted-foreground">
            What happened
          </h2>
          <p className="font-serif text-[17px] leading-snug">{brief.incident.text || file.description}</p>
          {brief.incident.text && <SourceLinks evidence={brief.incident.evidence} />}
        </section>
      )}
      <Glance {...section} />
      <SinceStrip file={file} today={today} />
    </div>
  );

  const tabs: CaseTab[] = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard />, content: overview },
    {
      id: "todo",
      label: "To do",
      icon: <ListTodo />,
      badges: [
        { tone: "urgent", count: late.length, label: "overdue" },
        { tone: "mild", count: thisWeek.length, label: "due this week" },
      ],
      content: <Attention {...section} />,
    },
    {
      id: "flags",
      label: "Red flags",
      icon: <Flag />,
      badges: [
        { tone: "urgent", count: flagsOf("high"), label: "high" },
        { tone: "mild", count: flagsOf("medium"), label: "medium" },
      ],
      content: <Flags {...section} />,
    },
    { id: "money", label: "Money", icon: <Banknote />, content: <Money {...section} /> },
    { id: "timeline", label: "Timeline", icon: <CalendarDays />, content: <Moments {...section} /> },
    {
      id: "medical",
      label: "Medical",
      icon: <Stethoscope />,
      badges: [{ tone: "mild", count: owedRecords, label: "providers owe the firm records" }],
      content: (
        <div className="space-y-12">
          <Injuries {...section} />
          <Providers {...section} />
        </div>
      ),
    },
    { id: "file", label: "Full file", icon: <FolderOpen />, content: <FullFile file={file} today={today} /> },
    { id: "about", label: "How it was made", icon: <Info />, content: <HowMade {...section} /> },
  ];

  return (
    <SourceProvider file={file}>
      <div className="space-y-8">
        <CaseHeader file={file} photoUrl={photoUrl} />
        {!stored.current && <ReadCase matterId={file.matterId} situation="stale" />}
        <CaseTabs tabs={tabs} />
      </div>
    </SourceProvider>
  );
}
