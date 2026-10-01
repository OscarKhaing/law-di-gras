"use client";

import { useState } from "react";
import { CheckIcon, RotateCcwIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { needsReview, type ExtractedField, type Extraction } from "./schema";

// `original` is what the model read and is never overwritten; `flagged` is fixed when the result
// loads, so the "To check" view keeps a row in place after it has been dealt with.
type Row = ExtractedField & { original: string; flagged: boolean; confirmed: boolean };
type RowStatus = "ok" | "review" | "confirmed" | "edited" | "missing";
type Decision = "pending" | "approved" | "rejected";

function statusOf(row: Row): RowStatus {
  if (row.value !== row.original) return "edited";
  if (row.flagged) return row.confirmed ? "confirmed" : "review";
  return row.original === "" ? "missing" : "ok";
}

const STATUS_BADGE: Partial<Record<RowStatus, { label: string; className: string }>> = {
  review: { label: "Needs review", className: "bg-marker text-foreground" },
  confirmed: { label: "Checked", className: "bg-secondary text-primary" },
  edited: { label: "Edited", className: "bg-secondary text-primary" },
};

const count = new Intl.NumberFormat("en-US");

/**
 * The facts read from a document, laid out as a ledger: one row per field, each entry editable
 * and shown with the quote and page it came from. Words taken from the document are set in the
 * serif face and its quotes in marker yellow; everything in the sans face is the app speaking.
 * Entries the model flagged must be checked or edited before the document can be approved.
 */
export function ReviewPanel({
  extraction,
  onShow,
}: {
  extraction: Extraction;
  /** Show a page of the source with a quote highlighted. Omit it when the source has no pages. */
  onShow?: (page: number, quote: string | null) => void;
}) {
  const { data, model, usage, seconds } = extraction;
  const [rows, setRows] = useState<Row[]>(() =>
    data.fields.map((field) => ({
      ...field,
      original: field.value,
      flagged: needsReview(field),
      confirmed: false,
    })),
  );
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [shown, setShown] = useState<number | null>(null);
  const [decision, setDecision] = useState<Decision>("pending");

  const locked = decision !== "pending";
  const having = (status: RowStatus) => rows.filter((row) => statusOf(row) === status).length;
  const toCheck = having("review");
  const flagged = rows.filter((row) => row.flagged).length;
  const nothingFound = rows.every((row) => row.value.trim() === "");

  function update(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  // Consecutive entries with the same label (one per item of a list field) share a ledger row.
  const groups: { label: string; items: { row: Row; index: number }[] }[] = [];
  rows.forEach((row, index) => {
    if (onlyFlagged && !row.flagged) return;
    const last = groups.at(-1);
    if (last?.label === row.label) last.items.push({ row, index });
    else groups.push({ label: row.label, items: [{ row, index }] });
  });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h3 className="font-heading text-2xl font-semibold tracking-tight first-letter:uppercase">
          {data.documentType}
        </h3>
        <p className="max-w-prose text-sm leading-relaxed">{data.summary}</p>
        <p className="text-xs text-muted-foreground">
          Read by {model}: {count.format(usage.inputTokens)} tokens
          {seconds != null && ` in ${seconds} s`}. The quotes are the model&apos;s own
          {onShow && "; select one to see it marked in the record"}.
        </p>
      </div>

      <div className="flex gap-1.5">
        <Button size="sm" variant={onlyFlagged ? "ghost" : "secondary"} onClick={() => setOnlyFlagged(false)}>
          All {rows.length}
        </Button>
        <Button
          size="sm"
          variant={onlyFlagged ? "secondary" : "ghost"}
          disabled={flagged === 0}
          onClick={() => setOnlyFlagged(true)}
        >
          To check {flagged}
        </Button>
      </div>

      <div className="divide-y border-y">
        {groups.map((group, position) => (
          // The rows arrive one after another when a reading lands: the screen's one piece of motion.
          <section
            key={`${group.label}-${group.items[0].index}`}
            style={{ animationDelay: `${Math.min(position, 14) * 45}ms` }}
            className="grid animate-in gap-x-4 gap-y-1.5 py-3 duration-500 fill-mode-both fade-in motion-reduce:animate-none sm:grid-cols-[7.5rem_minmax(0,1fr)]"
          >
            <h4 className="text-sm font-medium text-muted-foreground sm:pt-1.5">
              {group.label}
              {group.items.length > 1 && <span className="ml-1.5 font-normal">{group.items.length}</span>}
            </h4>
            <div className="space-y-3">
              {group.items.map(({ row, index }) => {
                const status = statusOf(row);
                const badge = STATUS_BADGE[status];
                return (
                  <div
                    key={index}
                    className={cn(
                      "space-y-1.5 border-l-2 border-transparent pl-3",
                      status === "review" && "rounded-r-md border-marker bg-marker-soft py-2.5 pr-2.5",
                      shown === index && status !== "review" && "border-primary",
                    )}
                  >
                    {badge && <Badge className={badge.className}>{badge.label}</Badge>}
                    <Textarea
                      aria-label={group.label}
                      value={row.value}
                      placeholder="Not in this document"
                      disabled={locked}
                      onChange={(event) => update(index, { value: event.target.value })}
                      className="min-h-8 bg-card py-1.5 font-serif text-[15px] leading-snug md:text-[15px]"
                    />

                    {status === "edited" && (
                      <p className="text-xs text-muted-foreground">
                        {row.original ? (
                          <>
                            Read from the document as: <span className="font-serif">{row.original}</span>
                          </>
                        ) : (
                          "Nothing was read from the document for this."
                        )}
                        {!locked && (
                          <button
                            type="button"
                            className="ml-2 font-medium text-primary underline underline-offset-2"
                            onClick={() => update(index, { value: row.original })}
                          >
                            Restore
                          </button>
                        )}
                      </p>
                    )}

                    {row.evidence &&
                      (onShow && row.page != null ? (
                        <button
                          type="button"
                          className="group/quote block text-left"
                          onClick={() => {
                            setShown(index);
                            onShow(row.page!, row.evidence);
                          }}
                        >
                          <Quote text={row.evidence} lit={shown === index} />
                          <span className="ml-2 text-xs font-medium whitespace-nowrap text-primary group-hover/quote:underline">
                            p. {row.page}
                          </span>
                        </button>
                      ) : (
                        <p>
                          <Quote text={row.evidence} lit={false} />
                        </p>
                      ))}
                    {row.original !== "" && !row.evidence && (
                      <p className="text-xs text-muted-foreground">No supporting quote was given.</p>
                    )}

                    {row.concern && (
                      <p className="flex gap-1.5 text-[13px] leading-snug">
                        <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                        {row.concern}
                      </p>
                    )}

                    {status === "review" && !locked && (
                      <Button
                        variant="outline"
                        size="xs"
                        className="bg-card"
                        onClick={() => update(index, { confirmed: true })}
                      >
                        <CheckIcon />
                        Mark as checked
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-background py-3">
        {locked ? (
          <>
            <Badge
              className={decision === "approved" ? "bg-primary text-primary-foreground" : "bg-destructive/10 text-destructive"}
            >
              {decision === "approved" ? "Approved" : "Rejected"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {having("ok")} as read, {having("confirmed")} checked, {having("edited")} edited. Not saved: there
              is no database behind this screen yet.
            </span>
            <Button variant="ghost" size="sm" onClick={() => setDecision("pending")}>
              <RotateCcwIcon />
              Reopen
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" disabled={toCheck > 0 || nothingFound} onClick={() => setDecision("approved")}>
              <CheckIcon />
              Approve
            </Button>
            <Button size="sm" variant="outline" className="bg-card" onClick={() => setDecision("rejected")}>
              <XIcon />
              Reject
            </Button>
            <span className="text-sm text-muted-foreground">
              {nothingFound
                ? "Nothing was found in this document"
                : toCheck > 0
                  ? `${toCheck} to check before approving`
                  : "Ready to approve"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** A passage quoted from the document, drawn as a marker stroke; brighter while it is the one shown. */
function Quote({ text, lit }: { text: string; lit: boolean }) {
  return (
    <mark
      className={cn(
        "box-decoration-clone px-0.5 font-serif text-[13px] leading-relaxed text-foreground transition-colors",
        lit ? "bg-marker" : "bg-marker/45 group-hover/quote:bg-marker",
      )}
    >
      {/* Dot leaders ("Total ........ $5.00") are shortened so the quote reads as a sentence. */}
      {text.replace(/\s*\.{4,}\s*/g, " … ")}
    </mark>
  );
}
