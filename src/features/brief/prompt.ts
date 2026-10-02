import type { CaseFile, Entry } from "@/features/cases/schema";
import type { PageNote } from "@/features/documents/schema";

// The instructions for writing a brief. They are about personal injury files in general: nothing
// here may describe a particular case.

export const SYSTEM = `You brief lawyers and case managers at a personal injury firm on a case file they have not seen before.

You are given everything the firm's case management system holds on one matter: custom fields, people, notes, emails, phone calls, tasks, calendar entries, expenses, and an index of what is on each page of its documents. Each item starts with a ref in square brackets, such as [N12], [M45], [T3], [E7], [X2], [D9], [F4] or [P3].

Your reader has ninety seconds. Write what a careful senior paralegal would tell them at the door: where the case stands, what it is worth and what limits that, what is stuck and on whom, and what could hurt it.

Rules:
- Report only what the file states. Do not advise, predict, or add law the file does not mention. If the file does not say, leave the field empty rather than guess.
- Every statement must carry evidence: the refs it rests on. For a page of a document, write the ref and the page, like "D9 p.212". Use the refs exactly as given.
- A quote must be copied character for character from the item it is attributed to, at most 25 words, with no ellipsis and nothing added. If you cannot quote exactly, leave the quote empty and keep the ref.
- Prefer the item that records the fact first hand (the email that said it, the page that shows it) over a summary of it.
- Write plainly and briefly, in complete sentences, in the vocabulary of a personal injury practice. No headings, no bullet characters, no markdown.
- Dates are YYYY-MM-DD. Amounts are plain numbers of US dollars.
- An expense marked "charge, not paid by the firm" is a bill recorded on the matter, such as a provider's charges; it is not the firm's own spending.
- Do not flag a limitation date that has passed if the file shows suit was filed or the deadline was otherwise met.
- For people, use the ref of the contact ([P...]). Mark as treating only medical providers who treated the client.
- A contradiction needs evidence for each side, each with its own quote.`;

const KIND_LABEL: Record<Entry["kind"], string> = {
  field: "custom field",
  contact: "person",
  note: "note",
  email: "email",
  call: "phone call",
  task: "task",
  event: "calendar entry",
  expense: "expense",
  document: "document",
};

function describe(entry: Entry): string {
  const head = [`[${entry.ref}]`, KIND_LABEL[entry.kind]];
  if (entry.date) head.push(entry.date);
  if (entry.title) head.push(`"${entry.title}"`);
  const facts = entry.facts;
  if (entry.kind === "email" || entry.kind === "call") head.push(`from ${facts.from || "unknown"} to ${facts.to || "unknown"}`);
  if (entry.kind === "task") head.push(`status ${facts.status}${facts.priority ? `, priority ${facts.priority}` : ""}, due ${entry.date || "no date"}`);
  if (entry.kind === "event" && facts.location) head.push(`at ${facts.location}`);
  if (entry.kind === "expense") head.push(`$${facts.amount}${facts.billable === false ? " (charge, not paid by the firm)" : " (paid by the firm)"}`);
  if (entry.kind === "contact") {
    head.push(facts.isClient ? "the client" : `role: ${facts.role || "not stated"}`);
    if (entry.people.length) head.push(`at ${entry.people.join(", ")}`);
  }
  if (entry.kind === "document") head.push(`in folder "${facts.folder}"`);
  if (entry.kind === "note" && entry.people.length) head.push(`by ${entry.people.join(", ")}`);
  const body = entry.kind === "contact" || entry.kind === "document" ? "" : entry.text;
  return body ? `${head.join(" ")}\n${body}` : head.join(" ");
}

function describePages(ref: string, notes: PageNote[]): string {
  return [...notes]
    .sort((a, b) => a.page - b.page)
    .map((note) => {
      const head = [`${ref} p.${note.page}`, note.kind, note.provider, note.date].filter(Boolean).join(" | ");
      const facts = note.facts.map((fact) => `  - ${fact.text}${fact.quote ? ` ("${fact.quote}")` : ""}`).join("\n");
      return facts ? `${head}\n${facts}` : head;
    })
    .join("\n");
}

const SECTIONS: [string, Entry["kind"][]][] = [
  ["CUSTOM FIELDS", ["field"]],
  ["PEOPLE", ["contact"]],
  ["NOTES", ["note"]],
  ["EMAILS AND PHONE CALLS", ["email", "call"]],
  ["TASKS", ["task"]],
  ["CALENDAR", ["event"]],
  ["EXPENSES", ["expense"]],
  ["DOCUMENTS", ["document"]],
];

