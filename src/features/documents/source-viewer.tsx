"use client";

/** A document to show: a local blob URL for a file just chosen, or any URL the browser can open. */
export type Source = { name: string; type: string; url: string };

/**
 * What to show: a page, and optionally a quote to highlight on it. `nonce` changes on every jump,
 * so asking for the same place twice still works.
 */
export type ViewTarget = { page: number; quote: string | null; nonce: number };

// A text fragment (":~:text=start,end") makes Chrome's PDF viewer scroll to a passage and highlight
// it. Only the start and end of a long quote are sent, which tolerates small slips in the middle;
// a quote the document does not contain simply shows no highlight.
function textFragment(quote: string) {
  const encode = (text: string) => encodeURIComponent(text).replace(/-/g, "%2D");
  // Dot leaders ("Total ........ $5.00") rarely survive quoting exactly, so match around them.
  const parts = quote
    .split(/\s*\.{4,}\s*/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length > 1) return `:~:text=${encode(parts[0])},${encode(parts.at(-1)!)}`;
  const words = parts[0].split(" ");
  return words.length <= 8
    ? `:~:text=${encode(parts[0])}`
    : `:~:text=${encode(words.slice(0, 4).join(" "))},${encode(words.slice(-4).join(" "))}`;
}

/** The source document in the browser's own viewer, so the reviewer can check quotes against it. */
export function SourceViewer({ source, target }: { source: Source; target: ViewTarget }) {
  const isPdf = source.type === "application/pdf";
  const fragment = `#page=${target.page}&navpanes=0&view=FitH${target.quote ? textFragment(target.quote) : ""}`;
  return (
    // The built-in PDF viewer ignores a change to the fragment of a loaded document, so `key`
    // remounts the iframe for every jump.
    <iframe
      key={target.nonce}
      title={`Source document: ${source.name}`}
      src={isPdf ? source.url + fragment : source.url}
      className="size-full rounded-lg border bg-muted"
    />
  );
}
