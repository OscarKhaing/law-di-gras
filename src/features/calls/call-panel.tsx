"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CallLog } from "./schema";

/** Where a call placed from this screen has got to. */
export type Phase =
  | { step: "number"; problem?: string }
  | { step: "preparing" }
  | { step: "microphone" }
  | { step: "dialling" }
  | { step: "ringing" }
  | { step: "connected"; since: number }
  | { step: "ending" }
  | { step: "ended" }
  | { step: "not-allowed"; message: string }
  | { step: "failed"; message: string; advice: string };

/** "42 s", "3 min 12 s". */
export function callLength(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return minutes === 0 ? `${seconds} s` : `${minutes} min ${seconds % 60} s`;
}

/** A US number as people write it; any other number as it is. */
export function writtenNumber(number: string): string {
  const us = number.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return us ? `(${us[1]}) ${us[2]}-${us[3]}` : number;
}

/** How a call that is over is put into words. `log` is null when the carrier has not reported yet. */
function outcome(log: CallLog | null): string {
  if (!log || log.seconds === null) return "Call ended. Its length will appear on the case when the phone carrier reports it.";
  if (log.status === "no-answer") return "No answer. Nothing was added to time on desk.";
  if (log.status === "busy") return "The line was busy. Nothing was added to time on desk.";
  if (log.status === "failed") return "The call did not go through. Nothing was added to time on desk.";
  if (log.status === "canceled" || log.seconds === 0) return "Hung up before anyone answered. Nothing was added to time on desk.";
  return `Call ended. ${callLength(log.seconds)}, counted in time on desk.`;
}

function Clock({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - since) / 1000));
  return (
    <span className="font-medium tabular-nums">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}

/**
 * The call while it runs, docked at the foot of the window so the case stays readable above it.
 * It is drawn outside the row that opened it, which is too narrow to hold it.
 */
export function CallPanel({
  phase,
  contactName,
  ringing,
  demonstration,
  transcribed,
  muted,
  log,
  onPlace,
  onDemonstration,
  onMute,
  onHangUp,
  onClose,
}: {
  phase: Phase;
  contactName: string;
  /** The number being rung, once known. */
  ringing: string;
  /** Whether the demonstration number is rung in the contact's place. */
  demonstration: boolean;
  transcribed: boolean;
  muted: boolean;
  log: CallLog | null;
  onPlace: (number: string) => void;
  onDemonstration: () => void;
  onMute: () => void;
  onHangUp: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const live = phase.step === "dialling" || phase.step === "ringing" || phase.step === "connected";
  const waiting = phase.step === "preparing" || phase.step === "microphone";
  const lines = log?.transcript ?? [];

  let status: ReactNode = null;
  if (phase.step === "preparing") status = "Getting the line ready.";
  if (phase.step === "microphone") status = "Asking for the microphone. Allow it in the browser's prompt.";
  if (phase.step === "dialling") status = "Dialling.";
  if (phase.step === "ringing") status = "Ringing.";
  if (phase.step === "connected") {
    status = (
      <>
        Connected <Clock since={phase.since} />
        {muted && <span className="text-muted-foreground"> They cannot hear you.</span>}
      </>
    );
  }
  if (phase.step === "ending") status = "Call ended. Waiting for its length from the phone carrier.";
  if (phase.step === "ended") status = outcome(log);

  return createPortal(
    <section
      aria-label={`Call to ${contactName}`}
      className="fixed inset-x-3 bottom-3 z-50 flex max-h-[min(34rem,calc(100vh-1.5rem))] flex-col rounded-xl border bg-card text-card-foreground shadow-lg sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[23rem]"
    >
      <header className="border-b px-4 pt-3 pb-2.5">
        <h2 className="font-heading text-lg leading-6 break-words">{contactName}</h2>
        {ringing && (
          <p className="text-sm leading-5 text-muted-foreground">
            <span className="font-serif text-foreground">{writtenNumber(ringing)}</span>
            {demonstration && ", the demonstration number"}
          </p>
        )}
      </header>

      <div className="min-h-0 space-y-3 overflow-y-auto px-4 py-3">
        {phase.step === "number" && (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (typed.trim()) onPlace(typed.trim());
            }}
          >
            <label htmlFor="call-number" className="block text-sm">
              Clio holds no number for this contact. Number to ring:
            </label>
            <Input
              id="call-number"
              type="tel"
              autoFocus
              autoComplete="off"
              placeholder="(555) 555-0100"
              className="font-serif"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
            {phase.problem && (
              <p role="alert" className="text-sm leading-5 text-destructive">
                {phase.problem}
              </p>
            )}
            <p className="text-xs leading-4 text-muted-foreground">
              The number is used for this call only. It is not saved to Clio.
            </p>
            <div className="flex gap-2 pt-1">
              <Button type="submit" size="sm" disabled={!typed.trim()}>
                Call
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </form>
        )}

        {status && (
          <p role="status" className="text-sm leading-5">
            {status}
          </p>
        )}

        {phase.step === "not-allowed" && (
          <div role="alert" className="space-y-2">
            <p className="rounded-md bg-marker-soft px-2.5 py-2 text-sm leading-5">
              {phase.message} The numbers on this sample matter are made up and may belong to strangers.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={onDemonstration}>
                Ring the demonstration number instead
              </Button>
              <Button size="sm" variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        {phase.step === "failed" && (
          <div role="alert" className="space-y-2">
            <p className="text-sm leading-5 text-destructive">{phase.message}</p>
            <p className="text-sm leading-5">{phase.advice}</p>
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        )}

        {(waiting || live) && (
          <p className="text-xs leading-4 text-muted-foreground">
            {transcribed
              ? "The length of this call and what is said on it are recorded on the case."
              : "The length of this call is recorded on the case."}
          </p>
        )}

        {lines.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <dl className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-sm leading-5">
              {lines.map((line, index) => (
                <div key={`${line.at}-${index}`} className="contents">
                  <dt className="text-xs leading-5 text-muted-foreground">{line.speaker === "firm" ? "You" : "They"}</dt>
                  <dd className="font-serif break-words">{line.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {log?.summary && (
          <div className="space-y-1 border-t pt-3">
            <p className="font-serif text-[15px] leading-6">{log.summary}</p>
          </div>
        )}

        {(lines.length > 0 || log?.summary) && (
          <p className="text-xs leading-4 text-muted-foreground">Placed through Case Desk, not yet in Clio.</p>
        )}
      </div>

      {(waiting || live || phase.step === "ending" || phase.step === "ended") && (
        <footer className="flex gap-2 border-t px-4 py-2.5">
          {phase.step === "connected" && (
            <Button size="sm" variant="outline" aria-pressed={muted} onClick={onMute}>
              {muted ? "Unmute" : "Mute"}
            </Button>
          )}
          {live && (
            <Button size="sm" onClick={onHangUp}>
              Hang up
            </Button>
          )}
          {waiting && (
            <Button size="sm" variant="outline" onClick={onClose}>
              Cancel the call
            </Button>
          )}
          {(phase.step === "ending" || phase.step === "ended") && (
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          )}
        </footer>
      )}
    </section>,
    document.body,
  );
}
