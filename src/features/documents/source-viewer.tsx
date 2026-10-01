"use client";

export type Source = { file: File; url: string; text: string | null };

/** Which page to show. `nonce` changes on every jump, so asking for the same page twice still works. */
export type PageTarget = { page: number; nonce: number };

/** The uploaded file, shown with the browser's own viewer so the reviewer can check quotes against it. */
export function SourceViewer({ source, target }: { source: Source; target: PageTarget }) {
  const { file, url, text } = source;

  if (file.type === "application/pdf") {
    return (
      // The built-in PDF viewer ignores a change to #page on a loaded document, so `key`
      // remounts the iframe for every jump. The blob URL is local, so this is instant.
      <iframe
        key={target.nonce}
        title={`Source document: ${file.name}`}
        src={`${url}#page=${target.page}&navpanes=0&view=FitH`}
        className="size-full rounded-lg border bg-muted"
      />
    );
  }

  if (file.type.startsWith("image/")) {
    return (
      <div className="size-full overflow-auto rounded-lg border bg-muted/40 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL, nothing for next/image to optimise */}
        <img src={url} alt={`Source document: ${file.name}`} className="mx-auto max-w-full" />
      </div>
    );
  }

  return (
    <pre className="size-full overflow-auto rounded-lg border bg-muted/40 p-4 font-mono text-xs whitespace-pre-wrap">
      {text}
    </pre>
  );
}