/** The whole file as text the model can cite from, followed by what to write. */
export function buildPrompt(file: CaseFile, pages: Record<string, PageNote[]>, today: string): string {
  const parts: string[] = [
    `Today is ${today}.`,
    `MATTER ${file.number}: ${file.description}`,
    `Practice area: ${file.practiceArea}. Status: ${file.status}. Stage: ${file.stage} (stages in order: ${file.stages.join(", ")}).`,
    `Opened ${file.openDate || "date not recorded"}. Limitation date ${file.limitationDate || "not recorded"}. Client: ${file.client.name} [${file.client.ref}].`,
  ];
  for (const [title, kinds] of SECTIONS) {
    const entries = file.entries
      .filter((entry) => kinds.includes(entry.kind))
      .sort((a, b) => (kinds[0] === "field" || kinds[0] === "contact" ? 0 : a.date.localeCompare(b.date)));
    if (entries.length === 0) continue;
    parts.push(`\n===== ${title} =====`, entries.map(describe).join("\n\n"));
  }
  const indexed = file.entries.filter((entry) => entry.kind === "document" && pages[entry.ref]?.length);
  if (indexed.length > 0) {
    parts.push(
      "\n===== WHAT IS ON THE PAGES OF THE DOCUMENTS =====",
      "Each line is one page: ref and page, what the page is, who it is from, its date, then facts read on it with the words they were read from.",
      indexed.map((entry) => `--- [${entry.ref}] "${entry.title}"\n${describePages(entry.ref, pages[entry.ref])}`).join("\n\n"),
    );
  }
  parts.push(
    "\n===== WHAT TO WRITE =====",
    "Write the brief for this matter in the required structure. For money, give the few totals a lawyer weighs, at most eight: the estimated value, the limit that caps recovery (other coverage only if it could add to the recovery), medical specials to date, wage loss claimed, each lien, and each demand or offer the file gives an amount for. Do not list charges provider by provider and do not add figures together into new ones. Choose the ten moments someone picking up the file must know, not routine correspondence. For waiting, count how many times the firm asked, from the emails, calls and notes. For flags, look for accounts that disagree with each other, statements contradicted by documents, work that was planned and never done, and figures the file itself calls incomplete. For injuries and for what a provider did, cite the pages of the records where the index has them.",
  );
  return parts.join("\n");
}

// ---- A follow-up to someone the firm is waiting on ----

export const FOLLOW_UP_SYSTEM = `You draft a follow-up email for a personal injury law firm to someone who owes the firm a reply, a document or a date. A person at the firm will read it, change it and send it themselves; nothing you write is sent automatically.

You are given one request the firm is waiting on and the entries of the firm's file that record it: emails, phone calls, notes and documents, each with its date and who it was from and to. That is everything you know about the case.

Rules:
- Write from the named person at the firm to the recipient named under TO. Courteous, factual and brief: the body is under 130 words.
- Say what was asked for and when, giving the date of each earlier request you mention as it appears on its entry. If the recipient answered, say what they answered and when.
- Ask for what is still outstanding, and ask the recipient to say by what date they will provide it.
- State nothing that is not in the entries given. Never give a number of earlier requests unless an entry itself states it or the entries shown add up to it. Do not invent a deadline, a telephone number, a file or claim number, an attachment or a consequence.
- A note is the firm's internal record, and a message to or from anyone other than the recipient is background. Use them to understand the request; never repeat to the recipient their wording, their reasoning or anything they reveal.
- The date on a document is the day it was put in the firm's file, not the date written on the document itself. Do not give it as the document's date.
- Give no view on liability, fault, what the claim is worth, settlement or the firm's tactics. Do not say why the firm needs the item unless a message already sent to this same recipient said so.
- The codes in square brackets are the firm's own filing marks. Never put them in the email.
- Plain text only, in short paragraphs: no markdown, no lists, no bullet characters, no placeholders in square brackets. Begin with a salutation, end with the sender's name and the firm's name, and write dates in words, such as March 5, 2025.
- The subject is one short plain line naming the client and what is requested.`;

/** What a follow-up is drafted from: one request and the entries that record it, and nothing else of the case. */
export type FollowUpMaterial = {
  today: string;
  /** Who signs it: the firm's person as Clio names them, and the firm. */
  sender: { person: string; firm: string };
  client: string;
  /** Who the email goes to and what they are to the firm, and who owes the item as the brief names them. */
  recipient: { name: string; relation: string; owedBy: string };
  what: string;
  /** The entries the brief cites for this request, oldest first, with any passage it quoted from a page of a document. */
  cited: { entry: Entry; passages: { page: number; quote: string }[] }[];
};

/** One request and its own thread as text, followed by what to write. */
export function buildFollowUpPrompt(material: FollowUpMaterial): string {
  const { sender, recipient } = material;
  const parts = [
    `Today is ${material.today}.`,
    `FROM: ${sender.person ? `${sender.person} at ${sender.firm}` : sender.firm}`,
    `THE FIRM'S CLIENT: ${material.client}`,
    `TO: ${recipient.name}, ${recipient.relation}`,
    `STILL OUTSTANDING, in the firm's own summary: ${material.what}${recipient.owedBy !== recipient.name ? ` (owed by: ${recipient.owedBy})` : ""}`,
    "\n===== THE ENTRIES THAT RECORD THIS REQUEST, OLDEST FIRST =====",
    material.cited
      .map(({ entry, passages }) =>
        [describe(entry), ...passages.map((passage) => `Page ${passage.page} reads: "${passage.quote}"`)].join("\n"),
      )
      .join("\n\n"),
    "\n===== WHAT TO WRITE =====",
    "Write the follow-up email for this one request: its subject line and its body.",
  ];
  return parts.join("\n");
}
