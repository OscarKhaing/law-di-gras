"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/fetch-json";
import { cn } from "@/lib/utils";

// Reading a case is three real steps, each its own request so a long one can be watched and retried:
// read the matter from Clio, read each document page by page, write the brief. The server keeps
// what each step produced, so running them again after a failure repeats only what is missing.

type Synced = {
  matterId: number;
  entries: number;
  fingerprint: string;
  documents: { ref: string; title: string; indexed: boolean }[];
};
type Status = "waiting" | "running" | "done" | "failed";
type Progress = {
  phase: "idle" | "running" | "failed" | "done";
  /** Which step is running or failed: 1 Clio, 2 documents, 3 brief. */
  step: 1 | 2 | 3;
  startedAt: number;
  entries: number | null;
  documents: { total: number; done: number; reading: string[]; unread: { title: string; message: string }[] } | null;
  error: string | null;
};

const IDLE: Progress = { phase: "idle", step: 1, startedAt: 0, entries: null, documents: null, error: null };
const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

function clock(seconds: number) {
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}

/** Seconds since `startedAt` while `running`, so a long step visibly moves. */
function useElapsed(running: boolean, startedAt: number) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return Math.max(0, Math.round((now - startedAt) / 1000));
}

function Mark({ status }: { status: Status }) {
  if (status === "done") return <CheckIcon className="size-4 text-primary" aria-label="Done" />;
  if (status === "running") return <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" aria-label="In progress" />;
  if (status === "failed") return <XIcon className="size-4 text-destructive" aria-label="Failed" />;
  return <span className="mx-auto block size-1.5 rounded-full bg-input" aria-label="Not started" />;
}

function Steps({ progress }: { progress: Progress }) {
  const elapsed = useElapsed(progress.phase === "running", progress.startedAt);
  const status = (step: 1 | 2 | 3): Status => {
    if (progress.phase === "done" || step < progress.step) return "done";
    if (step > progress.step) return "waiting";
    return progress.phase === "failed" ? "failed" : "running";
  };
  const timer = (step: 1 | 2 | 3) => (status(step) === "running" ? clock(elapsed) : "");
  const documents = progress.documents;
  const rows: { step: 1 | 2 | 3; title: string; detail: string }[] = [
    {
      step: 1,
      title: "Read the case from Clio",
      detail: progress.entries !== null ? `${progress.entries} entries` : status(1) === "running" ? "Notes, emails, calls, tasks, calendar, expenses and documents" : "",
    },
    {
      step: 2,
      title: "Read the documents page by page",
      detail: !documents
        ? status(2) === "waiting"
          ? "A long scan can take a few minutes"
          : ""
        : documents.total === 0
          ? "Every document was already read"
          : `${documents.done} of ${documents.total}`,
    },
    {
      step: 3,
      title: "Write the brief",
      detail: status(3) === "done" ? "" : "One to two minutes",
    },
  ];

  return (
    <ol className="mt-4 max-w-xl divide-y border-y text-sm">
      {rows.map((row) => (
        <li key={row.step} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-baseline gap-x-3 py-2">
          <span className="self-center">
            <Mark status={status(row.step)} />
          </span>
          <span className={cn(status(row.step) === "waiting" && "text-muted-foreground")}>
            {row.title}
            {row.detail && <span className="ml-2 text-muted-foreground tabular-nums">{row.detail}</span>}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">{timer(row.step)}</span>
          {row.step === 2 &&
            documents?.reading.map((title) => (
              <span key={title} className="col-start-2 truncate font-serif text-[13px] text-muted-foreground">
                Reading {title}
              </span>
            ))}
        </li>
      ))}
    </ol>
  );
}

