// Check the time-on-desk rule on worked cases, without a browser or the case file:
//   pnpm -s script scripts/check-time.ts
// Every entry here is made up for the check; none comes from a case.
import type { CallLog } from "@/features/calls/schema";
import type { CaseFile, Entry, EntryKind } from "@/features/cases/schema";
import type { PageNote } from "@/features/documents/schema";
import { RULES, byPhase, firmMembers, hours, timeOnDesk, totals, worth, type TimeRow } from "@/features/time/schema";

let failures = 0;
function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `  (got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)})`}`);
}

const LAWYER = "Ada Lawyer";
const PARALEGAL = "Pat Paralegal";
const ADJUSTER = "Quinn Adjuster";
const TODAY = "2030-06-15";

const text = (count: number) => Array.from({ length: count }, () => "word").join(" ");
const pagesOf = (count: number): PageNote[] =>
  Array.from({ length: count }, (_, index) => ({ page: index + 1, kind: "letter", provider: "", date: "", facts: [] }));

let next = 0;
function entry(kind: EntryKind, ref: string, patch: Partial<Entry> = {}): Entry {
  next += 1;
  return {
    ref,
    kind,
    clioId: String(next),
    etag: "",
    date: "2030-03-01",
    title: `${kind} ${ref}`,
    text: "",
    people: [],
    facts: {},
    createdAt: "",
    updatedAt: "",
    ...patch,
  };
}

function fileOf(entries: Entry[]): CaseFile {
  return {
    matterId: 1,
    number: "1",
    description: "",
    status: "Open",
    stage: "Two",
    stages: ["One", "Two", "Three"],
    practiceArea: "",
    openDate: "",
    limitationDate: "",
    client: { ref: "P1", name: "Casey Client" },
    firm: { name: "Firm", user: LAWYER, email: "" },
    entries,
    syncedAt: "",
    fingerprint: "",
  };
}

function call(id: string, patch: Partial<CallLog> = {}): CallLog {
  return {
    id,
    matterId: 1,
    contactRef: null,
    contactName: ADJUSTER,
    toNumber: "",
    placedBy: PARALEGAL,
    status: "completed",
    startedAt: "2030-04-02T15:00:00.000Z",
    answeredAt: null,
    endedAt: null,
    seconds: 185,
    transcript: [],
    summary: null,
    ...patch,
  };
}

const sent = (ref: string, count: number) =>
  entry("email", ref, { text: text(count), facts: { from: LAWYER, to: ADJUSTER }, people: [LAWYER, ADJUSTER] });
const event = (ref: string, startAt: string, endAt: string, patch: Partial<Entry> = {}) =>
  entry("event", ref, { date: startAt.slice(0, 10), facts: { startAt, endAt, allDay: false }, ...patch });

const one = (entries: Entry[], pages: Record<string, PageNote[]> = {}, calls: CallLog[] = [], rules = RULES) =>
  timeOnDesk(fileOf(entries), pages, calls, rules, TODAY);
const only = (rows: TimeRow[]) => rows.map((row) => [row.kind, row.minutes, row.basis, row.person]);

// 1. Notes: six minutes, twelve over 150 words; the person is the author.
check("a short note is 6 minutes, estimated, the author's", only(one([entry("note", "N1", { text: text(40), people: [PARALEGAL] })])), [
  ["note", 6, "estimated", PARALEGAL],
]);
check("a note of exactly 150 words is still 6", one([entry("note", "N1", { text: text(150), people: [LAWYER] })])[0].minutes, 6);
check("a note of 151 words is 12", one([entry("note", "N1", { text: text(151), people: [LAWYER] })])[0].minutes, 12);
check("an empty note still takes the six-minute floor", one([entry("note", "N1", { people: [LAWYER] })])[0].minutes, 6);

// 2. Emails the firm sent, by length: up to 100 words 6, up to 300 words 12, more 18.
check("a sent email of 100 words is 6, the sender's", only(one([sent("M1", 100)])), [["sent", 6, "estimated", LAWYER]]);
check("a sent email of 101 words is 12", one([sent("M1", 101)])[0].minutes, 12);
check("a sent email of 300 words is 12", one([sent("M1", 300)])[0].minutes, 12);
check("a sent email of 301 words is 18", one([sent("M1", 301)])[0].minutes, 18);

// 3. An email the firm received: 6 minutes to read, however long, under the firm's user.
check(
  "a received email is 6 to read, however long",
  only(one([entry("email", "M2", { text: text(900), facts: { from: ADJUSTER, to: LAWYER }, people: [ADJUSTER, LAWYER] })])),
  [["read", 6, "estimated", LAWYER]],
);
// A paralegal is known as the firm's from a note they wrote, so their email counts as sent.
check(
  "an email from someone who wrote a note is the firm's own",
  only(
    one([
      entry("note", "N1", { people: [PARALEGAL] }),
      entry("email", "M3", { text: text(10), facts: { from: PARALEGAL, to: ADJUSTER }, date: "2030-02-01" }),
    ]),
  ),
  [
    ["note", 6, "estimated", PARALEGAL],
    ["sent", 6, "estimated", PARALEGAL],
  ],
);

// 4. A call logged in Clio: 12 minutes, estimated.
check("a logged call is 12, estimated", only(one([entry("call", "M4", { facts: { from: LAWYER, to: ADJUSTER }, people: [LAWYER, ADJUSTER] })])), [
  ["call", 12, "estimated", LAWYER],
]);

// 5. Documents: 60 pages an hour, at least 6 minutes, rounded up to a tenth of an hour.
check("a 3-page document takes the least, 6", one([entry("document", "D1")], { D1: pagesOf(3) })[0].minutes, 6);
check("a 60-page document is 60", one([entry("document", "D1")], { D1: pagesOf(60) })[0].minutes, 60);
check("a 61-page document rounds up to 66", one([entry("document", "D1")], { D1: pagesOf(61) })[0].minutes, 66);
check("a document that has not been indexed gets the least", only(one([entry("document", "D1")])), [["document", 6, "estimated", LAWYER]]);
check(
  "a slower reading rate takes longer",
  one([entry("document", "D1")], { D1: pagesOf(60) }, [], { ...RULES, pagesPerHour: 30 })[0].minutes,
  120,
);

// 6. A call placed through Case Desk: its real length, rounded up to the minute. Measured.
check("a call of 3 min 5 s is 4 minutes, measured, the caller's", only(one([], {}, [call("a")])), [["desk-call", 4, "measured", PARALEGAL]]);
check("a call of exactly 2 minutes is 2", one([], {}, [call("a", { seconds: 120 })])[0].minutes, 2);
check("a call still in progress has no time yet", one([], {}, [call("a", { seconds: null })]), []);
check("a call nobody answered has no time", one([], {}, [call("a", { seconds: 0 })]), []);
// The same call written up in Clio afterwards is not counted a second time.
check(
  "a call placed through Case Desk and logged in Clio the same day counts once",
  only(one([entry("call", "M5", { date: "2030-04-02", people: [PARALEGAL, ADJUSTER] })], {}, [call("a")])),
  [["desk-call", 4, "measured", PARALEGAL]],
);
check(
  "a logged call on another day is its own work",
  one([entry("call", "M5", { date: "2030-04-09", people: [PARALEGAL, ADJUSTER] })], {}, [call("a")]).length,
  2,
);

// 7. Calendar entries: the length from start to end, measured, once the day has passed.
const hearing = event("E1", "2030-05-01T14:00:00.000Z", "2030-05-01T14:45:00.000Z", { people: [LAWYER] });
check("a 45-minute calendar entry a member attended is 45, measured", only(one([hearing])), [["meeting", 45, "measured", LAWYER]]);
check("a calendar entry in the future has no time", one([event("E2", "2030-07-01T14:00:00.000Z", "2030-07-01T15:00:00.000Z", { people: [LAWYER] })]), []);
check("a calendar entry today has no time yet", one([event("E2", `${TODAY}T14:00:00.000Z`, `${TODAY}T15:00:00.000Z`, { people: [LAWYER] })]), []);
check(
  "a two-day calendar entry is held to a working day",
  one([event("E3", "2030-05-01T09:00:00.000Z", "2030-05-03T09:00:00.000Z", { people: [LAWYER] })])[0].minutes,
  480,
);
check("a calendar entry with no end has no time", one([entry("event", "E4", { facts: { startAt: "2030-05-01T09:00:00.000Z" }, people: [LAWYER] })]), []);
check(
  "an all-day calendar entry has no time",
  one([event("E5", "2030-05-01T00:00:00.000Z", "2030-05-02T00:00:00.000Z", { people: [LAWYER], facts: { startAt: "2030-05-01T00:00:00.000Z", endAt: "2030-05-02T00:00:00.000Z", allDay: true } })]),
  [],
);
const unattended = event("E6", "2030-05-01T14:00:00.000Z", "2030-05-01T15:00:00.000Z");
check("a calendar entry naming no one from the firm is left out by default", one([unattended]), []);
check("and counts, under the firm's user, when the rule says so", only(one([unattended], {}, [], { ...RULES, calendarUnattended: true })), [
  ["meeting", 60, "measured", LAWYER],
]);

// 8. Nothing for a task, an expense, a custom field or a contact.
check(
  "tasks, expenses, fields and contacts carry no time",
  one([entry("task", "T1", { people: [LAWYER] }), entry("expense", "X1", { facts: { amount: 50 } }), entry("field", "F1"), entry("contact", "P2")]),
  [],
);

// 9. The same entry twice is counted once.
check("an entry that appears twice counts once", one([sent("M1", 10), sent("M1", 10)]).length, 1);

// 10. A whole file: the total is the sum of the rows, and so is every way of dividing it.
const whole = one(
  [
    entry("note", "N1", { text: text(200), people: [PARALEGAL], date: "2030-01-10" }), // 12
    entry("note", "N2", { text: text(20), people: [LAWYER], date: "2030-02-10" }), // 6
    { ...sent("M1", 250), date: "2030-02-11" }, // 12
    entry("email", "M2", { facts: { from: ADJUSTER, to: LAWYER }, date: "2030-03-11" }), // 6
    entry("call", "M3", { people: [LAWYER, ADJUSTER], date: "2030-03-12" }), // 12
    entry("document", "D1", { date: "2030-03-20" }), // 90 pages: 90
    { ...hearing }, // 45, measured
    entry("task", "T1"),
  ],
  { D1: pagesOf(90) },
  [call("a")], // 4, measured, 2030-04-02
);
const sum = totals(whole);
const added = whole.reduce((minutes, row) => minutes + row.minutes, 0);
check("the worked file comes to 187 minutes", added, 12 + 6 + 12 + 6 + 12 + 90 + 45 + 4);
check("the total equals the sum of the rows", sum.minutes, added);
check("measured and estimated add up to the total", sum.measured + sum.estimated, sum.minutes);
check("measured is the calendar entry and the call", sum.measured, 49);
check("the people add up to the total", sum.byPerson.reduce((minutes, row) => minutes + row.minutes, 0), sum.minutes);
check("the kinds of work add up to the total", sum.byKind.reduce((minutes, row) => minutes + row.minutes, 0), sum.minutes);
check("by person, largest first", sum.byPerson.map((row) => [row.person, row.minutes, row.measured]), [
  [LAWYER, 171, 45],
  [PARALEGAL, 16, 4],
]);
check("by kind, largest first", sum.byKind.map((row) => [row.kind, row.minutes]), [
  ["document", 90],
  ["meeting", 45],
  ["note", 18],
  ["sent", 12],
  ["call", 12],
  ["read", 6],
  ["desk-call", 4],
]);
check("rows come newest first", whole.map((row) => row.id), ["E1", "call a", "D1", "M3", "M2", "M1", "N2", "N1"]);
check("the firm's members are its user, note authors and callers", firmMembers(fileOf([entry("note", "N1", { people: [PARALEGAL] })]), []), [LAWYER, PARALEGAL]);

// 11. Hours to one decimal, and what they are worth.
check("90 minutes is 1.5 hours", hours(90), "1.5");
check("6 minutes is 0.1", hours(6), "0.1");
check("no minutes is 0.0", hours(0), "0.0");
check("187 minutes is 3.1", hours(187), "3.1");
check("90 minutes at 300 an hour is 450", worth(90, 300), 450);
check("no rate is no worth", worth(90, 0), 0);

// 12. By phase: a row falls in the phase its date is in; what comes before the first known start stands apart.
const phases = byPhase(whole, [
  { stage: "One", date: "2030-02-01", ref: "N2" },
  { stage: "Two", date: "", ref: "" },
  { stage: "Three", date: "2030-03-12", ref: "M3" },
]);
check("by phase", phases.map((phase) => [phase.stage, phase.minutes, phase.count]), [
  ["", 12, 1],
  ["One", 24, 3],
  ["Three", 151, 4],
]);
check("the phases add up to the total", phases.reduce((minutes, phase) => minutes + phase.minutes, 0), sum.minutes);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
