"use client";

import {
  CalendarDaysIcon,
  CircleHelpIcon,
  FileTextIcon,
  ListTodoIcon,
  MailIcon,
  PhoneIcon,
  ReceiptIcon,
  StickyNoteIcon,
  TagIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react";
import { decodeEntities } from "@/components/quote";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { parseSource, type Entry, type EntryKind } from "@/features/cases/schema";
import { formatDate } from "@/lib/calc";
import { cn } from "@/lib/utils";
import { useSource, useSourceEntries, type SourceEvidence } from "./source-panel";

const KIND: Record<EntryKind, { word: string; long: string; icon: LucideIcon }> = {
  note: { word: "Note", long: "Note", icon: StickyNoteIcon },
  email: { word: "Email", long: "Email", icon: MailIcon },
  call: { word: "Call", long: "Phone call", icon: PhoneIcon },
  task: { word: "Task", long: "Task", icon: ListTodoIcon },
  event: { word: "Cal", long: "Calendar entry", icon: CalendarDaysIcon },
  expense: { word: "Cost", long: "Expense", icon: ReceiptIcon },
  document: { word: "Doc", long: "Document", icon: FileTextIcon },
  field: { word: "Field", long: "Field on the matter", icon: TagIcon },
  contact: { word: "Person", long: "Contact on the matter", icon: UserIcon },
};

const chipClass =
  "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 align-baseline font-mono text-[11px] leading-4 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring";

function shortWords(text: string, length = 16) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length - 1).trimEnd()}…` : clean;
}

/** "Note · 3/14", "Doc · p.12", "Field · Policy Limits". */
function chipLabel(entry: Entry, page: number | null) {
  const kind = KIND[entry.kind].word;
  if (entry.kind === "document") return page ? `${kind} · p.${page}` : `${kind} · ${shortWords(entry.title, 12)}`;
  if (entry.kind === "field" || entry.kind === "contact") return `${kind} · ${shortWords(entry.title)}`;
  const date = formatDate(entry.date, true);
  return date ? `${kind} · ${date}` : kind;
}

/** Who wrote or sent it: the sender of an email or call, otherwise the first person on the entry. */
function authorOf(entry: Entry) {
  const from = entry.facts.from;
  if (typeof from === "string" && from) return from;
  return entry.people[0] ?? "";
}

/** "Source: Email from Dana Adjuster, March 14". */
function ariaLabel(entry: Entry, page: number | null) {
  const author = authorOf(entry);
  const date = formatDate(entry.date);
  return [
    `Source: ${KIND[entry.kind].long}`,
    author && entry.kind !== "contact" ? `from ${author}` : "",
    entry.kind === "document" ? `${entry.title}${page ? `, page ${page}` : ""}` : "",
    entry.kind === "field" || entry.kind === "contact" ? entry.title : "",
    date ? `, ${date}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(" ,", ",");
}

/** The words to show under a chip on hover: the quoted passage, or the start of the entry. */
function excerptOf(entry: Entry, quote: string) {
  if (quote) return decodeEntities(quote).trim();
  const plain = decodeEntities(entry.text.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return plain.length > 240 ? `${plain.slice(0, 239).trimEnd()}…` : plain;
}

/** One source: a small pill that shows the passage on hover and opens it in the source panel. */
export function CitationChip({ evidence }: { evidence: SourceEvidence }) {
  const entries = useSourceEntries();
  const { open } = useSource();
  const { ref, page } = parseSource(evidence.source);
  const entry = entries.get(ref);

  if (!entry) {
    return (
      <span className={cn(chipClass, "border-dashed text-muted-foreground")} title="The brief points at an entry that was not read from Clio">
        <CircleHelpIcon className="size-3" />
        Not in file
      </span>
    );
  }

  const { icon: Icon } = KIND[entry.kind];
  const author = authorOf(entry);
  const excerpt = excerptOf(entry, evidence.quote);
  const unfound = evidence.found === false;

  return (
    <HoverCard>
      <HoverCardTrigger
        delay={250}
        render={
          <button
            type="button"
            aria-label={ariaLabel(entry, page)}
            onClick={() => open(evidence)}
            className={cn(
              chipClass,
              "cursor-pointer border-primary/25 bg-primary/5 text-primary hover:border-primary/60 hover:bg-primary/10",
              unfound && "border-dashed",
            )}
          />
        }
      >
        <Icon className="size-3 shrink-0" />
        <span className="truncate">{chipLabel(entry, page)}</span>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="flex w-80 flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="size-3.5" />
          <span>{KIND[entry.kind].long}</span>
          {formatDate(entry.date) && <span className="font-mono">{formatDate(entry.date)}</span>}
        </p>
        <p className="font-medium leading-snug">{entry.title || "Untitled"}</p>
        {author && entry.kind !== "contact" && entry.kind !== "field" && (
          <p className="text-xs text-muted-foreground">{entry.kind === "task" ? "Assigned to" : "From"} {author}</p>
        )}
        {excerpt && <p className="line-clamp-3 text-sm leading-relaxed">“{excerpt}”</p>}
        {unfound && <p className="text-xs text-muted-foreground">This passage was not found word for word in the source.</p>}
        <p className="text-xs text-primary">Select to open the source{entry.kind === "document" && page ? ` at page ${page}` : ""}</p>
      </HoverCardContent>
    </HoverCard>
  );
}

/** Every source of one statement, or a muted "Unsourced" chip when it has none: a missing source is never hidden. */
export function CitationChips({ evidence, className }: { evidence: SourceEvidence[]; className?: string }) {
  const seen = new Set<string>();
  const unique = evidence.filter((item) => {
    const key = `${item.source}|${item.quote}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1 align-baseline", className)}>
      {unique.length === 0 ? (
        <span className={cn(chipClass, "border-dashed text-muted-foreground")}>Unsourced</span>
      ) : (
        unique.map((item, index) => <CitationChip key={`${item.source}-${index}`} evidence={item} />)
      )}
    </span>
  );
}
