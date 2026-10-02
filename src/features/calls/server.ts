import { z } from "zod";
import { getCaseFile } from "@/features/cases/server";
import { errorResponse } from "@/server/http";
import { complete } from "@/server/llm";
import { supabase } from "@/server/supabase";
import {
  accessToken,
  configured,
  demonstrationNumber,
  dialTwiml,
  mayRing,
  normaliseNumber,
  refusalTwiml,
  transcribes,
} from "@/server/twilio";
import { SUMMARY_SYSTEM, summaryPrompt } from "./prompt";
import type { CallLine, CallLog } from "./schema";

// Calls placed through Case Desk. The browser asks to ring a contact; the number rung is always
// the one on the call's own row, written here from Clio, and never one a request carries later.

/** A call that was refused, with words for the person who pressed Call. */
export class CallError extends Error {
  constructor(
    readonly status: number,
    readonly type: string,
    message: string,
  ) {
    super(message);
    this.name = "CallError";
  }
}

/** The response for anything a calls route caught. */
export function callErrorResponse(err: unknown): Response {
  if (err instanceof CallError) {
    return Response.json({ error: { type: err.type, message: err.message } }, { status: err.status });
  }
  return errorResponse(err);
}

/** What the browser sends to get a call ready. */
export const StartBody = z.object({
  matterId: z.number().int().positive(),
  contactRef: z.string().regex(/^P\d+$/).nullish(),
  number: z.string().max(40).nullish(),
  demonstration: z.boolean().optional(),
});

type Row = {
  id: string;
  matter_id: number;
  contact_ref: string | null;
  contact_name: string;
  to_number: string;
  placed_by: string;
  call_sid: string | null;
  status: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  seconds: number | null;
  transcript: CallLine[] | null;
  summary: string | null;
};

