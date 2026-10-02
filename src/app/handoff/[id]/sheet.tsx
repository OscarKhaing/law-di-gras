import type { ReactNode } from "react";
import { WEIGHTS, weightOf, type CheckedEvidence, type StoredBrief } from "@/features/brief/schema";
import { byRef, firmCosts, firmSpend, overdue, parseSource, shortDate, upcoming, type CaseFile, type Entry } from "@/features/cases/schema";
import { KIND_WORD, addDays, daysBetween, dollars, fromToday, span } from "@/features/cases/words";
import { Stamp } from "./print-controls";

/** How far ahead "due soon" looks on the sheet. */
const AHEAD_DAYS = 30;
/** How many red flags fit the sheet: the heaviest ones. */
const FLAGS_SHOWN = 5;

// ---- Sources, as words: paper cannot be clicked ----

/** A file name without its extension; a long one keeps its end, which says most about what it is. */
function fileName(name: string, length = 40) {
  const bare = name
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/_+/g, " ")
    .trim();
  if (bare.length <= length) return bare;
  const tail = bare.slice(bare.length - length + 1);
  const boundary = tail.search(/[\s-]/);
  return `…${boundary >= 0 && boundary < 12 ? tail.slice(boundary + 1) : tail}`;
}

/** One source in the firm's words: "note, Mar 4, 2031", "task due Mar 9, 2031", a file and its page, a field's name. */
function sourceWords(entry: Entry, page: number | null) {
  if (entry.kind === "document") return page ? `${fileName(entry.title)} p. ${page}` : fileName(entry.title);
  if (entry.kind === "field" || entry.kind === "contact") return `${KIND_WORD[entry.kind]} “${entry.title}”`;
  // On paper every date carries its year.
  const date = shortDate(entry.date, true);
  // A task's date is the day it is due, not the day it was written.
  if (entry.kind === "task") return date ? `task due ${date}` : "task";
  return date ? `${KIND_WORD[entry.kind]}, ${date}` : KIND_WORD[entry.kind];
}

/** Where a statement comes from, each place named once. A source that is not in the case file is left out. */
function citer(file: CaseFile) {
  const entries = byRef(file);
  return (evidence: CheckedEvidence[]) => {
    const labels = evidence.flatMap((item) => {
      const { ref, page } = parseSource(item.source);
      const entry = entries.get(ref);
      return entry ? [sourceWords(entry, page)] : [];
    });
    return [...new Set(labels)];
  };
}

// ---- The pieces of the sheet ----

// Type sizes are in px so the screen shows what the printer will (96 px to the inch): 10.5px is
// about 8pt. Serif is words from the record and the brief; sans is the sheet's own.
const said = "font-serif text-[10.5px]";
const small = "font-sans text-[8.5px] font-normal text-neutral-600";

