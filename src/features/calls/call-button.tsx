"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Call, Device } from "@twilio/voice-sdk";
import { CallPanel, type Phase } from "./call-panel";
import type { CallLog } from "./schema";

// What /api/calls/token answers: the call's id, a pass to place it, and the number that will ring.
type Started = { callId: string; token: string; to: string; transcribed: boolean };

/** An answer from our own routes that was a refusal, with its kind so the screen can offer the right way out. */
class Refusal extends Error {
  constructor(
    readonly type: string,
    message: string,
  ) {
    super(message);
  }
}

async function ask<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(
    url,
    body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Refusal(data?.error?.type ?? "error", data?.error?.message ?? `Request failed (${res.status})`);
  return data as T;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

// One call at a time: every Call control on the page knows which of them, if any, has a call open.
let holder: string | null = null;
const watchers = new Set<() => void>();
function hold(id: string | null) {
  holder = id;
  watchers.forEach((notify) => notify());
}
const watch = (notify: () => void) => {
  watchers.add(notify);
  return () => void watchers.delete(notify);
};

// What the row says while its call is open below.
const ROW_WORDS: Record<Phase["step"], string> = {
  number: "Call another number",
  preparing: "Calling",
  microphone: "Calling",
  dialling: "Calling",
  ringing: "Ringing",
  connected: "On a call",
  ending: "Call ended",
  ended: "Call ended",
  "not-allowed": "Not rung",
  failed: "Call stopped",
};

const controlClass =
  "cursor-pointer rounded-sm text-left text-sm font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:text-muted-foreground disabled:no-underline";

/**
 * "Call" beside a contact: places a call through Case Desk and shows it while it runs.
 * `phone` is the number Clio holds for the contact, or "" when it holds none. The number rung is
 * decided by the server from Clio; what is sent from here is only which contact to ring.
 */
export function CallButton({
  matterId,
  contactRef,
  contactName,
  phone,
}: {
  matterId: number;
  contactRef: string | null;
  contactName: string;
  phone: string;
}) {
  const router = useRouter();
  const id = useId();
  const holding = useSyncExternalStore(watch, () => holder, () => null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [ringing, setRinging] = useState("");
  const [demonstration, setDemonstration] = useState(false);
  const [transcribed, setTranscribed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [log, setLog] = useState<CallLog | null>(null);

  // The line itself, and a count that goes up whenever a call is abandoned so its late answers are dropped.
  const line = useRef<{ device: Device | null; call: Call | null; attempt: number; talking: boolean; over: (() => void) | null }>({
    device: null,
    call: null,
    attempt: 0,
    talking: false,
    over: null,
  });

  function release() {
    const current = line.current;
    current.talking = false;
    current.call = null;
    current.over = null;
    current.device?.destroy();
    current.device = null;
  }

  // Leaving the page mid-call hangs up: the line cannot outlive the control that holds it.
  useEffect(() => {
    const current = line.current;
    return () => {
      current.attempt += 1;
      current.talking = false;
      current.device?.destroy();
      current.device = null;
      if (holder === id) hold(null);
    };
  }, [id]);

  function open() {
    if (holder !== null) return;
    hold(id);
    setLog(null);
    setMuted(false);
    setDemonstration(false);
    setTranscribed(false);
    setRinging("");
    if (phone.trim()) void place({});
    else setPhase({ step: "number" });
  }

  function close() {
    line.current.attempt += 1;
    release();
    setPhase(null);
    hold(null);
  }

  function fail(err: unknown) {
    release();
    const code = typeof err === "object" && err !== null && "code" in err ? Number((err as { code: unknown }).code) : 0;
    const name = err instanceof Error ? err.name : "";
    const said = err instanceof Error ? err.message : String(err);
    if (name === "NotAllowedError" || name === "NotFoundError" || code === 31401 || code === 31402 || code === 31208) {
      setPhase({
        step: "failed",
        message: name === "NotFoundError" ? "No microphone was found." : "The microphone was refused, so the call was not placed.",
        advice: "Allow the microphone for this site in the browser's address bar, then press Call again.",
      });
    } else if (err instanceof Refusal && err.type === "calls_not_set_up") {
      setPhase({ step: "failed", message: "Calls are not set up on this site yet.", advice: "Ask whoever runs Case Desk to connect the phone line. Nobody was rung." });
    } else if (err instanceof Refusal) {
      setPhase({ step: "failed", message: err.message, advice: "Nobody was rung. Close this and try again." });
    } else {
      setPhase({
        step: "failed",
        message: `The phone carrier reported: ${said}${code && !said.includes(String(code)) ? ` (${code})` : ""}`,
        advice: "The call is over. Close this and press Call to try again.",
      });
    }
  }

  /** After hanging up: wait for the carrier's word on how long the call was, then for the summary if there is one. */
  async function settle(callId: string, attempt: number, withWords: boolean) {
    let counted = false;
    for (let tries = 0; tries < 15; tries++) {
      await sleep(2000);
      if (line.current.attempt !== attempt) return;
      const latest = await ask<CallLog>(`/api/calls/${callId}`).catch(() => null);
      if (line.current.attempt !== attempt) return;
      if (!latest) continue;
      setLog(latest);
      if (latest.seconds !== null && !counted) {
        counted = true;
        setPhase({ step: "ended" });
        router.refresh();
      }
      if (counted && (!withWords || latest.transcript.length === 0 || latest.summary)) {
        if (latest.summary) router.refresh();
        return;
      }
    }
    setPhase({ step: "ended" });
  }

  /** While the call runs: show what is said as it is written down. */
  async function listen(callId: string, attempt: number) {
    while (line.current.attempt === attempt && line.current.talking) {
      await sleep(2000);
      if (line.current.attempt !== attempt || !line.current.talking) return;
      const latest = await ask<CallLog>(`/api/calls/${callId}`).catch(() => null);
      if (latest && line.current.attempt === attempt && line.current.talking) setLog(latest);
    }
  }

  async function place(how: { number?: string; demonstration?: boolean }) {
    const attempt = ++line.current.attempt;
    const current = () => line.current.attempt === attempt;
    setDemonstration(how.demonstration === true);
    setPhase({ step: "preparing" });

    let started: Started;
    try {
      started = await ask<Started>("/api/calls/token", {
        matterId,
        contactRef,
        number: how.number ?? null,
        demonstration: how.demonstration === true,
      });
    } catch (err) {
      if (!current()) return;
      if (err instanceof Refusal && err.type === "number_not_allowed") setPhase({ step: "not-allowed", message: err.message });
      // A typed number that cannot be read goes back to the box it was typed in.
      else if (err instanceof Refusal && (err.type === "bad_number" || err.type === "no_number") && !phone.trim()) {
        setPhase({ step: "number", problem: err.message });
      } else fail(err);
      return;
    }
    if (!current()) return;
    setRinging(started.to);
    setTranscribed(started.transcribed);

    // Ask for the microphone ourselves first, so a refusal is told apart from a call that failed.
    setPhase({ step: "microphone" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (err) {
      if (current()) fail(err);
      return;
    }
    if (!current()) return;

    setPhase({ step: "dialling" });
    const over = () => {
      if (!current() || !line.current.device) return;
      release();
      setPhase({ step: "ending" });
      void settle(started.callId, attempt, started.transcribed);
    };
    line.current.over = over;
    try {
      // Loaded only now: the phone library needs a browser and must not run on the server.
      const { Device } = await import("@twilio/voice-sdk");
      if (!current()) return;
      const device = new Device(started.token, { logLevel: "silent" });
      line.current.device = device;
      device.on("error", (error: unknown) => current() && fail(error));
      const call = await device.connect({ params: { callId: started.callId } });
      if (!current()) {
        call.disconnect();
        return;
      }
      line.current.call = call;
      call.on("ringing", () => current() && setPhase({ step: "ringing" }));
      call.on("accept", () => {
        if (!current()) return;
        setPhase({ step: "connected", since: Date.now() });
        if (started.transcribed) {
          line.current.talking = true;
          void listen(started.callId, attempt);
        }
      });
      call.on("disconnect", over);
      call.on("cancel", over);
      call.on("error", (error: unknown) => current() && fail(error));
    } catch (err) {
      if (current()) fail(err);
    }
  }

  function hangUp() {
    const { call, over } = line.current;
    // Hanging up a call in progress ends it at the carrier, and the panel moves on at once rather
    // than waiting to be told; one not yet placed is just dropped.
    if (!call) return close();
    call.disconnect();
    over?.();
  }

  function mute() {
    const { call } = line.current;
    if (!call) return;
    call.mute(!muted);
    setMuted(!muted);
  }

  const mine = holding === id;
  const busyElsewhere = holding !== null && !mine;
  const held = phone.trim();

  return (
    <div className="flex flex-col items-[inherit] gap-0.5">
      {mine && phase ? (
        <p className="text-sm font-medium">{ROW_WORDS[phase.step]}</p>
      ) : (
        <button
          type="button"
          className={controlClass}
          disabled={busyElsewhere}
          title={busyElsewhere ? "Hang up and close the other call first." : undefined}
          aria-label={held ? `Call ${contactName} on ${held}` : `Call ${contactName} on another number`}
          onClick={open}
        >
          {held ? "Call" : "Call another number"}
        </button>
      )}
      <p className="text-xs leading-4 text-muted-foreground">
        {held ? <span className="font-serif tabular-nums">{held}</span> : "No number in Clio"}
      </p>

      {mine && phase && (
        <CallPanel
          phase={phase}
          contactName={contactName}
          ringing={ringing}
          demonstration={demonstration}
          transcribed={transcribed}
          muted={muted}
          log={log}
          onPlace={(number) => void place({ number })}
          onDemonstration={() => void place({ demonstration: true })}
          onMute={mute}
          onHangUp={hangUp}
          onClose={close}
        />
      )}
    </div>
  );
}