const toLog = (row: Row): CallLog => ({
  id: row.id,
  matterId: Number(row.matter_id),
  contactRef: row.contact_ref,
  contactName: row.contact_name,
  toNumber: row.to_number,
  placedBy: row.placed_by,
  status: row.status,
  startedAt: row.started_at,
  answeredAt: row.answered_at,
  endedAt: row.ended_at,
  seconds: row.seconds,
  transcript: Array.isArray(row.transcript) ? row.transcript : [],
  summary: row.summary,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function rowOf(callId: string): Promise<Row | null> {
  if (!UUID.test(callId)) return null;
  const { data, error } = await supabase().from("calls").select("*").eq("id", callId).maybeSingle();
  if (error) throw error;
  return (data as Row | null) ?? null;
}

export type StartedCall = {
  callId: string;
  /** Lets this browser place the call; good for ten minutes. */
  token: string;
  /** The number that will ring, for display only. */
  to: string;
  /** Whether what is said will be written down. */
  transcribed: boolean;
};

/**
 * Get a call ready: decide the number, check it may be rung, and put the call on the case.
 * For a contact the number is the one Clio holds; `otherNumber` is one the user typed, used when
 * there is no contact or Clio holds no number for it. `demonstration` rings the demonstration
 * number in the contact's place, for a sample matter whose numbers are made up.
 */
export async function startCall(
  matterId: number,
  contactRef: string | null,
  otherNumber: string | null,
  demonstration = false,
): Promise<StartedCall> {
  if (!configured()) {
    throw new CallError(503, "calls_not_set_up", "Calls are not set up on this site yet. Ask whoever runs Case Desk to connect the phone line.");
  }
  const file = await getCaseFile(matterId);
  if (!file) throw new CallError(404, "not_found", "This case has not been read from Clio yet.");

  let name = "Another number";
  let held = "";
  if (contactRef !== null) {
    const contact = file.entries.find((entry) => entry.kind === "contact" && entry.ref === contactRef);
    if (!contact) throw new CallError(404, "not_found", "That contact is not in this case.");
    name = contact.title;
    held = String(contact.facts.phone ?? "").trim();
  }

  let number: string | null;
  if (demonstration) {
    number = demonstrationNumber();
    if (!number) throw new CallError(422, "no_demonstration_number", "No demonstration number is set for this line.");
  } else {
    // What Clio holds always wins; a typed number is only used when Clio holds none.
    const wanted = held || otherNumber?.trim() || "";
    if (!wanted) throw new CallError(422, "no_number", `Clio holds no number for ${name}. Type the number to ring.`);
    number = normaliseNumber(wanted);
    if (!number) {
      throw new CallError(
        422,
        "bad_number",
        `"${wanted}" is not a number this line can ring. Use ten digits for a US number, or start with + and the country code.`,
      );
    }
    if (!mayRing(number)) {
      throw new CallError(
        403,
        "number_not_allowed",
        "This line is set to ring only the demonstration number, so this number was not rung.",
      );
    }
  }

  const { data, error } = await supabase()
    .from("calls")
    .insert({
      matter_id: matterId,
      contact_ref: contactRef,
      contact_name: name,
      to_number: number,
      placed_by: file.firm.user,
      status: "started",
    })
    .select("id")
    .single();
  if (error) throw error;

  const identity = `desk_${file.firm.user.replace(/[^A-Za-z0-9]+/g, "_")}`.slice(0, 100);
  return { callId: data.id as string, token: accessToken(identity), to: number, transcribed: transcribes() };
}

/**
 * What Twilio is told to do when the browser connects: ring the number on the call's row.
 * `origin` is the public origin Twilio called, so its reports come back to the same site.
 */
export async function voiceTwiml(callId: string, origin: string): Promise<string> {
  const row = await rowOf(callId);
  // A call that is unknown, already over, or to a number no longer allowed is not placed.
  if (!row || row.ended_at !== null || !mayRing(row.to_number)) return refusalTwiml();
  const query = `?callId=${row.id}`;
  return dialTwiml({
    to: row.to_number,
    statusUrl: `${origin}/api/calls/status${query}`,
    transcriptUrl: transcribes() ? `${origin}/api/calls/transcript${query}` : null,
  });
}

const ENDED = new Set(["completed", "busy", "no-answer", "failed", "canceled"]);
// How far along a call is; a report never moves it backwards.
const rank = (status: string) => (ENDED.has(status) ? 3 : status === "in-progress" ? 2 : status === "ringing" ? 1 : 0);

const wholeSeconds = (value: string | undefined) => {
  const seconds = Number.parseInt(value ?? "", 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
};

/**
 * Take one report from Twilio about a call. Reports repeat and arrive out of order, so each one only
 * ever fills a blank, moves the call forward or raises its length.
 */
export async function recordStatus(callId: string, params: Record<string, string>): Promise<void> {
  const row = await rowOf(callId);
  if (!row) return;

  // The report at the end of the dial names the rung leg as DialCall...; the reports along the way are the rung leg's own.
  const atEndOfDial = params.DialCallStatus !== undefined;
  const reported = (atEndOfDial ? params.DialCallStatus : params.CallStatus) ?? "";
  const status = reported === "answered" ? "in-progress" : reported === "initiated" || reported === "queued" ? "started" : reported;
  const sid = atEndOfDial ? params.DialCallSid : params.CallSid;
  const length = wholeSeconds(params.DialCallDuration) ?? (atEndOfDial ? null : wholeSeconds(params.CallDuration));
  const now = new Date().toISOString();

  const patch: Partial<Row> = {};
  if (!row.call_sid && sid) patch.call_sid = sid;
  if (status && rank(status) > rank(row.status)) patch.status = status;
  if (!row.answered_at && status === "in-progress") patch.answered_at = now;
  if (ENDED.has(status)) {
    const endedAt = row.ended_at ?? now;
    if (!row.ended_at) patch.ended_at = endedAt;
    if (!row.answered_at && !patch.answered_at && length) {
      patch.answered_at = new Date(Date.parse(endedAt) - length * 1000).toISOString();
    }
  }
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase().from("calls").update(patch).eq("id", row.id);
    if (error) throw error;
  }

  // The length: a call that ended without being answered lasted no time. Raised, never lowered, and
  // the comparison is made by the database so two reports at once cannot undo each other.
  const seconds = length ?? (ENDED.has(status) && status !== "completed" ? 0 : null);
  if (seconds !== null) {
    const { error } = await supabase()
      .from("calls")
      .update({ seconds })
      .eq("id", row.id)
      .or(`seconds.is.null,seconds.lt.${seconds}`);
    if (error) throw error;
  }

  if (ENDED.has(status)) await summarise(row.id);
}

// One call's lines are added one at a time within this server, so two arriving together both land.
const queues = new Map<string, Promise<void>>();

/** Take one report from Twilio about what was said. Only finished sentences are kept. */
export async function recordTranscript(callId: string, params: Record<string, string>): Promise<void> {
  if (params.TranscriptionEvent === "transcription-stopped") return summarise(callId);
  if (params.TranscriptionEvent !== "transcription-content" || params.Final !== "true") return;

  let text = "";
  try {
    text = String((JSON.parse(params.TranscriptionData ?? "{}") as { transcript?: unknown }).transcript ?? "").trim();
  } catch {
    return;
  }
  if (!text) return;
  // The browser's side of the call is the audio Twilio receives; the person rung is what it sends back.
  const speaker: CallLine["speaker"] = params.Track === "inbound_track" ? "firm" : "them";
  const said = Date.parse(params.Timestamp ?? "");
  const line: CallLine = { speaker, text, at: new Date(Number.isNaN(said) ? Date.now() : said).toISOString() };

  const append = async () => {
    const row = await rowOf(callId);
    if (!row) return;
    const transcript = [...(Array.isArray(row.transcript) ? row.transcript : []), line].sort((a, b) => a.at.localeCompare(b.at));
    const { error } = await supabase().from("calls").update({ transcript }).eq("id", row.id);
    if (error) throw error;
  };
  const next = (queues.get(callId) ?? Promise.resolve()).then(append);
  queues.set(callId, next.catch(() => undefined));
  await next;
}

/** Once a call with a transcript is over, write two sentences on what was said and agreed. Written once. */
async function summarise(callId: string): Promise<void> {
  const row = await rowOf(callId);
  if (!row || row.summary || !row.ended_at || !Array.isArray(row.transcript) || row.transcript.length === 0) return;
  try {
    const { text } = await complete({
      model: "claude-haiku-4-5",
      system: SUMMARY_SYSTEM,
      prompt: summaryPrompt(toLog(row)),
      maxTokens: 400,
    });
    const summary = text.trim();
    if (!summary) return;
    const { error } = await supabase().from("calls").update({ summary }).eq("id", row.id).is("summary", null);
    if (error) throw error;
  } catch (err) {
    // The call and its length are already kept; a summary that could not be written is not worth failing the report for.
    console.error(`[calls] summary not written: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** One call, for the screen to watch after hanging up. */
export async function getCall(callId: string): Promise<CallLog> {
  const row = await rowOf(callId);
  if (!row) throw new CallError(404, "not_found", "That call is not on record.");
  return toLog(row);
}

// A pass to place a call lasts ten minutes. A row older than that which the carrier never heard of
// was got ready and then given up (the microphone was refused, the panel was closed): not a call.
const neverPlaced = (row: Row) =>
  row.status === "started" && row.call_sid === null && Date.now() - Date.parse(row.started_at) > 10 * 60 * 1000;

/** Every call placed through Case Desk on a case, newest first. */
export async function callsFor(matterId: number): Promise<CallLog[]> {
  const { data, error } = await supabase()
    .from("calls")
    .select("*")
    .eq("matter_id", matterId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).filter((row) => !neverPlaced(row)).map(toLog);
}
