"use client";

import { useEffect, useState } from "react";
import { FileTextIcon, FileUpIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson, postJson } from "@/lib/fetch-json";
import { ReviewPanel } from "./review-panel";
import type { Extraction } from "./schema";
import { SourceViewer, type Source, type ViewTarget } from "./source-viewer";

type Phase = "idle" | "uploading" | "extracting";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ACCEPT = ["application/pdf", ...IMAGE_TYPES, "text/*", "application/json"].join(",");
// The model accepts 32 MB per request and files are sent base64-encoded, which adds a third.
const MAX_BYTES = 23_000_000;

// A record extracted ahead of time with scripts/extract-file.ts. It opens instantly, which is how
// to show a long document in a demo: put the PDF and its JSON in public/demo and load them like this.
const SAMPLE = { name: "sample-medical-record.pdf", url: "/demo/sample-medical-record.pdf" };
const SAMPLE_EXTRACTION = "/demo/sample-medical-record.json";

const isText = (file: File) => file.type.startsWith("text/") || file.type === "application/json";
const isSupported = (file: File) =>
  file.type === "application/pdf" || IMAGE_TYPES.includes(file.type) || isText(file);
const messageOf = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

/**
 * Upload a document, extract its fields, then review them next to the source.
 * The file goes from the browser straight to Storage; only its path is sent to our API.
 */
export function DocumentReview() {
  // `path` is set once the file is in Storage, so retrying after a model error does not upload again.
  const [upload, setUpload] = useState<{ file: File; path: string | null } | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [source, setSource] = useState<Source | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [target, setTarget] = useState<ViewTarget>({ page: 1, quote: null, nonce: 0 });

  const busy = phase !== "idle";

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  const showInSource = (page: number, quote: string | null) =>
    setTarget((current) => ({ page, quote, nonce: current.nonce + 1 }));

  /** Switch the screen to another document, clearing whatever was extracted from the last one. */
  function open(next: Source) {
    if (source?.url.startsWith("blob:")) URL.revokeObjectURL(source.url);
    setSource(next);
    setExtraction(null);
    setError(null);
    showInSource(1, null);
  }

  function choose(file: File | undefined) {
    if (!file) return;
    if (!isSupported(file)) return void toast.error("Use a PDF, an image (JPEG, PNG, GIF, WebP) or a text file.");
    if (file.size > MAX_BYTES) return void toast.error("That file is over 23 MB, the most the model takes at once.");
    // Text is shown as plain UTF-8, whatever its subtype, so the viewer never runs it as a page.
    const shown = isText(file) ? new Blob([file], { type: "text/plain;charset=utf-8" }) : file;
    setUpload({ file, path: null });
    open({ name: file.name, type: file.type, url: URL.createObjectURL(shown) });
  }

  async function openSample() {
    setUpload(null);
    setInputKey((key) => key + 1); // clears the file input
    open({ ...SAMPLE, type: "application/pdf" });
    try {
      setExtraction(await fetchJson<Extraction>(SAMPLE_EXTRACTION));
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function run() {
    if (!upload) return;
    const { file } = upload;
    const started = Date.now();
    setExtraction(null);
    setError(null);
    setElapsed(0);
    try {
      let path = upload.path;
      if (!path) {
        setPhase("uploading");
        const created = await postJson<{ path: string; uploadUrl: string }>("/api/documents/upload-url", {
          fileName: file.name,
        });
        const put = await fetch(created.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        }).catch(() => {
          throw new Error("Upload failed: could not reach file storage.");
        });
        if (!put.ok) {
          const detail = await put.json().catch(() => null);
          throw new Error(`Upload failed: ${detail?.message ?? put.status}`);
        }
        path = created.path;
        setUpload({ file, path });
      }
      setPhase("extracting");
      const result = await postJson<Extraction>("/api/documents/extract", { path });
      setExtraction({ ...result, seconds: Math.round((Date.now() - started) / 1000) });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPhase("idle");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">Review a document</h2>
        {!source && (
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Choose a PDF, image or text file. Case Desk reads it and lists the facts it finds, each with the
            sentence it came from, for you to check. Or open the sample record to see how it works.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          key={inputKey}
          type="file"
          accept={ACCEPT}
          aria-label="Document to review"
          className="max-w-sm bg-card"
          disabled={busy}
          onChange={(event) => choose(event.target.files?.[0])}
        />
        <Button onClick={run} disabled={!upload || busy}>
          <FileUpIcon />
          {phase === "uploading" ? "Uploading…" : phase === "extracting" ? "Reading…" : "Read document"}
        </Button>
        <Button variant="outline" className="bg-card" onClick={openSample} disabled={busy}>
          <FileTextIcon />
          Open sample
        </Button>
        {busy && <span className="text-sm text-muted-foreground tabular-nums">{elapsed} s</span>}
      </div>

      {source && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-[70vh] lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
            <SourceViewer source={source} target={target} />
          </div>
          <div>
            {extraction ? (
              // Mounted fresh for every extraction (it is cleared before each one), so its edits reset.
              <ReviewPanel
                extraction={extraction}
                onShow={source.type === "application/pdf" ? showInSource : undefined}
              />
            ) : busy ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {phase === "uploading" ? "Uploading the document…" : "Reading the document…"} Longer
                  documents take longer: about 20 seconds for 12 pages.
                </p>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : error ? (
              <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">That did not work</p>
                <p className="mt-1 text-muted-foreground">{error}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Read the document to list its facts here, each with the sentence it came from.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