/** Runs the steps, and holds what the screen shows about them. */
function useReading(matterId: number) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress>(IDLE);
  const [refreshing, startRefresh] = useTransition();

  /** Run from the first step, or from the third to write the brief without the documents that failed. */
  async function run(from: 1 | 3 = 1) {
    let step: 1 | 2 | 3 = from;
    try {
      if (from === 1) {
        setProgress({ ...IDLE, phase: "running", startedAt: Date.now() });
        const synced = await postJson<Synced>("/api/cases/sync", { matterId });
        const pending = synced.documents.filter((document) => !document.indexed);

        step = 2;
        setProgress((now) => ({
          ...now,
          step: 2,
          startedAt: Date.now(),
          entries: synced.entries,
          documents: { total: pending.length, done: 0, reading: [], unread: [] },
        }));
        const unread: { title: string; message: string }[] = [];
        let next = 0;
        const reading = (change: (titles: string[]) => string[], finished: number) =>
          setProgress((now) =>
            now.documents
              ? { ...now, documents: { ...now.documents, reading: change(now.documents.reading), done: now.documents.done + finished } }
              : now,
          );
        // Two documents at a time: enough to move, not enough to trip the model's rate limit.
        const reader = async () => {
          while (next < pending.length) {
            const document = pending[next++];
            reading((titles) => [...titles, document.title], 0);
            try {
              await postJson("/api/documents/index", { matterId, ref: document.ref });
              reading((titles) => titles.filter((title) => title !== document.title), 1);
            } catch (err) {
              unread.push({ title: document.title, message: messageOf(err) });
              reading((titles) => titles.filter((title) => title !== document.title), 0);
            }
          }
        };
        await Promise.all([reader(), reader()]);
        if (unread.length > 0) {
          setProgress((now) => ({
            ...now,
            phase: "failed",
            error: unread.length === 1 ? "One document could not be read." : `${unread.length} documents could not be read.`,
            documents: now.documents && { ...now.documents, unread },
          }));
          return;
        }
      }

      step = 3;
      setProgress((now) => ({ ...now, phase: "running", step: 3, startedAt: Date.now(), error: null }));
      await postJson("/api/brief/build", { matterId });
      setProgress((now) => ({ ...now, phase: "done" }));
      startRefresh(() => router.refresh());
    } catch (err) {
      setProgress((now) => ({ ...now, phase: "failed", step, error: messageOf(err) }));
    }
  }

  return { progress, refreshing, run };
}

