import { createHash } from "node:crypto";
import { clioDownload, clioGet, clioGetOne, isConnected } from "@/server/clio";
import { supabase } from "@/server/supabase";
import { clioMatterId, isFreshRead, type CaseFile, type CaseSummary, type Entry, type EntryKind } from "./schema";

// Reading cases. `syncCase` reads a matter from Clio and keeps it in the `case_files` table as one
// CaseFile; the screens read that, so opening a case never calls Clio.

const BUCKET = "documents";

// What to ask Clio for. Its default is id and etag only; nested records take one level of braces.
const FIELDS = {
  matterList: "id,display_number,description,status,client{id,name},matter_stage{id,name}",
  matter:
    "id,etag,display_number,description,status,open_date,client{id,name},practice_area{id,name},matter_stage{id,name}," +
    "statute_of_limitations{id,due_at,status}," +
    "custom_field_values{id,field_name,field_type,value,field_display_order,updated_at,custom_field}",
  contacts:
    "id,etag,name,type,title,is_client,relationship_name,primary_email_address,primary_phone_number,created_at,updated_at,company{id,name}",
  notes: "id,etag,subject,detail,detail_text_type,date,created_at,updated_at,author{id,name}",
  communications:
    "id,etag,type,subject,body,date,created_at,updated_at,senders{id,type,name},receivers{id,type,name}",
  tasks:
    "id,etag,name,description,description_text_type,status,priority,due_at,completed_at,created_at,updated_at,assignee{id,type,name}",
  calendar: "id,etag,summary,description,location,start_at,end_at,all_day,created_at,updated_at,attendees{id,type,name}",
  activities: "id,etag,type,date,quantity,price,total,note,non_billable,created_at,updated_at,user{id,name}",
  documents:
    "id,etag,name,content_type,received_at,created_at,updated_at,parent{id,name},latest_document_version{id,size,content_type,fully_uploaded}",
  stages: "id,name,order",
  user: "id,name,email,account{id,name}",
};