/** The sources of a statement, run in after it in small grey words. */
function Sources({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return <span className={`${small} not-italic`}> {labels.join("; ")}</span>;
}

// A section may run over onto the next page, but only between rows, and never straight after its
// heading: keeping every section whole would leave half a page empty in front of a long one.
function Section({ title, remark, children }: { title: string; remark?: string; children: ReactNode }) {
  return (
    <section className="border-t border-black pt-1">
      <div className="mb-0.5 flex break-after-avoid items-baseline gap-2">
        <h2 className="font-heading text-[12.5px] font-semibold tracking-tight">{title}</h2>
        {remark && <p className={small}>{remark}</p>}
      </div>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="border-t border-neutral-300 py-0.5 text-neutral-600">{children}</p>;

/** A ledger: rows divided by hairlines, none of them split across two pages. */
const rows = "divide-y divide-neutral-300 border-t border-neutral-300 [&>li]:break-inside-avoid [&>li]:py-0.5";
/** A row with its date, or its weight, in a left column. */
const dated = "grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-2";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className={small}>{label}</dt>
      <dd className="font-serif text-[11.5px] leading-snug">{children}</dd>
    </div>
  );
}

/**
 * One case on paper, for when it changes hands or the attorney wants a page in the file: where it
 * stands, the figures, who the firm is waiting on, the moments, what is late and due, the heaviest
 * red flags and the treating providers. Everything comes from the stored case file and brief; the
 * sums and dates are worked out here, not by a model. Long lines run the full width of the page so
 * each takes one line; only the two lists of short statements sit side by side.
 */
export function HandoffSheet({ file, stored, today }: { file: CaseFile; stored: StoredBrief; today: string }) {
  const { brief } = stored;
  const cite = citer(file);
  const contacts = byRef(file);

  const late = overdue(file, today);
  const soon = upcoming(file, today, addDays(today, AHEAD_DAYS));
  const costs = firmCosts(file);
  const flags = [...brief.flags].sort((a, b) => WEIGHTS.indexOf(weightOf(a.weight)) - WEIGHTS.indexOf(weightOf(b.weight)));
  // Offices that still owe the firm something come first, as they do on the case.
  const treating = brief.people.filter((person) => person.treating);
  const providers = [...treating.filter((person) => person.owes.trim() !== ""), ...treating.filter((person) => person.owes.trim() === "")];

  const untilLimitation = file.limitationDate ? daysBetween(today, file.limitationDate) : Number.NaN;

  return (
    <article className="space-y-2.5 font-sans text-[10px] leading-[1.35] text-black">
      <header className="space-y-1.5">
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            <p className={small}>Handoff sheet{file.firm.name ? `, ${file.firm.name}` : ""}</p>
            <h1 className="font-heading text-[21px] leading-tight font-semibold tracking-tight">{file.client.name || "Client not named in Clio"}</h1>
          </div>
          <p className={`${small} max-w-[17rem] shrink-0 text-right leading-snug`}>
            Read from Clio <Stamp iso={file.syncedAt} />; brief written <Stamp iso={stored.createdAt} />
          </p>
        </div>
        {!stored.current && (
          <p className="border border-black px-2 py-1 font-medium">
            Clio has changed since this brief was written. Update the brief on the case before relying on this sheet.
          </p>
        )}
        <dl className="grid grid-cols-4 gap-x-4 border-t border-black pt-1 max-[560px]:grid-cols-2">
          <Fact label="Matter">
            {file.number}
            {file.practiceArea ? `, ${file.practiceArea.toLowerCase()}` : ""}
          </Fact>
          <Fact label="Stage">{file.stage || "Not in Clio"}</Fact>
          <Fact label="Date of the incident">
            {shortDate(brief.incident.date, true) || "Not in the brief"}
            <Sources labels={cite(brief.incident.evidence)} />
          </Fact>
          <Fact label="Limitation date">
            {Number.isNaN(untilLimitation) ? (
              "Not in Clio"
            ) : (
              <>
                {shortDate(file.limitationDate, true)}
                <span className={small}> {untilLimitation < 0 ? "passed" : fromToday(file.limitationDate, today)}</span>
              </>
            )}
          </Fact>
        </dl>
      </header>

      <Section title="The bottom line">
        {brief.bottomLine.text ? (
          <p className="font-serif text-[13.5px] leading-snug text-pretty">
            {brief.bottomLine.text}
            <Sources labels={cite(brief.bottomLine.evidence)} />
          </p>
        ) : (
          <Empty>The brief gives no bottom line.</Empty>
        )}
      </Section>

      <div className="grid break-inside-avoid grid-cols-2 items-start gap-x-6 gap-y-2.5 max-[560px]:grid-cols-1">
        <Section title="Worth and coverage">
          <ul className={rows}>
            {brief.money.map((figure, index) => (
              <li key={index} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3">
                <p className={said}>
                  {figure.label}
                  {figure.note && <span className="text-neutral-700 italic"> {figure.note}</span>}
                  <Sources labels={cite(figure.evidence)} />
                </p>
                <p className={`${said} text-right font-semibold tabular-nums`}>
                  {dollars(figure.amount)}
                  {figure.kind.trim().toLowerCase() === "coverage" && <span className={`${small} block`}>policy limit</span>}
                </p>
              </li>
            ))}
            <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3">
              <p>
                Spent by the firm so far
                <span className={small}>
                  {" "}
                  {costs.length === 0
                    ? "no costs of the firm's own are entered in Clio"
                    : `the sum of ${costs.length} expense ${costs.length === 1 ? "entry" : "entries"} in Clio`}
                </span>
              </p>
              <p className={`${said} text-right font-semibold tabular-nums`}>{dollars(firmSpend(file))}</p>
            </li>
          </ul>
          {brief.money.length === 0 && <p className="pt-0.5 text-neutral-600">The brief gives no other figures.</p>}
        </Section>

        <Section title="The firm is waiting on">
          {brief.waiting.length === 0 ? (
            <Empty>The firm is waiting on nobody.</Empty>
          ) : (
            <ul className={rows}>
              {brief.waiting.map((item, index) => {
                const asked = [
                  item.asked > 0 ? `asked ${item.asked} ${item.asked === 1 ? "time" : "times"}` : "",
                  shortDate(item.since, true) ? `first on ${shortDate(item.since, true)}` : "",
                ].filter(Boolean);
                return (
                  <li key={index}>
                    <p className={said}>
                      <span className="font-semibold">{item.on}</span>
                      {asked.length > 0 && <span className="font-sans text-[8.5px] font-medium"> {asked.join(", ")}</span>}
                    </p>
                    <p className={said}>
                      {item.what}
                      <Sources labels={cite(item.evidence)} />
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      <Section title="The moments that matter">
        {brief.moments.length === 0 ? (
          <Empty>The brief names no moments.</Empty>
        ) : (
          <ol className={rows}>
            {brief.moments.map((moment, index) => (
              <li key={index} className={dated}>
                <p className="tabular-nums">{shortDate(moment.date, true) || "No date"}</p>
                <p className={said}>
                  {moment.title}
                  <Sources labels={cite(moment.evidence)} />
                </p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section
        title={`Overdue, and due in the next ${AHEAD_DAYS} days`}
        remark={`${late.length} overdue, ${soon.length} coming up; open tasks and the calendar in Clio`}
      >
        {late.length + soon.length === 0 ? (
          <Empty>Nothing is overdue and nothing is due in the next {AHEAD_DAYS} days.</Empty>
        ) : (
          <ul className={rows}>
            {late.map((task) => (
              <li key={task.ref} className="grid grid-cols-[4.25rem_minmax(0,1fr)_auto] gap-x-2">
                <p className="tabular-nums">{shortDate(task.date, true)}</p>
                <p className={said}>{task.title}</p>
                <p className="font-semibold whitespace-nowrap">{span(daysBetween(task.date, today))} late</p>
              </li>
            ))}
            {soon.map((entry) => (
              <li key={entry.ref} className="grid grid-cols-[4.25rem_minmax(0,1fr)_auto] gap-x-2">
                <p className="tabular-nums">{shortDate(entry.date, true)}</p>
                <p className={said}>{entry.title}</p>
                <p className="whitespace-nowrap text-neutral-600">
                  {KIND_WORD[entry.kind]}, {fromToday(entry.date, today)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Red flags"
        remark={flags.length > FLAGS_SHOWN ? `the ${FLAGS_SHOWN} heaviest of ${flags.length}; the rest are on the case` : undefined}
      >
        {flags.length === 0 ? (
          <Empty>The brief raises no red flags.</Empty>
        ) : (
          <ul className={rows}>
            {flags.slice(0, FLAGS_SHOWN).map((flag, index) => (
              <li key={index} className={dated}>
                <p className="font-medium capitalize">{weightOf(flag.weight)}</p>
                <div>
                  <p className={`${said} font-semibold`}>{flag.title}</p>
                  <p className={said}>
                    {flag.detail}
                    <Sources labels={cite(flag.evidence)} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Treating providers" remark="what each has done; the offices that still owe the firm something come first">
        {providers.length === 0 ? (
          <Empty>The brief names no treating providers.</Empty>
        ) : (
          <ul className={rows}>
            {providers.map((person, index) => {
              const contact = contacts.get(parseSource(person.contact).ref);
              return (
                <li key={index} className="grid grid-cols-[24%_minmax(0,1fr)] gap-x-3">
                  <p className={`${said} font-semibold`}>{contact?.kind === "contact" ? contact.title : person.role || "Not named in Clio"}</p>
                  <p className={said}>
                    {person.did}
                    {person.owes.trim() ? (
                      <>
                        <span className="font-sans text-[9px] font-semibold"> Still owes the firm: </span>
                        {person.owes}
                      </>
                    ) : (
                      <span className="font-sans text-[9px] text-neutral-600"> Owes the firm nothing.</span>
                    )}
                    <Sources labels={cite(person.evidence)} />
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <footer className={`${small} break-inside-avoid border-t border-black pt-1 leading-snug`}>
        The small grey words name where a statement comes from in the Clio matter. The brief was written by a model; dates, sums and what is
        overdue are worked out from Clio. Read the source before relying on a line.
      </footer>
    </article>
  );
}
