"use client";

import { useState } from "react";
import { CheckIcon, RotateCcwIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { needsReview, type DocumentExtraction, type ExtractedField } from "./schema";

type Row = ExtractedField & { original: string; confirmed: boolean };
type RowStatus = "ok" | "review" | "confirmed" | "edited" | "missing";
type Decision = "pending" | "approved" | "rejected";

function statusOf(row: Row): RowStatus {
  if (row.value !== row.original) return "edited";
  if (row.original === "") return "missing";
  if (!needsReview(row)) return "ok";
  return row.confirmed ? "confirmed" : "review";
}

const STATUS_BADGE: Partial<Record<RowStatus, string>> = {
  review: "Needs review",
  confirmed: "Checked",
  edited: "Edited",
};

/**
 * The extracted fields, each editable and shown with the quote and page it came from.
 * Fields the model was unsure about must be checked or edited before the document can be approved.
 */
export function ReviewPanel({
  extraction,
  model,
  onJump,
}: {
  extraction: DocumentExtraction;
  model: string;
  /** Show the given page of the source. Omit it when the source has no pages (images, text). */
  onJump?: (page: number) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    extraction.fields.map((field) => ({ ...field, original: field.value, confirmed: false })),
  );
  const [decision, setDecision] = useState<Decision>("pending");

  const locked = decision !== "pending";
  const toCheck = rows.filter((row) => statusOf(row) === "review").length;
  const notFound = rows.filter((row) => statusOf(row) === "missing").length;

  function update(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  // Consecutive entries with the same label (one per item of a list field) share a heading.
  const groups: { label: string; items: { row: Row; index: number }[] }[] = [];
  rows.forEach((row, index) => {
    const last = groups.at(-1);
    if (last?.label === row.label) last.items.push({ row, index });
    else groups.push({ label: row.label, items: [{ row, index }] });
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-medium capitalize">{extraction.documentType}</h2>
        <p className="text-sm text-muted-foreground">{extraction.summary}</p>
        <p className="text-xs text-muted-foreground">
          {rows.length - notFound} found · {toCheck} to check · {notFound} not in this document · {model}
        </p>
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

                  {row.evidence && (
                    <div className="flex items-start justify-between gap-2 text-xs text-muted-foreground">
                      <blockquote className="border-l-2 pl-2 italic">“{row.evidence}”</blockquote>
                      {onJump && row.page != null && (
                        <Button
                          variant="outline"
                          size="xs"
                          className="shrink-0"
                          onClick={() => onJump(row.page!)}
                        >
                          p. {row.page}
                        </Button>
                      )}
                    </div>
                  )}
                  {status !== "missing" && !row.evidence && (
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
            <Button variant="ghost" size="sm" onClick={() => setDecision("pending")}>
              <RotateCcwIcon />
              Reopen
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              disabled={toCheck > 0}
              onClick={() => {
                setDecision("approved");
                toast.success("Approved. Nothing is saved yet: there is no database behind this screen.");
              }}
            >
              <CheckIcon />
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDecision("rejected")}>
              <XIcon />
              Reject
            </Button>
            <span className="text-sm text-muted-foreground">
              {toCheck > 0 ? `${toCheck} to check before approving` : "Ready to approve"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
