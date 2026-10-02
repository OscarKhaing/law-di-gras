"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, LoaderCircleIcon, SendIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { postJson } from "@/lib/fetch-json";
import { ProviderUpdateView } from "./provider-update-view";
import { sectionOf, type DraftLine, type ProviderUpdate } from "./schema";

type Head = Pick<ProviderUpdate, "firm" | "contactLine" | "patient" | "provider" | "stage" | "stages">;

/** The usual requests to a treating office. Off until the attorney ticks them; generic, so nothing about the case is written here. */
const REQUESTS = [
  { id: "ask-records", text: "Your complete treatment records from the last production to date." },
  { id: "ask-bills", text: "An itemised bill with CPT codes, from the last production to date." },
  { id: "ask-narrative", text: "A narrative report from the treating provider." },
  { id: "ask-lien", text: "The current balance, and whether your office holds a lien on the case." },
];

// Lines a provider must never see, whatever the draft says: coverage is the firm's own business.
const NEVER = new Set(["coverage"]);

type State =
  | { status: "idle" }
  | { status: "drafting"; since: number }
  | { status: "ready" }
  | { status: "failed"; message: string }
  | { status: "sending" }
  | { status: "sent"; token: string | null; expiresAt: string };

/**
 * "Send update" for one provider: a drafted update, a checklist of what the firm needs, an optional
 * note, and a preview of exactly what the office will see. Nothing is sent until the attorney ticks
 * "I've reviewed this update". Clio is never written to; the update lives in Case Desk's database.
 */
