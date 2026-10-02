"use client";

import { useEffect, useMemo, useState } from "react";
import { SourceLinks, type SourceLink } from "@/components/source-links";
import { byRef, parseSource, type CaseFile } from "@/features/cases/schema";
import { cn } from "@/lib/utils";
import { BriefHeader } from "./brief-header";
import { FullFile } from "./full-file";
import type { StoredBrief } from "./schema";
import { SourcePanel, describeSource, type Opened } from "./source-panel";

/**
 * The brief for one case, read top to bottom, with the source panel on the right. Selecting any
 * line's source, or any row of the full file, opens that entry in the panel.
 */
export function CaseBrief({
  file,
  stored,
  documentUrls,
}: {
  file: CaseFile;
  stored: StoredBrief | null;
  /** Signed URLs for document entries, by ref. A document without one is described but not shown. */
  documentUrls: Record<string, string>;
}) {
  const entries = useMemo(() => byRef(file), [file]);
  const [opened, setOpened] = useState<Opened | null>(null);

  const open = (link: SourceLink) =>
    setOpened({ source: link.source, quote: link.quote, found: link.found ?? true, nonce: Date.now() });
  const describe = (source: string) => describeSource(source, entries);

  useEffect(() => {
    if (!opened) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpened(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opened]);

  const brief = stored?.brief;

  return (
    <div className={cn("grid gap-10", opened && "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
      <div className={cn("w-full min-w-0 space-y-10", !opened && "mx-auto max-w-3xl")}>
        <BriefHeader file={file} />

        {stored && !stored.current && (
          <p className="border-l-2 border-marker bg-marker-soft px-3 py-2 text-sm">
            Clio has changed since this brief was written. The full file below is up to date; the brief is not.
          </p>
        )}

        {brief ? (
          <section aria-label="Bottom line" className="space-y-2">
            <p className="max-w-prose font-serif text-xl leading-snug">{brief.bottomLine.text}</p>
            <SourceLinks evidence={brief.bottomLine.evidence} describe={describe} onOpen={open} />
          </section>
        ) : (
          <p className="max-w-prose text-sm text-muted-foreground">
            The brief for this case has not been written yet. Everything read from Clio is listed in the full file
            below; select an entry to read it.
          </p>
        )}

        <FullFile
          entries={file.entries}
          openRef={opened ? parseSource(opened.source).ref : null}
          onOpen={(ref) => open({ source: ref, quote: "" })}
        />
      </div>

      {opened && (
        // Opening a source is the screen's one piece of motion. Beside the brief on wide screens; over it otherwise.
        <aside
          aria-label="Source"
          className="fixed inset-x-0 top-12 bottom-0 z-30 animate-in border-l bg-background p-4 duration-300 fade-in slide-in-from-right-4 motion-reduce:animate-none xl:sticky xl:top-6 xl:z-auto xl:h-[calc(100svh-6rem)] xl:border-l-0 xl:bg-transparent xl:p-0"
        >
          <SourcePanel opened={opened} entries={entries} documentUrls={documentUrls} onClose={() => setOpened(null)} />
        </aside>
      )}
    </div>
  );
}
