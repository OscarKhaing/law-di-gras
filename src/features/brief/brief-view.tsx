import { Banknote, CalendarDays, Flag, FolderOpen, LayoutDashboard, ListTodo, Stethoscope } from "lucide-react";
import { overdue, shortDate, upcoming, type CaseFile } from "@/features/cases/schema";
import { addDays, fromToday } from "@/features/cases/words";
import type { ShareStatus } from "@/features/shares/schema";
import { Attention } from "./attention";
import { CaseTabs, StatusTiles, type CaseTab } from "./case-tabs";
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
import { weightOf, type IndexUsage, type SectionProps, type StoredBrief } from "./schema";
import { SinceStrip } from "./since-strip";
import { SourceLinks, SourceProvider } from "./source-panel";

/** Days ahead that count as "this week" in the status counts. */
const WEEK = 7;

/**
 * A case: the header, then one tab per subject. The overview is the ninety-second read on its own
 * (where the case stands, what is new, worth against coverage, what is pressing, the moments that
 * matter), so a reader new to the case never has to know which tab to open; each other tab holds
 * one subject in full. Without a brief: the file as read from Clio and the control that writes it.
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
  const incidentDay = shortDate(brief.incident.date, true);
  const late = overdue(file, today);
  const thisWeek = upcoming(file, today, addDays(today, WEEK));
  const flagsOf = (weight: string) => brief.flags.filter((flag) => weightOf(flag.weight) === weight);
  const owedRecords = brief.people.filter((person) => person.treating && person.owes.trim() !== "").length;

  const overview = (
    <div className="space-y-9">
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

      <StatusTiles
        tiles={[
          { tab: "todo", label: "Overdue", count: late.length, tone: "urgent", some: "Tasks past their due date", none: "Nothing is overdue", first: late[0]?.title },
          {
            tab: "todo",
            label: "Due this week",
            count: thisWeek.length,
            tone: "mild",
            some: `Tasks and appointments, next ${WEEK} days`,
            none: `Nothing due in the next ${WEEK} days`,
            first: thisWeek[0]?.title,
          },
          {
            tab: "todo",
            label: "Waiting on others",
            count: brief.waiting.length,
            tone: "mild",
            some: "Requests the firm is still waiting on",
            none: "Nobody owes the firm anything",
            first: brief.waiting[0] && `${brief.waiting[0].on}: ${brief.waiting[0].what}`,
          },
          {
            tab: "flags",
            label: "High red flags",
            count: flagsOf("high").length,
            tone: "urgent",
            some: "Weaknesses to deal with first",
            none: "No high red flags",
            first: flagsOf("high")[0]?.title,
          },
        ]}
      />

      <Moments {...section} compact />

      <div className="grid items-start gap-x-10 gap-y-8 xl:grid-cols-2">
        <Glance {...section} />
        <Injuries {...section} />
      </div>

      <HowMade {...section} />
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
    { id: "money", label: "Money", icon: <Banknote />, content: null },
    { id: "timeline", label: "Timeline", icon: <CalendarDays />, content: <Moments {...section} /> },
    {
      id: "medical",
      label: "Medical",
      icon: <Stethoscope />,
      badges: [{ tone: "mild", count: owedRecords, label: "providers owe the firm records" }],
      content: <Providers {...section} />,
    },
    {
      id: "flags",
      label: "Red flags",
      icon: <Flag />,
      badges: [
        { tone: "urgent", count: flagsOf("high").length, label: "high" },
        { tone: "mild", count: flagsOf("medium").length, label: "medium" },
      ],
      content: <Flags {...section} />,
    },
    { id: "file", label: "Full file", icon: <FolderOpen />, content: <FullFile file={file} today={today} /> },
  ];

  return (
    <SourceProvider file={file}>
      <div className="space-y-6">
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
        {/* A tab with nothing in it yet is left out. */}
        <CaseTabs tabs={tabs.filter((tab) => tab.content !== null)} />
      </div>
    </SourceProvider>
  );
}