export function SendUpdateDialog({ matterId, contactRef, head }: { matterId: number; contactRef: string; head: Head }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: "idle" });
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [asks, setAsks] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(0);

  const drafting = state.status === "drafting";
  useEffect(() => {
    if (!drafting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [drafting]);

  async function draft() {
    setNow(Date.now());
    setState({ status: "drafting", since: Date.now() });
    try {
      const { lines: drafted } = await postJson<{ lines: DraftLine[] }>("/api/shares/draft", { matterId, contactRef });
      setLines(drafted.filter((line) => !NEVER.has(sectionOf(line.section))));
      setState({ status: "ready" });
    } catch (err) {
      setState({ status: "failed", message: err instanceof Error ? err.message : String(err) });
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    // Drafting starts when the dialog opens, from the user's own click; a sent dialog starts over.
    if (next && (state.status === "idle" || state.status === "sent")) {
      setLines([]);
      setAsks({});
      setNote("");
      setReviewed(false);
      setCopied(false);
      void draft();
    }
  }

  const outgoing = useMemo<DraftLine[]>(() => {
    const own: DraftLine[] = [
      ...(note.trim() ? [{ id: "note", section: "status", text: note.trim(), yourCall: false, evidence: [], share: true }] : []),
      ...REQUESTS.filter((ask) => asks[ask.id]).map((ask) => ({ id: ask.id, section: "needs", text: ask.text, yourCall: false, evidence: [], share: true })),
    ];
    return [...own, ...lines];
  }, [lines, asks, note]);

  const shared = outgoing.filter((line) => line.share && line.text.trim() !== "");
  const preview: ProviderUpdate = {
    ...head,
    lines: shared.map((line) => ({ id: line.id, section: line.section, text: line.text.trim() })),
    publishedAt: new Date(0).toISOString(),
    expiresAt: new Date(0).toISOString(),
  };
  const needs = lines.filter((line) => sectionOf(line.section) === "needs");
  const others = lines.filter((line) => sectionOf(line.section) !== "needs");
  const toggle = (id: string, share: boolean) => setLines((all) => all.map((line) => (line.id === id ? { ...line, share } : line)));

  async function send() {
    setState({ status: "sending" });
    try {
      const result = await postJson<{ token: string | null; expiresAt: string }>("/api/shares/publish", {
        matterId,
        contactRef,
        lines: outgoing.map((line) => ({ ...line, evidence: line.evidence.map(({ source, quote }) => ({ source, quote })) })),
      });
      setState({ status: "sent", token: result.token, expiresAt: result.expiresAt });
      router.refresh();
    } catch (err) {
      setState({ status: "failed", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const link = state.status === "sent" && state.token ? `${window.location.origin}/p/${state.token}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <SendIcon />
        Send update
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="text-lg">Send an update to {head.provider}</DialogTitle>
          <DialogDescription>
            The office sees only what is ticked here, through a private link. Nothing is written to Clio.
          </DialogDescription>
        </DialogHeader>

        {state.status === "sent" ? (
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <p className="flex items-center gap-2 font-medium text-primary">
              <CheckIcon className="size-4" />
              {link ? "The update is published." : "The office's existing link now shows this update."}
            </p>
            {link && (
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1.5 font-mono text-xs">{link}</code>
                <Button
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                  }}
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Send the link to the office yourself. This page shows when it is viewed and when the office replies. The
              link stops working on <span className="font-mono">{state.expiresAt.slice(0, 10)}</span>; it can be withdrawn
              from the{" "}
              <Link href={`/cases/${matterId}/providers/${contactRef}`} className="text-primary underline-offset-2 hover:underline">
                full editor
              </Link>
              .
            </p>
          </div>
        ) : state.status === "drafting" ? (
          <div className="flex flex-col gap-3" role="status">
            <p className="text-sm text-muted-foreground">
              Drafting from what the firm may share with this office…{" "}
              <span className="font-mono">{Math.max(0, Math.round((now - state.since) / 1000))}s</span>
            </p>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : state.status === "failed" && lines.length === 0 ? (
          <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-danger/40 p-3 text-sm">
            <p>
              <span className="font-medium text-danger">The update could not be drafted.</span> {state.message}
            </p>
            <Button size="sm" variant="outline" onClick={draft}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto md:grid-cols-2">
            <div className="flex flex-col gap-5">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">What we need from this office</legend>
                {needs.map((line) => (
                  <Tick key={line.id} checked={line.share} onChange={(share) => toggle(line.id, share)} text={line.text} />
                ))}
                {REQUESTS.map((ask) => (
                  <Tick key={ask.id} checked={Boolean(asks[ask.id])} onChange={(on) => setAsks((all) => ({ ...all, [ask.id]: on }))} text={ask.text} />
                ))}
              </fieldset>
              {others.length > 0 && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Also in the update</legend>
                  {others.map((line) => (
                    <Tick
                      key={line.id}
                      checked={line.share}
                      onChange={(share) => toggle(line.id, share)}
                      text={line.text}
                      hint={line.yourCall ? "Your call: off until you tick it" : undefined}
                    />
                  ))}
                </fieldset>
              )}
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Note to the office (optional)</span>
                <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={1000} className="bg-card" placeholder="Shown first under the latest update" />
              </label>
              {state.status === "failed" && (
                <p role="alert" className="text-sm text-danger">
                  Not sent. {state.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Exactly what the office will see</p>
              <div className="rounded-lg border bg-background p-4">
                <ProviderUpdateView update={preview} preview />
              </div>
            </div>
          </div>
        )}

        {state.status !== "sent" && state.status !== "drafting" && lines.length + Object.values(asks).filter(Boolean).length + (note.trim() ? 1 : 0) > 0 && (
          <DialogFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={reviewed} onCheckedChange={(value) => setReviewed(Boolean(value))} />
              I&apos;ve reviewed this update
            </label>
            <Button onClick={send} disabled={!reviewed || shared.length === 0 || state.status === "sending"}>
              {state.status === "sending" ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
              {state.status === "sending" ? "Sending" : `Send ${shared.length} ${shared.length === 1 ? "line" : "lines"}`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Tick({ checked, onChange, text, hint }: { checked: boolean; onChange: (on: boolean) => void; text: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-md p-1.5 hover:bg-muted">
      <Checkbox className="mt-0.5" checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} />
      <span className="flex flex-col gap-0.5 text-sm leading-relaxed">
        {text}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}
