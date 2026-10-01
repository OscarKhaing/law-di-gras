"use client";

import { useState } from "react";
import { CheckIcon, FileUpIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson } from "@/lib/fetch-json";
import type { DocumentSummary } from "@/lib/schemas";

type Extraction = { fileName: string; data: DocumentSummary; model: string };
type Review = "pending" | "approved" | "rejected";

const REVIEW_BADGE: Record<Review, { label: string; variant: "outline" | "secondary" | "destructive" }> = {
  pending: { label: "Awaiting review", variant: "outline" },
  approved: { label: "Approved", variant: "secondary" },
  rejected: { label: "Rejected", variant: "destructive" },
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Upload a document, extract structured facts with the LLM, then approve or reject the result. */
export function DocumentExtractor() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Extraction | null>(null);
  const [review, setReview] = useState<Review>("pending");

  async function run() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setReview("pending");
    try {
      const form = new FormData();
      form.append("file", file);
      setResult(await fetchJson<Extraction>("/api/llm/extract", { method: "POST", body: form }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Document intake</CardTitle>
          <CardDescription>Upload a PDF, image or text file to extract its key facts.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Input
            type="file"
            accept="application/pdf,image/*,text/plain"
            className="max-w-sm"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <Button onClick={run} disabled={!file || loading}>
            <FileUpIcon />
            {loading ? "Extracting…" : "Extract"}
          </Button>
        </CardContent>
      </Card>

      {loading && <Skeleton className="h-48 w-full" />}

      {result && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{result.data.documentType}</CardTitle>
              <CardDescription>
                {result.fileName} · {result.model}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>{result.data.summary}</p>
              <FactList
                title="People"
                rows={result.data.people.map((p) => ({ label: p.name, value: p.role }))}
              />
              <FactList
                title="Timeline"
                rows={result.data.dates.map((d) => ({ label: d.date, value: d.event, page: d.page }))}
              />
              <FactList
                title="Amounts"
                rows={result.data.amounts.map((a) => ({
                  label: a.label,
                  value: usd.format(a.amountUsd),
                  page: a.page,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Review</CardTitle>
              <CardDescription>Nothing is saved to the case until a person approves it.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Badge variant={REVIEW_BADGE[review].variant}>{REVIEW_BADGE[review].label}</Badge>
              {result.data.flags.length > 0 && (
                <div className="space-y-1">
                  <div className="font-medium">Check before approving</div>
                  <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                    {result.data.flags.map((flag) => (
                      <li key={flag}>{flag}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setReview("approved")} disabled={review === "approved"}>
                  <CheckIcon />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReview("rejected")}
                  disabled={review === "rejected"}
                >
                  <XIcon />
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function FactList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; page?: number | null }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="font-medium">{title}</div>
      <dl className="divide-y rounded-md border">
        {rows.map((row, index) => (
          <div key={index} className="flex items-baseline justify-between gap-4 px-3 py-1.5">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="text-right">
              {row.value}
              {row.page != null && (
                <span className="ml-2 text-xs text-muted-foreground">p. {row.page}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