type Named = { id: number; name: string } | null;
type Stamped = { id: number | string; etag: string; created_at: string; updated_at: string };
type ClioMatter = {
  id: number;
  etag: string;
  display_number: string;
  description: string | null;
  status: string;
  open_date: string | null;
  client: Named;
  practice_area: Named;
  matter_stage: Named;
  statute_of_limitations: { due_at: string | null } | null;
  custom_field_values: {
    id: string | null;
    field_name: string;
    field_type: string;
    value: string | number | boolean | null;
    field_display_order: number;
    updated_at: string;
    custom_field: { id: number; etag: string } | null;
  }[];
};
type ClioContact = Stamped & {
  name: string;
  type: string;
  title: string | null;
  is_client: boolean;
  relationship_name: string | null;
  primary_email_address: string | null;
  primary_phone_number: string | null;
  company: Named;
};
type ClioNote = Stamped & { subject: string | null; detail: string | null; detail_text_type: string | null; date: string | null; author: Named };
type ClioCommunication = Stamped & {
  type: string;
  subject: string | null;
  body: string | null;
  date: string | null;
  senders: { name: string }[] | null;
  receivers: { name: string }[] | null;
};
type ClioTask = Stamped & {
  name: string;
  description: string | null;
  description_text_type: string | null;
  status: string;
  priority: string | null;
  due_at: string | null;
  completed_at: string | null;
  assignee: Named;
};
type ClioEvent = Stamped & {
  summary: string | null;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  attendees: { name: string }[] | null;
};
type ClioActivity = Stamped & {
  type: string;
  date: string | null;
  quantity: number | null;
  price: number | null;
  total: number | null;
  note: string | null;
  non_billable: boolean | null;
  user: Named;
};
type ClioDocument = Stamped & {
  name: string;
  content_type: string | null;
  received_at: string | null;
  parent: Named;
  latest_document_version: { id: number; size: number | null; content_type: string | null; fully_uploaded: boolean } | null;
};

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Clio escapes some text as HTML ("client&#39;s"); turn the entities back into characters. */
function decode(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? whole;
    const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

/** Text from Clio as plain text: rich text comes as simple HTML, and any text may carry entities. */
function plain(text: string | null | undefined, type?: string | null) {
  if (!text) return "";
  if (type !== "rich_text") return decode(text).trim();
  return decode(
    text
      .replace(/<\s*(br|\/p|\/div|\/li)\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A Clio timestamp as the UTC day it falls on. Clio stores calendar and received times in UTC. */
const utcDay = (stamp: string | null | undefined) => (stamp ? new Date(stamp).toISOString().slice(0, 10) : "");
const iso = (stamp: string | null | undefined) => (stamp ? new Date(stamp).toISOString() : "");
const names = (people: { name: string }[] | null | undefined) => (people ?? []).map((person) => person.name).filter(Boolean);
const firstLine = (text: string) => text.split(/[\n:]/)[0].trim().slice(0, 120);

// One letter per kind, so a ref says what it points at: F field, P person, N note, M message
// (email or call), T task, E calendar entry, X expense, D document.
const LETTER: Record<EntryKind, string> = {
  field: "F",
  contact: "P",
  note: "N",
  email: "M",
  call: "M",
  task: "T",
  event: "E",
  expense: "X",
  document: "D",
};

type Draft = Omit<Entry, "ref">;

/**
 * Give every entry its ref. An entry keeps the ref it had at the last sync, so a brief written
 * earlier still points at the right things; new entries take the next free number for their letter.
 */
function assignRefs(drafts: Draft[], previous: CaseFile | null): Entry[] {
  const key = (entry: { kind: EntryKind; clioId: string }) => `${LETTER[entry.kind]}:${entry.clioId}`;
  const known = new Map((previous?.entries ?? []).map((entry) => [key(entry), entry.ref]));
  const next: Record<string, number> = {};
  for (const ref of known.values()) {
    const letter = ref[0];
    next[letter] = Math.max(next[letter] ?? 0, Number(ref.slice(1)));
  }
  return drafts.map((draft) => {
    const letter = LETTER[draft.kind];
    const ref = known.get(key(draft)) ?? `${letter}${(next[letter] = (next[letter] ?? 0) + 1)}`;
    return { ref, ...draft };
  });
}

const byClioId = <T extends { id: number | string }>(rows: T[]) => [...rows].sort((a, b) => Number(a.id) - Number(b.id));

/**
 * The case list: every matter in the connected Clio account, read live, each with when it was last
 * read into Case Desk. `connected` is false when no Clio account has been connected yet.
 */
export async function listMatters(): Promise<{ connected: boolean; matters: CaseSummary[] }> {
  if (!(await isConnected())) return { connected: false, matters: [] };
  const [matters, read] = await Promise.all([
    clioGet<{ id: number; display_number: string; description: string | null; client: Named; matter_stage: Named }>(
      "/matters.json",
      { fields: FIELDS.matterList },
    ),
    listCases(),
  ]);
  const stored = new Map(read.map((summary) => [summary.matterId, summary]));
  return {
    connected: true,
    matters: matters.map((matter) => ({
      matterId: matter.id,
      number: matter.display_number,
      client: matter.client?.name ?? "",
      description: matter.description ?? "",
      stage: matter.matter_stage?.name ?? "",
      stages: stored.get(matter.id)?.stages ?? [],
      syncedAt: stored.get(matter.id)?.syncedAt ?? null,
    })),
  };
}

/** The cases that have been read from Clio, most recently read first. */
export async function listCases(): Promise<CaseSummary[]> {
  const { data, error } = await supabase()
    .from("case_files")
    .select("file, synced_at")
    .gt("matter_id", 0) // a fresh read of a case is not another case
    .order("synced_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const file = row.file as CaseFile;
    return {
      matterId: file.matterId,
      number: file.number,
      client: file.client.name,
      description: file.description,
      stage: file.stage,
      stages: file.stages,
      syncedAt: row.synced_at as string,
    };
  });
}

/** A case as last read from Clio, or null when it has not been read yet. */
export async function getCaseFile(matterId: number): Promise<CaseFile | null> {
  const { data, error } = await supabase().from("case_files").select("file").eq("matter_id", matterId).maybeSingle();
  if (error) throw error;
  return (data?.file as CaseFile | undefined) ?? null;
}

/** Record that `viewer` opened a case, and return when they last opened it before (ISO), or null. */
export async function recordVisit(matterId: number, viewer: string): Promise<string | null> {
  const db = supabase();
  const { data, error } = await db
    .from("visits")
    .select("opened_at")
    .eq("matter_id", matterId)
    .eq("viewer", viewer)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const { error: failed } = await db.from("visits").insert({ matter_id: matterId, viewer });
  if (failed) throw failed;
  return (data?.opened_at as string | undefined) ?? null;
}

/** Where a case's document copies are kept in the bucket; a fresh read has a folder of its own. */
const folderOf = (matterKey: number) => `clio/${isFreshRead(matterKey) ? "fresh-" : ""}${clioMatterId(matterKey)}`;
/** The version a document's page index is stored under; a fresh read's index is kept apart from the case's. */
const versionOf = (matterKey: number, versionId: number) => (isFreshRead(matterKey) ? `fresh-${versionId}` : versionId);

/** Copy a document from Clio into our Storage bucket once per version, and return where it is. */
async function storeDocument(matterKey: number, doc: ClioDocument, present: Set<string>) {
  const versionId = doc.latest_document_version?.id ?? 0;
  const extension = (doc.name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? "pdf").toLowerCase();
  const name = `${doc.id}-${versionId}.${extension}`;
  const path = `${folderOf(matterKey)}/${name}`;
  if (!present.has(name)) {
    const bytes = await clioDownload(String(doc.id));
    const contentType = doc.latest_document_version?.content_type ?? doc.content_type ?? "application/octet-stream";
    const { error } = await supabase().storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
    if (error) throw error;
  }
  return path;
}

/**
 * Read every part of a matter from Clio (about a dozen requests, plus one per document not copied
 * yet), turn it into one CaseFile and store it. Safe to repeat: refs are kept from the last read.
 */
export async function syncCase(matterKey: number): Promise<CaseFile> {
  // `matterKey` is where the case is kept; `matterId` is the matter in Clio it is read from.
  const matterId = clioMatterId(matterKey);
  const matter = await clioGetOne<ClioMatter>(`/matters/${matterId}.json`, { fields: FIELDS.matter });
  const scope = { matter_id: matterId, order: "id(asc)" };
  const [contacts, notes, communications, tasks, events, activities, documents, stages, user, previous, stored] =
    await Promise.all([
      clioGet<ClioContact>(`/matters/${matterId}/contacts.json`, { fields: FIELDS.contacts }),
      clioGet<ClioNote>("/notes.json", { ...scope, type: "Matter", fields: FIELDS.notes }),
      clioGet<ClioCommunication>("/communications.json", { ...scope, fields: FIELDS.communications }),
      clioGet<ClioTask>("/tasks.json", { ...scope, fields: FIELDS.tasks }),
      clioGet<ClioEvent>("/calendar_entries.json", { matter_id: matterId, fields: FIELDS.calendar }),
      clioGet<ClioActivity>("/activities.json", { ...scope, fields: FIELDS.activities }),
      clioGet<ClioDocument>("/documents.json", { ...scope, fields: FIELDS.documents }),
      matter.practice_area
        ? clioGet<{ name: string; order: number }>("/matter_stages.json", {
            practice_area_id: matter.practice_area.id,
            fields: FIELDS.stages,
          })
        : Promise.resolve([]),
      clioGetOne<{ name: string; email: string; account: { name: string } | null }>("/users/who_am_i.json", {
        fields: FIELDS.user,
      }),
      getCaseFile(matterKey),
      supabase().storage.from(BUCKET).list(folderOf(matterKey), { limit: 1000 }),
    ]);
  if (stored.error) throw stored.error;
  const present = new Set((stored.data ?? []).map((object) => object.name));

  const drafts: Draft[] = [];
  const stamp = (row: Stamped) => ({ clioId: String(row.id), etag: row.etag, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) });

  for (const value of [...matter.custom_field_values].sort((a, b) => a.field_display_order - b.field_display_order)) {
    if (value.value === null || value.value === "") continue;
    const text =
      typeof value.value === "boolean"
        ? value.value ? "Yes" : "No"
        : value.field_type === "currency" && typeof value.value === "number"
          ? dollars.format(value.value)
          : String(value.value);
    drafts.push({
      kind: "field",
      clioId: String(value.custom_field?.id ?? value.id ?? value.field_name),
      etag: `${value.custom_field?.etag ?? ""}:${value.updated_at}`,
      date: "",
      title: value.field_name,
      text: decode(text),
      people: [],
      facts: { fieldType: value.field_type, value: value.value },
      createdAt: iso(value.updated_at),
      updatedAt: iso(value.updated_at),
    });
  }

  // The client first, so they are always P1 on a first read.
  for (const contact of [...contacts].sort((a, b) => Number(b.is_client) - Number(a.is_client) || Number(a.id) - Number(b.id))) {
    const role = contact.relationship_name ?? (contact.is_client ? "Client" : "");
    drafts.push({
      ...stamp(contact),
      kind: "contact",
      date: "",
      title: plain(contact.name),
      text: plain(role),
      people: contact.company ? [contact.company.name] : [],
      facts: {
        role,
        isClient: contact.is_client,
        isCompany: contact.type === "Company",
        email: contact.primary_email_address ?? "",
        phone: contact.primary_phone_number ?? "",
      },
    });
  }

  for (const note of byClioId(notes)) {
    drafts.push({
      ...stamp(note),
      kind: "note",
      date: note.date ?? "",
      title: plain(note.subject),
      text: plain(note.detail, note.detail_text_type),
      people: note.author ? [note.author.name] : [],
      facts: {},
    });
  }

  for (const message of byClioId(communications)) {
    const from = names(message.senders);
    const to = names(message.receivers);
    drafts.push({
      ...stamp(message),
      kind: message.type === "PhoneCommunication" ? "call" : "email",
      date: message.date ?? "",
      title: plain(message.subject),
      text: plain(message.body, /<\w+[^>]*>/.test(message.body ?? "") ? "rich_text" : null),
      people: [...from, ...to],
      facts: { from: from.join(", "), to: to.join(", ") },
    });
  }

  for (const task of byClioId(tasks)) {
    drafts.push({
      ...stamp(task),
      kind: "task",
      date: task.due_at ?? "",
      title: plain(task.name),
      text: plain(task.description, task.description_text_type),
      people: task.assignee ? [task.assignee.name] : [],
      facts: { status: task.status, priority: task.priority ?? "", completedAt: iso(task.completed_at) },
    });
  }

  for (const event of byClioId(events)) {
    drafts.push({
      ...stamp(event),
      kind: "event",
      date: utcDay(event.start_at),
      title: plain(event.summary),
      text: plain(event.description),
      people: names(event.attendees),
      facts: { startAt: iso(event.start_at), endAt: iso(event.end_at), location: event.location ?? "", allDay: event.all_day },
    });
  }

  for (const activity of byClioId(activities)) {
    if (activity.type !== "ExpenseEntry") continue;
    const text = plain(activity.note);
    drafts.push({
      ...stamp(activity),
      kind: "expense",
      date: activity.date ?? "",
      title: firstLine(text),
      text,
      people: activity.user ? [activity.user.name] : [],
      facts: {
        amount: activity.total ?? (activity.price ?? 0) * (activity.quantity ?? 1),
        // Clio's "non-billable" flag. Firms use it for charges recorded on the matter that the firm
        // did not pay itself, such as a provider's bill; only billable entries are the firm's spend.
        billable: activity.non_billable !== true,
      },
    });
  }

  // One at a time: each uncopied document is a Clio request, and Clio allows 50 a minute.
  for (const doc of byClioId(documents)) {
    if (doc.latest_document_version && !doc.latest_document_version.fully_uploaded) continue;
    drafts.push({
      ...stamp(doc),
      kind: "document",
      date: utcDay(doc.received_at ?? doc.created_at),
      title: doc.name,
      text: "",
      people: [],
      facts: {
        folder: doc.parent?.name ?? "",
        bytes: doc.latest_document_version?.size ?? 0,
        contentType: doc.latest_document_version?.content_type ?? doc.content_type ?? "",
        versionId: versionOf(matterKey, doc.latest_document_version?.id ?? 0),
        storagePath: await storeDocument(matterKey, doc, present),
      },
    });
  }

  const entries = assignRefs(drafts, previous);
  const client = entries.find((entry) => entry.kind === "contact" && entry.facts.isClient === true);
  const fingerprint = createHash("sha256")
    .update([matter.etag, ...entries.map((entry) => `${entry.kind}:${entry.clioId}:${entry.etag}`).sort()].join("\n"))
    .digest("hex")
    .slice(0, 32);

  const file: CaseFile = {
    matterId: matterKey,
    number: matter.display_number,
    description: matter.description ?? "",
    status: matter.status,
    stage: matter.matter_stage?.name ?? "",
    stages: [...stages].sort((a, b) => a.order - b.order).map((stage) => stage.name),
    practiceArea: matter.practice_area?.name ?? "",
    openDate: matter.open_date ?? "",
    limitationDate: matter.statute_of_limitations?.due_at ?? "",
    client: { ref: client?.ref ?? "", name: client?.title ?? matter.client?.name ?? "" },
    firm: { name: user.account?.name ?? "", user: user.name, email: user.email },
    entries,
    syncedAt: new Date().toISOString(),
    fingerprint,
  };

  const { error } = await supabase()
    .from("case_files")
    .upsert({ matter_id: matterKey, file, fingerprint, synced_at: file.syncedAt });
  if (error) throw error;
  return file;
}

/** Which of a case's documents have a page index, for the "Read this case" steps. */
export async function documentStatus(file: CaseFile): Promise<{ ref: string; title: string; indexed: boolean }[]> {
  const documents = file.entries.filter((entry) => entry.kind === "document");
  if (documents.length === 0) return [];
  const { data, error } = await supabase()
    .from("document_digests")
    .select("document_id, version")
    .in("document_id", documents.map((entry) => Number(entry.clioId)));
  if (error) throw error;
  const indexed = new Set((data ?? []).map((row) => `${row.document_id}:${row.version}`));
  return documents.map((entry) => ({
    ref: entry.ref,
    title: entry.title,
    indexed: indexed.has(`${entry.clioId}:${entry.facts.versionId}`),
  }));
}

/** Every object under a folder of the bucket, however deep. */
async function objectsUnder(folder: string): Promise<string[]> {
  const { data, error } = await supabase().storage.from(BUCKET).list(folder, { limit: 1000 });
  if (error) throw error;
  const paths: string[] = [];
  for (const object of data ?? []) {
    const path = `${folder}/${object.name}`;
    // A folder comes back without an id.
    if (object.id === null) paths.push(...(await objectsUnder(path)));
    else paths.push(path);
  }
  return paths;
}

/**
 * Clear a fresh read, so the case can be read from nothing again: its case file, its brief, its page
 * index and its document copies. Only a fresh read can be cleared; the case itself is never touched,
 * and nothing is ever removed from Clio.
 */
export async function clearFreshRead(matterKey: number) {
  if (!isFreshRead(matterKey)) throw new Error("Only a fresh read can be started over.");
  const db = supabase();
  const file = await getCaseFile(matterKey);
  const documentIds = (file?.entries ?? []).filter((entry) => entry.kind === "document").map((entry) => Number(entry.clioId));
  if (documentIds.length > 0) {
    const { error } = await db.from("document_digests").delete().in("document_id", documentIds).like("version", "fresh-%");
    if (error) throw error;
  }
  for (const table of ["briefs", "visits", "case_files"]) {
    const { error } = await db.from(table).delete().eq("matter_id", matterKey);
    if (error) throw error;
  }
  const objects = await objectsUnder(folderOf(matterKey));
  for (let start = 0; start < objects.length; start += 100) {
    const { error } = await db.storage.from(BUCKET).remove(objects.slice(start, start + 100));
    if (error) throw error;
  }
}
