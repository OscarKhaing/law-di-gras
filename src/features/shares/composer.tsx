"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@base-ui/react/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SourceLinks } from "@/features/brief/source-panel";
import { fetchJson, postJson } from "@/lib/fetch-json";
import { cn } from "@/lib/utils";
import { LocalTime } from "./local-time";
import { ProviderUpdateView } from "./provider-update-view";
import { SECTION_HEADINGS, SECTIONS, sectionOf, type DraftLine, type ProviderUpdate, type Section, type ShareStatus } from "./schema";
import { ShareLog } from "./share-log";

// Where the attorney decides what one provider's office may see. The lines on the left are the
// firm's; the page on the right is drawn by the same component the provider's link uses, from the
// lines switched on, so what is checked here is what is sent. Nothing leaves until "Publish".

type Head = Pick<ProviderUpdate, "firm" | "contactLine" | "patient" | "provider" | "stage" | "stages">;

type Props = {
  matterId: number;
  contactRef: string;
  providerName: string;
  /** The top of the update, built on the server by the same function publishing uses. */
  head: Head;
  /** The lines as last published to this office's live link, or null when no link is live. */
  storedDraft: DraftLine[] | null;
  /** Every update shared with this office, newest first. */
  shares: ShareStatus[];
  published: Record<string, { id: string; text: string }[]>;
  /** The server's time when the page was loaded. */
  now: string;
  /** When a link made now would stop working. */
  newLinkExpiresAt: string;
  linkDays: number;
};

type Phase = { name: "idle" } | { name: "drafting"; startedAt: number } | { name: "failed"; message: string };
/** The wording each line arrived with, to show an edit and to restore it. */
type Baseline = { wording: Record<string, string>; from: "drafted" | "published" };
type Fresh = { shareId: string; at: string; expiresAt: string; sameLink: boolean };
type LinkShown = { url: string; expiresAt: string; copied: boolean };

/** A line the attorney wrote has an id that says so, so it is still known as theirs after a reload. */
const OWN = "own-";
const MAX_LINES = 80;
const MAX_LENGTH = 1000;
/** A section of more than FOLD_OVER lines, all switched off, shows FOLD_TO of them until it is opened out. */
const FOLD_OVER = 4;
const FOLD_TO = 3;

const isOwn = (line: DraftLine) => line.id.startsWith(OWN);
const isBlank = (line: DraftLine) => line.text.trim() === "";
const wordingOf = (lines: DraftLine[]) => Object.fromEntries(lines.map((line) => [line.id, line.text]));
/** What publishing would send, as text: two sets of lines are the same update when this matches. */
const comparable = (lines: DraftLine[]) =>
  JSON.stringify(lines.filter((line) => !isBlank(line)).map((line) => [line.id, sectionOf(line.section), line.text.trim(), line.share]));
