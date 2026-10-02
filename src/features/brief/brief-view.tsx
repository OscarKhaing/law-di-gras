import { Banknote, CalendarDays, Flag, FolderOpen, Info, LayoutDashboard, ListTodo, Stethoscope } from "lucide-react";
import { Panel } from "@/components/panel";
import { StatusPill } from "@/components/status";
import { overdue, shortDate, upcoming, type CaseFile } from "@/features/cases/schema";
import { addDays, daysBetween } from "@/features/cases/words";
import type { ShareStatus } from "@/features/shares/schema";
import type { PageNote } from "@/features/documents/schema";
import { Attention } from "./attention";
import { Bills } from "./bills";
import { CaseTabs, StatusTiles, type CaseTab } from "./case-tabs";
import { Flags } from "./flags";
import { FullFile } from "./full-file";
import { Glance } from "./glance";
import { Chase } from "./chase";
import { CaseHeader } from "./header";
import { HowMade } from "./how-made";
import { Injuries } from "./injuries";
import { Moments } from "./moments";
import { Money } from "./money";
import { Providers } from "./providers";
import { ReadCase } from "./read-case";
import { Settlement } from "./settlement";
import { Treatment } from "./treatment";
import { weightOf, type IndexUsage, type SectionProps, type StoredBrief } from "./schema";
import { SinceStrip } from "./since-strip";
import { SourceLinks, SourceProvider } from "./source-panel";

/** Days ahead that count as "this week" on the overview and the To do tab. */
const WEEK = 7;
/** A limitation date this close is shown in red, as it is under At a glance. */
const LIMITATION_WARNING = 90;

/**
 * A case: who it is about and a menu of its parts in a side column, the open part beside it. The
 * overview is the ninety-second read on its own: what is pressing, where the case stands, what is
 * new, worth against coverage and the moments that matter, so a reader new to the case never has
 * to know which part to open. Each other part holds one subject of the brief in full.
 * Without a brief: the file as read from Clio and the control that writes the brief.
 */
export function BriefView({
  file,
  stored,
  shares,
  index,
  pages,
  today,
  photoUrl,
}: {
  file: CaseFile;
  stored: StoredBrief | null;
  shares: ShareStatus[];
  index: IndexUsage | null;
  pages: Record<string, PageNote[]>;
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

  const section: SectionProps = { file, stored, shares, index, pages, today };
  const { brief } = stored;
  const late = overdue(file, today);
  const thisWeek = upcoming(file, today, addDays(today, WEEK));
  const flagsOf = (weight: string) => brief.flags.filter((flag) => weightOf(flag.weight) === weight).length;
  const owedRecords = brief.people.filter((person) => person.treating && person.owes.trim() !== "").length;

  const untilLimitation = file.limitationDate ? daysBetween(today, file.limitationDate) : Number.NaN;

  // What must stay in view whatever part is open: the deadline that can end the case, and what is late.
  const vitals = (
    <dl className="space-y-3 text-sm">
      <div className="space-y-1">
        <dt className="text-xs text-muted-foreground">Limitation date</dt>
        <dd>
          {Number.isNaN(untilLimitation) ? (
            <span className="text-muted-foreground">Not in Clio</span>
          ) : untilLimitation >= 0 && untilLimitation <= LIMITATION_WARNING ? (
            <StatusPill tone="urgent">{shortDate(file.limitationDate, true)}</StatusPill>
          ) : (
            <span className="font-serif">
              {shortDate(file.limitationDate, true)}
              {untilLimitation < 0 && <span className="ml-1 font-sans text-xs text-muted-foreground">passed</span>}
            </span>
          )}
        </dd>
      </div>
      <div className="space-y-1">
        <dt className="text-xs text-muted-foreground">Overdue tasks</dt>
        <dd>
          <StatusPill tone={late.length > 0 ? "urgent" : "done"}>{late.length > 0 ? `${late.length} overdue` : "None"}</StatusPill>
        </dd>
      </div>
    </dl>
  );

  const overview = (
    <div className="space-y-8">
      <div className="space-y-4">
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
        <section aria-labelledby="bottom-line" className="space-y-3 rounded-2xl border border-primary/15 bg-primary/[0.04] p-6">
          <h2 id="bottom-line" className="text-sm font-medium text-primary">
            The bottom line
          </h2>
          {brief.bottomLine.text ? (
            <>
              <p className="max-w-[46rem] font-serif text-2xl leading-snug text-pretty">{brief.bottomLine.text}</p>
              <SourceLinks evidence={brief.bottomLine.evidence} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">The brief gives no bottom line. Update the brief to write one.</p>
          )}
        </section>
        {(brief.incident.text || file.description) && (
          <Panel aria-labelledby="incident-heading" role="region" className="space-y-1.5">
            <h2 id="incident-heading" className="text-sm font-medium text-muted-foreground">
              What happened
            </h2>
            <p className="max-w-prose font-serif text-[17px] leading-snug">{brief.incident.text || file.description}</p>
            {brief.incident.text && <SourceLinks evidence={brief.incident.evidence} />}
          </Panel>
        )}
      </div>
      <SinceStrip file={file} today={today} />
      <Panel>
        <Money {...section} overview />
      </Panel>
      <Panel>
        <Moments {...section} compact />
      </Panel>
      <Panel>
        <Glance {...section} />
      </Panel>
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
      content: (
        <div className="space-y-6">
          <Panel>
            <Chase {...section} />
          </Panel>
          <Panel>
            <Attention {...section} />
          </Panel>
        </div>
      ),
    },
    {
      id: "flags",
      label: "Red flags",
      icon: <Flag />,
      badges: [
        { tone: "urgent", count: flagsOf("high"), label: "high" },
        { tone: "mild", count: flagsOf("medium"), label: "medium" },
      ],
      content: (
        <Panel>
          <Flags {...section} />
        </Panel>
      ),
    },
    {
      id: "money",
      label: "Money",
      startsGroup: true,
      icon: <Banknote />,
      content: (
        <div className="space-y-6">
          <Panel>
            <Settlement {...section} />
          </Panel>
          <Panel>
            <Bills {...section} />
          </Panel>
          <Panel>
            <Money {...section} />
          </Panel>
        </div>
      ),
    },
    {
      id: "timeline",
      label: "Timeline",
      icon: <CalendarDays />,
      content: (
        <Panel>
          <Moments {...section} />
        </Panel>
      ),
    },
    {
      id: "medical",
      label: "Medical",
      icon: <Stethoscope />,
      badges: [{ tone: "mild", count: owedRecords, label: "providers owe the firm records" }],
      content: (
        <div className="space-y-6">
          <Panel>
            <Treatment {...section} />
          </Panel>
          <Panel>
            <Injuries {...section} />
          </Panel>
          <Panel>
            <Providers {...section} />
          </Panel>
        </div>
      ),
    },
    { id: "file", label: "Full file", icon: <FolderOpen />, startsGroup: true, content: <FullFile file={file} today={today} /> },
    { id: "about", label: "How it was made", icon: <Info />, content: (
        <Panel>
          <HowMade {...section} />
        </Panel>
      ),
    },
  ];

  return (
    <SourceProvider file={file}>
      <CaseTabs
        side={
          <>
            <CaseHeader file={file} photoUrl={photoUrl} vitals={vitals} />
            {/* The app's own sidebar counts cases; this menu counts things inside this one. */}
            <p className="px-1 pt-1 text-xs font-medium text-muted-foreground">In this case</p>
          </>
        }
        notice={!stored.current && <ReadCase matterId={file.matterId} situation="stale" />}
        tabs={tabs}
      />
    </SourceProvider>
  );
}
