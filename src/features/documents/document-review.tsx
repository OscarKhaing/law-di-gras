"use client";

import { useState } from "react";
import { FileUpIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { postJson } from "@/lib/fetch-json";
import { ReviewPanel } from "./review-panel";
import type { DocumentExtraction } from "./schema";
import { SourceViewer, type PageTarget, type Source } from "./source-viewer";

type Extraction = { data: DocumentExtraction; model: string };
type Phase = "idle" | "uploading" | "extracting";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ACCEPT = ["application/pdf", ...IMAGE_TYPES, "text/*", "application/json"].join(",");
// The model accepts 32 MB per request and files are sent base64-encoded, which adds a third.
const MAX_BYTES = 23_000_000;

const isText = (file: File) => file.type.startsWith("text/") || file.type === "application/json";
const isSupported = (file: File) =>
  file.type === "application/pdf" || IMAGE_TYPES.includes(file.type) || isText(file);

/**
 * Upload a document, extract its fields, then review them next to the source.
 * The file goes from the browser straight to Storage; only its path is sent to our API.
 */
export function DocumentReview() {
  const [source, setSource] = useState<Source | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [target, setTarget] = useState<PageTarget>({ page: 1, nonce: 0 });

  const busy = phase !== "idle";
  const jumpTo = (page: number) => setTarget((current) => ({ page, nonce: current.nonce + 1 }));

  async function choose(file: File | undefined) {
    if (!file) return;
    if (!isSupported(file)) return void toast.error("Use a PDF, an image (JPEG, PNG, GIF, WebP) or a text file.");
    if (file.size > MAX_BYTES) return void toast.error("That file is over 23 MB, the most the model takes at once.");
    const text = isText(file) ? await file.text() : null;
    if (source) URL.revokeObjectURL(source.url);
    setSource({ file, url: URL.createObjectURL(file), text });
    setExtraction(null);
    jumpTo(1);
  }

  async function run() {
    if (!source) return;
    setExtraction(null);
    try {
      setPhase("uploading");
      const { path, uploadUrl } = await postJson<{ path: string; uploadUrl: string }>(
        "/api/documents/upload-url",
        { fileName: source.file.name },
      );
      const upload = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": source.file.type },
        body: source.file,
      });
      if (!upload.ok) {
        const detail = await upload.json().catch(() => null);
        throw new Error(`Upload failed: ${detail?.message ?? upload.status}`);
      }
      setPhase("extracting");
      setExtraction(await postJson<Extraction>("/api/documents/extract", { path }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setPhase("idle");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="file"
          accept={ACCEPT}
          aria-label="Document to review"
          className="max-w-sm"
          disabled={busy}
          onChange={(event) => choose(event.target.files?.[0])}
        />
        <Button onClick={run} disabled={!source || busy}>
          <FileUpIcon />
          {phase === "uploading" ? "Uploading…" : phase === "extracting" ? "Extracting…" : "Extract"}
        </Button>
      </div>

      {source && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-[70vh] lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
            <SourceViewer source={source} target={target} />
          </div>
          <div>
            {extraction ? (
              // Mounted fresh for every extraction (it is cleared before each run), so its edits reset.
              <ReviewPanel
                extraction={extraction.data}
                model={extraction.model}
                onJump={source.file.type === "application/pdf" ? jumpTo : undefined}
              />
            ) : busy ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Extract to pull the facts out of this document and check them against the source.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