const count = (number: number, word: string) => `${number} ${word}${number === 1 ? "" : "s"}`;
const messageOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export function Composer({ matterId, contactRef, providerName, head, storedDraft, shares, published, now, newLinkExpiresAt, linkDays }: Props) {
  const router = useRouter();
  const [lines, setLines] = useState<DraftLine[]>(storedDraft ?? []);
  const [baseline, setBaseline] = useState<Baseline>({ wording: wordingOf(storedDraft ?? []), from: "published" });
  /** The update as last published, to tell whether anything has changed since. */
  const [snapshot, setSnapshot] = useState<string | null>(storedDraft ? comparable(storedDraft) : null);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [askRedraft, setAskRedraft] = useState(false);
  /** Counts drafts that landed in this visit; the ledger arrives with a movement only then. */
  const [arrived, setArrived] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  /** Sections whose long run of switched-off lines has been opened out. */
  const [opened, setOpened] = useState<Section[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Fresh | null>(null);
  const [link, setLink] = useState<LinkShown | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [withdrawn, setWithdrawn] = useState<string[]>([]);
  const stop = useRef<AbortController | null>(null);

  // What this visit did, laid over what the server last sent, until the next reload brings it back.
  const log: ShareStatus[] = shares.map((share) => (withdrawn.includes(share.id) ? { ...share, revoked: true } : share));
  if (fresh && !log.some((share) => share.id === fresh.shareId)) {
    log.unshift({
      id: fresh.shareId,
      contactRef,
      contactName: providerName,
      publishedAt: fresh.at,
      expiresAt: fresh.expiresAt,
      revoked: withdrawn.includes(fresh.shareId),
      opens: 0,
      lastOpenedAt: null,
      replies: [],
      files: [],
    });
  }
  const live = log.find((share) => !share.revoked && Date.parse(share.expiresAt) > Date.parse(now)) ?? null;

  const shared = SECTIONS.flatMap((section) => lines.filter((line) => line.share && !isBlank(line) && sectionOf(line.section) === section));
  const kept = lines.filter((line) => !isBlank(line)).length - shared.length;
  const unpublished = lines.length > 0 && comparable(lines) !== snapshot;
  const drafting = phase.name === "drafting";

  const update: ProviderUpdate = {
    ...head,
    lines: shared.map((line) => ({ id: line.id, section: line.section, text: line.text.trim() })),
    publishedAt: live?.publishedAt ?? now,
    expiresAt: live?.expiresAt ?? newLinkExpiresAt,
  };

  // Coming back to this tab (say, from the provider's page) brings in new opens and replies.
  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [router]);

  // Leaving would lose lines that were never published, or a link that was never copied.
  const atRisk = unpublished || (link !== null && !link.copied);
  useEffect(() => {
    if (!atRisk) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [atRisk]);

  const change = (id: string, patch: Partial<DraftLine>) =>
    setLines((list) => list.map((line) => (line.id === id ? { ...line, ...patch } : line)));

  function add(section: Section) {
    const id = OWN + Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => (byte % 36).toString(36)).join("");
    setLines((list) => [...list, { id, section, text: "", yourCall: false, evidence: [], share: true }]);
    setFocusId(id);
  }

  async function draft() {
    const control = new AbortController();
    stop.current = control;
    setAskRedraft(false);
    setPhase({ name: "drafting", startedAt: Date.now() });
    try {
      const { lines: drafted } = await fetchJson<{ lines: DraftLine[] }>("/api/shares/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matterId, contactRef }),
        signal: control.signal,
      });
      setLines(drafted);
      setBaseline({ wording: wordingOf(drafted), from: "drafted" });
      setArrived((times) => times + 1);
      setPhase({ name: "idle" });
    } catch (err) {
      // Stopping is the attorney's own doing, not a failure.
      setPhase(control.signal.aborted ? { name: "idle" } : { name: "failed", message: messageOf(err, "The request did not complete.") });
    }
  }

  async function publish() {
    setPublishing(true);
    setPublishError(null);
    try {
      const sent = lines
        .filter((line) => !(isOwn(line) && isBlank(line)))
        .map(({ id, section, text, yourCall, evidence, share }) => ({
          id,
          section,
          text,
          yourCall,
          evidence: evidence.map(({ source, quote }) => ({ source, quote })),
          share,
        }));
      const result = await postJson<{ token: string | null; expiresAt: string; shareId: string }>("/api/shares/publish", {
        matterId,
        contactRef,
        lines: sent,
      });
      setSnapshot(comparable(lines));
      setFresh({ shareId: result.shareId, at: new Date().toISOString(), expiresAt: result.expiresAt, sameLink: result.token === null });
      if (result.token) {
        const url = `${window.location.origin}/p/${result.token}`;
        let copied = false;
        try {
          await navigator.clipboard.writeText(url);
          copied = true;
        } catch {
          // The browser would not copy without being asked again; the link is on screen with a Copy button.
        }
        setCopyFailed(false);
        setLink({ url, expiresAt: result.expiresAt, copied });
      }
      router.refresh();
    } catch (err) {
      setPublishError(messageOf(err, "The request did not complete."));
    } finally {
      setPublishing(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setLink({ ...link, copied: true });
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  }

  function onWithdrawn(shareId: string) {
    setWithdrawn((list) => [...list, shareId]);
    // The link is dead, so there is nothing left to copy, and the lines are no longer published anywhere.
    setLink(null);
    setFresh(null);
    setSnapshot(null);
    router.refresh();
  }

  const failed = phase.name === "failed" && (
    <div role="alert" className="max-w-prose border-l-2 border-destructive pl-3 text-sm">
      <p className="font-medium text-destructive">The update could not be drafted</p>
      <p className="mt-1">{phase.message}</p>
      <p className="mt-1 text-muted-foreground">
        Nothing was shared{lines.length > 0 ? ", and the lines below are as you left them" : ""}.
      </p>
      <Button size="sm" className="mt-2" onClick={draft}>
        Try again
      </Button>
    </div>
  );

  return (
    <div className="space-y-12">
      {drafting ? (
        <Drafting startedAt={phase.startedAt} onStop={() => stop.current?.abort()} />
      ) : lines.length === 0 ? (
        <div className="max-w-prose space-y-4">
          {failed || (
            <>
              <p className="leading-relaxed">
                Nothing has been drafted for this office yet. A draft is written only from what concerns this office: its open
                requests, its messages with the firm, calendar entries that name it and the records the firm holds from it.
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                You then check each line and switch it on or off. Nothing leaves the firm until you publish.
              </p>
              <Button size="lg" className="h-10 px-4" onClick={draft}>
                Draft an update
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid items-start gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_27rem]">
          <section aria-labelledby="lines-heading" className="@container min-w-0 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
              <div className="space-y-1">
                <h2 id="lines-heading" className="font-heading text-xl font-semibold tracking-tight">
                  Lines for this office
                </h2>
                <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                  Switch on what the office may read and keep the rest in the firm. A line marked{" "}
                  <mark className="bg-marker px-1 py-0.5 text-xs text-foreground">Your call</mark> states an amount, attendance,
                  another provider&rsquo;s treatment or timing, and starts switched off.
                </p>
              </div>
              {!askRedraft && (
                <Button variant="outline" size="sm" onClick={() => setAskRedraft(true)}>
                  Draft again
                </Button>
              )}
            </div>

            {askRedraft && (
              <div className="max-w-prose space-y-2 border-l-2 border-marker bg-marker-soft px-3 py-2 text-sm">
                <p className="leading-relaxed">
                  Draft again from the case as it stands now? The lines below are replaced, with your edits and switches.
                  {live ? " The office keeps seeing what was last published until you publish again." : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={draft}>
                    Replace the lines
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAskRedraft(false)}>
                    Keep these lines
                  </Button>
                </div>
              </div>
            )}

            {failed}

            <p className={cn("border-l-2 pl-3 text-sm leading-relaxed", live ? "border-primary" : "border-border text-muted-foreground")}>
              {live ? (
                <>
                  <span className="font-medium text-primary">A link is live for this office.</span> Published{" "}
                  <LocalTime iso={live.publishedAt} />; it works until <LocalTime iso={live.expiresAt} style="date" />.{" "}
                  {unpublished ? "You have changes the office cannot see yet." : "The lines below are what the office sees."}
                </>
              ) : log.length > 0 ? (
                "No link is live for this office. Publishing makes a new one."
              ) : (
                "Not shared yet. Nothing leaves the firm until you publish."
              )}
            </p>

            <div
              key={arrived}
              className={cn("border-b", arrived > 0 && "animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none")}
            >
              {SECTIONS.map((section) => {
                const mine = lines.filter((line) => sectionOf(line.section) === section);
                // A long section with every line switched off shows its first lines; nothing hidden can be shared.
                const folded = mine.length > FOLD_OVER && mine.every((line) => !line.share) && !opened.includes(section);
                const shown = folded ? mine.slice(0, FOLD_TO) : mine;
                return (
                  <div key={section} className="grid gap-x-6 gap-y-1 border-t py-3 @xl:grid-cols-[9.5rem_minmax(0,1fr)]">
                    <h3 className="text-sm leading-snug font-medium @xl:pt-3">{SECTION_HEADINGS[section]}</h3>
                    <div className="min-w-0">
                      {mine.length === 0 ? (
                        <p className="pt-3 pb-1 text-sm text-muted-foreground">No line here.</p>
                      ) : (
                        <ul className="divide-y">
                          {shown.map((line) => (
                            <LineRow
                              key={line.id}
                              line={line}
                              heading={SECTION_HEADINGS[section]}
                              drafted={baseline.wording[line.id]}
                              from={baseline.from}
                              focus={line.id === focusId}
                              onChange={(patch) => change(line.id, patch)}
                              onRemove={() => setLines((list) => list.filter((other) => other.id !== line.id))}
                            />
                          ))}
                        </ul>
                      )}
                      {folded && (
                        <p className="border-t py-2 pl-12 text-xs text-muted-foreground">
                          {mine.length - FOLD_TO} more lines here, all kept in the firm.{" "}
                          <button type="button" className={linkClass} onClick={() => setOpened((list) => [...list, section])}>
                            Show all {mine.length}
                          </button>
                        </p>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2.5 text-muted-foreground"
                        onClick={() => add(section)}
                        disabled={lines.length >= MAX_LINES}
                      >
                        Add a line
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* The one action comes first in the column, so it is on screen however long the preview is. */}
          <aside aria-labelledby="preview-heading" className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)]">
            <div className="space-y-2.5 border-b pb-4">
              <p className="text-sm leading-relaxed">
                {shared.length === 0
                  ? "Nothing to share: every line is switched off or empty. Switch on at least one line to publish."
                  : `${count(shared.length, "line")} will be shared with the office. ${kept === 0 ? "None are" : kept === 1 ? "1 is" : `${kept} are`} kept in the firm.`}
              </p>
              <Button
                size="lg"
                className="h-10 w-full px-4"
                onClick={publish}
                disabled={publishing || shared.length === 0 || (live !== null && !unpublished)}
              >
                {publishing ? "Publishing…" : live ? "Publish to the same link" : "Publish and copy link"}
              </Button>

              {publishError && (
                <p role="alert" className="border-l-2 border-destructive pl-3 text-sm leading-relaxed">
                  <span className="font-medium text-destructive">The update was not published.</span> {publishError} Your lines are
                  still here; publish again.
                </p>
              )}

              {!publishing && !publishError && live && !link && (
                <p role="status" className="text-xs leading-relaxed text-muted-foreground">
                  {unpublished
                    ? "The office’s link stays the same; publishing changes what it shows."
                    : fresh?.sameLink
                      ? "Published. The office’s link is the same and now shows these lines."
                      : "Nothing has changed since you published."}{" "}
                  The link itself is not kept here. If the office has lost it, withdraw it below and publish a new one.
                </p>
              )}
              {!live && !link && shared.length > 0 && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  A new link works for {linkDays} days. You send it to the office yourself.
                </p>
              )}

              {link && (
                <div role="status" className="space-y-2 border-l-2 border-marker bg-marker-soft px-3 py-2.5">
                  <p className="text-sm font-medium">
                    {fresh?.sameLink
                      ? "Published. The link is the same and now shows these lines."
                      : link.copied
                        ? "Published, and the link is copied."
                        : "Published. Copy the link now."}
                  </p>
                  <p className="text-xs leading-relaxed">
                    This link is shown only now. It is not kept, so it cannot be shown again once you leave this page. Send it to
                    the office yourself; it works until <LocalTime iso={link.expiresAt} style="date" />.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={link.url}
                      aria-label="The link for the provider's office"
                      onFocus={(event) => event.currentTarget.select()}
                      className="h-8 min-w-0 flex-1 bg-card text-xs md:text-xs"
                    />
                    <Button variant="outline" onClick={copy}>
                      {link.copied ? "Copy again" : "Copy"}
                    </Button>
                  </div>
                  {copyFailed && <p className="text-xs">The browser would not copy it. Select the link above and copy it by hand.</p>}
                </div>
              )}
            </div>
            <h2 id="preview-heading" className="font-heading text-xl font-semibold tracking-tight text-balance">
              What {providerName} will see
            </h2>
            <div className="min-h-48 overflow-y-auto rounded-md border bg-card px-5 py-6">
              <ProviderUpdateView update={update} replies={live?.replies ?? []} files={live?.files ?? []} preview />
            </div>
          </aside>
        </div>
      )}

      <ShareLog providerName={providerName} shares={log} published={published} now={now} onWithdrawn={onWithdrawn} />
    </div>
  );
}

function LineRow({
  line,
  heading,
  drafted,
  from,
  focus,
  onChange,
  onRemove,
}: {
  line: DraftLine;
  heading: string;
  /** The wording the line arrived with; undefined for a line just added. */
  drafted: string | undefined;
  from: Baseline["from"];
  focus: boolean;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}) {
  const own = isOwn(line);
  const blank = isBlank(line);
  const edited = drafted !== undefined && line.text !== drafted;
  const on = line.share && !blank;

  return (
    <li className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 py-3">
      <Switch.Root
        checked={line.share}
        onCheckedChange={(share) => onChange({ share })}
        aria-label={`Share this line with the office: ${line.text.trim() || "an empty line"}`}
        className="relative mt-2 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-input outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:bg-primary"
      >
        <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-card shadow-sm transition-transform data-checked:translate-x-[1.125rem]" />
      </Switch.Root>

      <div className="min-w-0 space-y-1.5">
        <Textarea
          value={line.text}
          onChange={(event) => onChange({ text: event.target.value })}
          rows={1}
          maxLength={MAX_LENGTH}
          autoFocus={focus}
          aria-label={`Wording of a line under ${heading}`}
          placeholder="One plain sentence for the office"
          className={cn(
            "min-h-0 resize-none px-2.5 py-1.5 font-serif text-[17px] leading-relaxed md:text-[17px]",
            on ? "bg-card" : "border-transparent bg-muted text-muted-foreground",
          )}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {line.yourCall && <mark className="mr-1.5 bg-marker px-1 py-0.5 text-foreground">Your call</mark>}
          <span className={on ? "font-medium text-primary" : undefined}>
            {blank ? "Empty, so it is not shared." : line.share ? "Share with the office." : "Keep in the firm."}
          </span>
          {edited && (
            <>
              {" "}
              Edited.{" "}
              <button type="button" className={linkClass} onClick={() => onChange({ text: drafted })}>
                Restore the {from} wording
              </button>
            </>
          )}
          {own && (
            <>
              {" "}
              Added by you.{" "}
              <button type="button" className={linkClass} onClick={onRemove}>
                Remove this line
              </button>
            </>
          )}
          {line.text.length >= MAX_LENGTH - 100 && ` ${line.text.length} of ${MAX_LENGTH} characters.`}
        </p>
        {line.evidence.length > 0 ? (
          <SourceLinks evidence={line.evidence} />
        ) : own ? null : sectionOf(line.section) === "status" ? (
          <p className="text-xs text-muted-foreground">From the matter&rsquo;s status and stage in Clio.</p>
        ) : (
          <p className="text-xs leading-relaxed">
            <span className="bg-marker-soft box-decoration-clone px-1 py-0.5">
              The draft gives no source for this line. Check it against the case before sharing it.
            </span>
          </p>
        )}
      </div>
    </li>
  );
}

const linkClass =
  "cursor-pointer rounded-sm underline decoration-input underline-offset-2 outline-none hover:text-foreground hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

/** While the draft is being written: what is happening, for how long, and a way to stop. */
function Drafting({ startedAt, onStop }: { startedAt: number; onStop: () => void }) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000));

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p role="status" className="text-sm leading-relaxed">
          Drafting the update from what the case holds about this office. This takes about 20 seconds.{" "}
          <span className="text-muted-foreground tabular-nums">{seconds} s</span>
        </p>
        <Button variant="outline" size="sm" onClick={onStop}>
          Stop drafting
        </Button>
      </div>
      <div className="divide-y border-y" aria-hidden>
        {["w-20", "w-32", "w-28", "w-24"].map((width, index) => (
          <div key={index} className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-x-6 py-4">
            <Skeleton className={cn("h-4", width)} />
            <div className="space-y-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
