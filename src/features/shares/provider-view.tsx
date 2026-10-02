import { shortDate } from "@/features/cases/schema";
import { StageTrack } from "@/features/cases/stage-track";
import { SECTIONS, type ProviderUpdate } from "./schema";

// What a treating provider's office sees: the provider's page, and the preview beside the attorney's
// draft. It renders only the frozen ProviderUpdate, so the preview is exactly what will be published.

/** Section headings in the provider's words, in the order the page shows them: requests first. */
export const SECTION_HEADINGS: Record<(typeof SECTIONS)[number], string> = {
  needs: "What we need from your office",
  status: "Where the case stands",
  movement: "What has happened recently",
  attendance: "Your patient's visits",
  "on file": "What we have on file from you",
  coverage: "Insurance",
  "other treatment": "Other treatment",
};
const ORDER = Object.keys(SECTION_HEADINGS);

export function ProviderView({ update }: { update: ProviderUpdate }) {
  const grouped = new Map<string, ProviderUpdate["lines"]>();
  for (const line of update.lines) grouped.set(line.section, [...(grouped.get(line.section) ?? []), line]);
  const sections = [...grouped].sort(([a], [b]) => rank(a) - rank(b));

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-sm text-muted-foreground">{update.firm}</p>
      <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">{update.patient}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        An update for {update.provider} from the law firm representing your patient, published{" "}
        {shortDate(update.publishedAt, true)}.
      </p>

      <div className="mt-6 space-y-1.5 text-sm">
        <p className="text-muted-foreground">Stage of the case</p>
        <StageTrack stage={update.stage} stages={update.stages} />
      </div>

      {sections.length === 0 ? (
        <p className="mt-10 border-t pt-6 text-sm text-muted-foreground">
          The firm has not shared any details in this update. Call them with any questions.
        </p>
      ) : (
        <dl className="mt-10 divide-y border-y">
          {sections.map(([section, lines]) => (
            <div key={section} className="grid gap-x-6 gap-y-1.5 py-4 sm:grid-cols-[12rem_1fr]">
              <dt className="text-sm font-medium">{heading(section)}</dt>
              <dd className="space-y-2 text-sm leading-relaxed">
                {lines.map((line) => (
                  <p key={line.id}>{line.text}</p>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-8 space-y-1 text-sm">
        <p className="font-medium">Questions about this case</p>
        <p className="whitespace-pre-line text-muted-foreground">{update.contactLine}</p>
      </div>

      <p className="mt-10 text-xs text-muted-foreground">
        This page was checked by an attorney before it was shared. The link works until{" "}
        {shortDate(update.expiresAt, true)}.
      </p>
    </main>
  );
}

function rank(section: string) {
  const index = ORDER.indexOf(section);
  return index === -1 ? ORDER.length : index;
}

function heading(section: string) {
  return SECTION_HEADINGS[section as keyof typeof SECTION_HEADINGS] ?? section;
}