function Failure({ progress, onRetry, onSkip }: { progress: Progress; onRetry: () => void; onSkip: () => void }) {
  const unread = progress.step === 2 ? (progress.documents?.unread ?? []) : [];
  const where = progress.step === 1 ? "Clio could not be read" : progress.step === 2 ? "The documents were not all read" : "The brief could not be written";
  return (
    <div role="alert" className="mt-4 max-w-xl border-l-2 border-destructive pl-3 text-sm">
      <p className="font-medium text-destructive">{where}</p>
      <p className="mt-1">{progress.error}</p>
      {unread.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {unread.map((document) => (
            <li key={document.title}>
              <span className="font-serif">{document.title}</span>
              <span className="block text-xs text-muted-foreground">{document.message}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {progress.step === 1
          ? "Nothing was read. If the matter is not in your Clio account, pick it again from the case list."
          : "What was read is kept, so trying again only repeats what is missing."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
        {unread.length > 0 && (
          <Button size="sm" variant="outline" onClick={onSkip}>
            Write the brief without {unread.length === 1 ? "it" : "them"}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The control that reads a case. `situation` is why it is on the page: the matter has not been read
 * into Case Desk, it has been read but has no brief, or Clio has changed since the brief was written.
 */
export function ReadCase({ matterId, situation }: { matterId: number; situation: "unread" | "no brief" | "stale" }) {
  const { progress, refreshing, run } = useReading(matterId);
  const busy = progress.phase === "running" || refreshing;
  const started = progress.phase !== "idle";

  const body = started && (
    <>
      <Steps progress={progress} />
      {progress.phase === "running" && (
        <p className="mt-2 text-xs text-muted-foreground">
          You can leave this page. What has been read so far is kept, and reading picks up from there.
        </p>
      )}
      {progress.phase === "failed" && (
        <Failure progress={progress} onRetry={() => run(progress.step === 3 ? 3 : 1)} onSkip={() => run(3)} />
      )}
      {progress.phase === "done" && (
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          {refreshing ? "Opening the brief" : "The brief is written."}
        </p>
      )}
    </>
  );

  if (situation === "stale") {
    return (
      <div className="border-l-2 border-marker bg-marker-soft px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="text-sm">
            Clio has changed since this brief was written. The brief below is the earlier one.
          </p>
          {progress.phase === "idle" && (
            <Button size="sm" onClick={() => run()} disabled={busy}>
              Update the brief
            </Button>
          )}
        </div>
        {body}
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-heading text-xl font-semibold tracking-tight">
        {situation === "unread" ? "This matter has not been read into Case Desk yet" : "The brief for this case has not been written yet"}
      </h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        {situation === "unread"
          ? `Reading matter ${matterId} copies its file from Clio, reads each document page by page and writes the brief. Nothing in Clio is changed.`
          : "The case has been read from Clio. What is left is reading its documents page by page and writing the brief."}
      </p>
      {progress.phase === "idle" && (
        <Button className="mt-4" size="lg" onClick={() => run()} disabled={busy}>
          {situation === "unread" ? "Read this case" : "Finish reading this case"}
        </Button>
      )}
      {body}
    </div>
  );
}

/** "Check Clio" in the header: read the matter again, then show the page afresh. */
export function CheckClio({ matterId, fingerprint }: { matterId: number; fingerprint: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ status: "idle" | "checking" | "same" | "changed" } | { status: "failed"; message: string }>({
    status: "idle",
  });
  const [refreshing, startRefresh] = useTransition();
  const checking = state.status === "checking" || refreshing;

  const check = async () => {
    setState({ status: "checking" });
    try {
      const synced = await postJson<Synced>("/api/cases/sync", { matterId });
      setState({ status: synced.fingerprint === fingerprint ? "same" : "changed" });
      startRefresh(() => router.refresh());
    } catch (err) {
      setState({ status: "failed", message: messageOf(err) });
    }
  };

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button variant="outline" size="sm" onClick={check} disabled={checking}>
        {checking && <LoaderCircleIcon className="animate-spin" />}
        {checking ? "Checking Clio" : "Check Clio"}
      </Button>
      {!checking && state.status === "same" && (
        <p className="text-xs text-muted-foreground" role="status">
          Nothing has changed in Clio.
        </p>
      )}
      {state.status === "failed" && (
        <p className="max-w-64 text-xs text-destructive sm:text-right" role="alert">
          Clio could not be checked: {state.message} Try again in a minute.
        </p>
      )}
    </div>
  );
}

/** "Regenerate brief" in the matter header: read the matter from Clio again and write the brief afresh. */
export function RegenerateBrief({ matterId }: { matterId: number }) {
  const { progress, refreshing, run } = useReading(matterId);
  const busy = progress.phase === "running" || refreshing;
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button
        size="sm"
        variant="outline"
        onClick={() => run()}
        disabled={busy}
        title="Reads the matter from Clio again and writes a new brief. Takes a few minutes and costs about a dollar."
      >
        {busy && <LoaderCircleIcon className="animate-spin" />}
        {busy ? "Regenerating" : "Regenerate brief"}
      </Button>
      {progress.phase !== "idle" && (
        <div className="w-full max-w-sm rounded-lg border bg-card p-3 text-left">
          <Steps progress={progress} />
          {progress.phase === "failed" && (
            <Failure progress={progress} onRetry={() => run(progress.step === 3 ? 3 : 1)} onSkip={() => run(3)} />
          )}
          {progress.phase === "done" && (
            <p className="mt-2 text-sm text-muted-foreground" role="status">
              {refreshing ? "Opening the new brief" : "The brief is written."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
