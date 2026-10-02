"use client";

import { useState } from "react";
import { postJson } from "@/lib/fetch-json";
import { fileSize, type ReceivedFile } from "./schema";

/**
 * A file a provider's office sent with its update, as the firm opens it: the file's name, which
 * opens it in a new tab from our private storage. It is not in Clio, and opening it writes nothing.
 */
export function ReceivedFileLink({ shareId, file }: { shareId: string; file: ReceivedFile }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    // The tab is opened in the click itself, which a browser allows; the address is filled in once it is known.
    const tab = window.open("", "_blank");
    setOpening(true);
    setError(null);
    try {
      const { url } = await postJson<{ url: string }>("/api/shares/file", { shareId, path: file.path });
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "The file could not be opened.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={opening}
        className="cursor-pointer rounded-sm text-left font-serif text-[15px] leading-snug [overflow-wrap:anywhere] text-foreground underline decoration-input underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-wait"
      >
        {file.name}
      </button>
      <span className="whitespace-nowrap">, {fileSize(file.bytes)}</span>
      {opening && <span role="status"> Opening…</span>}
      {error && (
        <span role="alert" className="block text-destructive">
          The file did not open. {error} Try again.
        </span>
      )}
    </>
  );
}
