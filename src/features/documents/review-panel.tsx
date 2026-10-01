"use client";

import { useState } from "react";
import { CheckIcon, RotateCcwIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { needsReview, type ExtractedField, type Extraction } from "./schema";

// `original` is what the model extracted and is never overwritten; `flagged` is fixed when the
// extraction loads, so the "To check" view keeps a row in place after it has been dealt with.
type Row = ExtractedField & { original: string; flagged: boolean; confirmed: boolean };
type RowStatus = "ok" | "review" | "confirmed" | "edited" | "missing";
type Decision = "pending" | "approved" | "rejected";

function statusOf(row: Row): RowStatus {
  if (row.value !== row.original) return "edited";
  if (row.flagged) return row.confirmed ? "confirmed" : "review";
  return row.original === "" ? "missing" : "ok";
}

const STATUS_BADGE: Partial<Record<RowStatus, string>> = {
  review: "Needs review",
  confirmed: "Checked",
  edited: "Edited",
};

const count = new Intl.NumberFormat("en-US");

/**
 * The extracted fields, each editable and shown with the quote and page it came from.
 * Fields the model flagged must be checked or edited before the document can be approved.
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

  // Consecutive entries with the same label (one per item of a list field) share a heading.
  const groups: { label: string; items: { row: Row; index: number }[] }[] = [];
  rows.forEach((row, index) => {
    if (onlyFlagged && !row.flagged) return;
    const last = groups.at(-1);
    if (last?.label === row.label) last.items.push({ row, index });
    else groups.push({ label: row.label, items: [{ row, index }] });
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-medium capitalize">{data.documentType}</h2>
        <p className="text-sm text-muted-foreground">{data.summary}</p>
        <p className="text-xs text-muted-foreground">
          {model} read {count.format(usage.inputTokens)} tokens
          {seconds != null && ` in ${seconds} s`}. The quotes are the model&apos;s own
          {onShow && ": open a page to see the quote highlighted in the source"}.
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

      <div className="space-y-4">
        {groups.map((group) => (
          <section key={`${group.label}-${group.items[0].index}`} className="space-y-1.5">
            <h3 className="text-sm font-medium">
              {group.label}
              {group.items.length > 1 && (
                <span className="ml-1.5 font-normal text-muted-foreground">{group.items.length}</span>
              )}
            </h3>
            {group.items.map(({ row, index }) => {
              const status = statusOf(row);
              return (
                <div
                  key={index}
                  className={cn(
                    "space-y-1.5 rounded-lg border p-2.5",
                    status === "review" && "border-amber-400/70 bg-amber-50 dark:bg-amber-950/30",
                    shown === index && "ring-2 ring-ring",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Textarea
                      aria-label={group.label}
                      value={row.value}
                      placeholder="Not in this document"
                      disabled={locked}
                      onChange={(event) => update(index, { value: event.target.value })}
                      className="min-h-8 bg-background py-1.5"
                    />
                    {STATUS_BADGE[status] && (
                      <Badge variant={status === "review" ? "outline" : "secondary"} className="mt-1.5">
                        {STATUS_BADGE[status]}
                      </Badge>
                    )}
                  </div>

                  {status === "edited" && (
                    <p className="text-xs text-muted-foreground">
                      {row.original ? `Extracted as: ${row.original}` : "Nothing was extracted for this field."}
                      {!locked && (
                        <button
                          type="button"
                          className="ml-2 underline underline-offset-2"
                          onClick={() => update(index, { value: row.original })}
                        >
                          Restore
                        </button>
                      )}
                    </p>
                  )}

                  {row.evidence && (
                    <div className="flex items-start justify-between gap-2 text-xs text-muted-foreground">
                      <blockquote className="border-l-2 pl-2 italic">“{row.evidence}”</blockquote>
                      {onShow && row.page != null && (
                        <Button
                          variant="outline"
                          size="xs"
                          className="shrink-0"
                          onClick={() => {
                            setShown(index);
                            onShow(row.page!, row.evidence);
                          }}
                        >
                          p. {row.page}
                        </Button>
                      )}
                    </div>
                  )}
                  {row.original !== "" && !row.evidence && (
                    <p className="text-xs text-muted-foreground">The model gave no supporting quote.</p>
                  )}

                  {row.concern && (
                    <p className="flex gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                      <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                      {row.concern}
                    </p>
                  )}

                  {status === "review" && !locked && (
                    <Button variant="outline" size="xs" onClick={() => update(index, { confirmed: true })}>
                      <CheckIcon />
                      Mark as checked
                    </Button>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-background py-3">
        {locked ? (
          <>
            <Badge variant={decision === "approved" ? "secondary" : "destructive"}>
              {decision === "approved" ? "Approved" : "Rejected"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {having("ok")} as extracted, {having("confirmed")} checked, {having("edited")} edited. Not saved:
              there is no database behind this screen yet.
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
            <Button size="sm" variant="outline" onClick={() => setDecision("rejected")}>
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
