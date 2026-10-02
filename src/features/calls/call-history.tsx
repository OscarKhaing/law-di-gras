"use client";

import { useState } from "react";
import { StatusPill } from "@/components/status";
import { useFold } from "@/features/brief/fold";
import { LocalTime } from "@/features/cases/local-time";
import type { CallLog } from "./schema";

/** A call's length in words: "7 s", "3 min 20 s". */
function length(seconds: number) {
  if (seconds < 60) return `${seconds} s`;
  const rest = seconds % 60;
  return rest === 0 ? `${Math.floor(seconds / 60)} min` : `${Math.floor(seconds / 60)} min ${rest} s`;
}

/** How a call ended, in the firm's words. */
function outcome(call: CallLog): { tone: "done" | "mild" | "neutral"; words: string } {
  if (call.seconds && call.seconds > 0) return { tone: "done", words: `Spoke for ${length(call.seconds)}` };
  if (call.status === "busy") return { tone: "mild", words: "Line busy" };
  if (call.status === "no-answer") return { tone: "mild", words: "No answer" };
  if (call.status === "failed" || call.status === "canceled") return { tone: "neutral", words: "Not connected" };
  return { tone: "neutral", words: "In progress" };
}

/**
 * The calls placed through Case Desk on this case, newest first: who was rung, when, and how long
 * they spoke, with what was said when the call was transcribed. These live in Case Desk, not in
 * Clio; a call that was answered counts in time on desk at its real length.
 */
export function CallHistory({ calls }: { calls: CallLog[] }) {
  const { shown, control } = useFold(calls);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section aria-labelledby="call-history" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="call-history" className="font-heading text-xl font-semibold tracking-tight">
          Calls placed through Case Desk
        </h2>
        <p className="text-sm text-muted-foreground">
          Timed by the phone carrier and kept here, not yet in Clio. An answered call counts in time on desk.
        </p>
      </div>

      {calls.length === 0 ? (
        <p className="border-y py-3 text-sm text-muted-foreground">
          No call has been placed from this case yet. Press Call beside anyone the firm is waiting on.
        </p>
      ) : (
        <ul className="divide-y border-y">
          {shown.map((call) => {
            const result = outcome(call);
            const said = call.transcript.length > 0 || Boolean(call.summary);
            const isOpen = open === call.id;
            return (
              <li key={call.id} className="grid gap-x-6 gap-y-1 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
                <p className="text-sm text-muted-foreground">
                  <LocalTime iso={call.startedAt} />
                </p>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm">
                    <span className="font-serif text-[15px]">{call.contactName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      rung by {call.placedBy} at a number ending {call.toNumber.slice(-4)}
                    </span>
                  </p>
                  {call.summary && <p className="max-w-prose font-serif text-[15px] leading-snug">{call.summary}</p>}
                  {said && call.transcript.length > 0 && (
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : call.id)}
                      className="cursor-pointer rounded-sm text-xs font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      {isOpen ? "Hide what was said" : "Read what was said"}
                    </button>
                  )}
                  {isOpen && (
                    <dl className="space-y-1.5 border-l-2 pl-3">
                      {call.transcript.map((line, index) => (
                        <div key={index} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 text-sm">
                          <dt className="text-xs text-muted-foreground">{line.speaker === "firm" ? "The firm" : "Them"}</dt>
                          <dd className="font-serif text-[15px] leading-snug">{line.text}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
                <p className="sm:text-right">
                  <StatusPill tone={result.tone}>{result.words}</StatusPill>
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {control}
    </section>
  );
}
