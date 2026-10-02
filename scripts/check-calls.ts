// Check the calls feature without placing a call: `pnpm -s script scripts/check-calls.ts`.
// It never rings anyone and never prints a secret. Its test rows are kept under a matter id that is
// not a case, use the allowed number from the environment, and are deleted at the end.
// The numbers written out below are Twilio's own test numbers; they belong to nobody.
import twilio from "twilio";
import { POST as statusRoute } from "@/app/api/calls/status/route";
import { POST as voiceRoute } from "@/app/api/calls/voice/route";
import { listCases } from "@/features/cases/server";
import { CallError, callsFor, getCall, recordStatus, recordTranscript, startCall, voiceTwiml } from "@/features/calls/server";
import { supabase } from "@/server/supabase";
import {
  accessToken,
  allowedNumbers,
  configured,
  demonstrationNumber,
  mayRing,
  normaliseNumber,
  transcribes,
  validSignature,
} from "@/server/twilio";

const TEST_MATTER = 999000111;
const STRANGER = "+15005550006";
const ORIGIN = "https://case-desk.example";

let failures = 0;
function check(what: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok    " : "FAILED"}  ${what}${detail ? `  (${detail})` : ""}`);
}
const skip = (what: string, why: string) => console.log(`skip    ${what}  (${why})`);

const form = (params: Record<string, string>) => new URLSearchParams(params).toString();

/** A request as Twilio would send it: form-encoded, signed for the public URL. */
function fromTwilio(url: string, params: Record<string, string>, signature?: string, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(signature ? { "X-Twilio-Signature": signature } : {}),
      ...headers,
    },
    body: form(params),
  });
}

async function refusal(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "placed";
  } catch (err) {
    return err instanceof CallError ? err.type : `error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function main() {
  // ---- The number ----
  const good: [string, string][] = [
    ["(500) 555-0006", "+15005550006"],
    ["500.555.0006", "+15005550006"],
    ["+1 500 555 0006", "+15005550006"],
    ["+44 20 7946 0958", "+442079460958"],
  ];
  for (const [input, want] of good) check(`reads "${input}" as ${want}`, normaliseNumber(input) === want, String(normaliseNumber(input)));
  for (const bad of ["", "555-0006", "15005550006", "+1234567", "+1234567890123456", "500 555 0006 ext 4", "call me", "+1 (500) 555-0006; drop"]) {
    check(`refuses "${bad}"`, normaliseNumber(bad) === null, String(normaliseNumber(bad)));
  }

  // ---- The allow-list ----
  const allowed = allowedNumbers();
  const demo = demonstrationNumber();
  if (allowed === null) {
    skip("a number off the allow-list is refused", "TWILIO_ALLOWED_NUMBERS is not set: this line may ring any number");
  } else {
    check("the allow-list has a number to ring", demo !== null);
    check("a number off the allow-list may not be rung", !mayRing(STRANGER));
    check("the demonstration number may be rung", demo !== null && mayRing(demo));
  }

  if (!configured()) {
    skip("everything else", "the TWILIO_ variables are not all set");
    process.exit(failures ? 1 : 0);
  }
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const sign = (url: string, params: Record<string, string>) => twilio.getExpectedTwilioSignature(authToken, url, params);

  // ---- The pass the browser is given ----
  const jwt = accessToken("desk_check");
  const parts = jwt.split(".");
  check("the pass is a three-part token", parts.length === 3);
  const payload = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8")) as {
    exp?: number;
    iat?: number;
    grants?: { identity?: string; voice?: { incoming?: { allow?: boolean }; outgoing?: { application_sid?: string } } };
  };
  check("it names who is calling", payload.grants?.identity === "desk_check");
  check("it may place calls through the TwiML App", payload.grants?.voice?.outgoing?.application_sid === process.env.TWILIO_TWIML_APP_SID);
  check("it may not take calls", payload.grants?.voice?.incoming?.allow !== true);
  check("it lasts ten minutes", (payload.exp ?? 0) - (payload.iat ?? 0) === 600, `${(payload.exp ?? 0) - (payload.iat ?? 0)} s`);

  // ---- Telling Twilio from anyone else ----
  const url = `${ORIGIN}/api/calls/status?callId=00000000-0000-4000-8000-000000000000`;
  const params = { CallSid: "CAcheck", CallStatus: "ringing" };
  check("a request Twilio signed is accepted", validSignature(fromTwilio(url, params, sign(url, params)), params));
  check("a wrong signature is refused", !validSignature(fromTwilio(url, params, "bm90IGEgc2lnbmF0dXJl"), params));
  check("no signature is refused", !validSignature(fromTwilio(url, params), params));
  const changed = { ...params, CallStatus: "completed" };
  check("a changed parameter is refused", !validSignature(fromTwilio(url, changed, sign(url, params)), changed));
  const otherCall = url.replace("0000-4000", "0001-4000");
  check("a changed call id in the address is refused", !validSignature(fromTwilio(otherCall, params, sign(url, params)), params));
  const behindProxy = fromTwilio(url.replace(ORIGIN, "http://localhost:3000"), params, sign(url, params), {
    "x-forwarded-proto": "https",
    "x-forwarded-host": new URL(ORIGIN).host,
  });
  check("the public address is rebuilt behind a proxy", validSignature(behindProxy, params));

  // ---- Refusals that need no table ----
  const cases = await listCases();
  const matterId = Number(process.argv[2]) || cases[0]?.matterId;
  if (!matterId) {
    skip("refusing to ring a number off the allow-list", "no case has been read from Clio");
  } else if (allowed === null) {
    skip("refusing to ring a number off the allow-list", "TWILIO_ALLOWED_NUMBERS is not set");
  } else {
    check("ringing a stranger's number is refused", (await refusal(() => startCall(matterId, null, STRANGER))) === "number_not_allowed");
    check("a number that is not a number is refused", (await refusal(() => startCall(matterId, null, "call me"))) === "bad_number");
    check("no number at all is refused", (await refusal(() => startCall(matterId, null, null))) === "no_number");
    check("a contact that is not in the case is refused", (await refusal(() => startCall(matterId, "P999999", null))) === "not_found");
  }

  // ---- Everything that needs the table ----
  const table = await supabase().from("calls").select("id").limit(1);
  if (table.error) {
    for (const what of [
      "the voice instructions dial the row's number",
      "status reports are idempotent and keep the longest length",
      "callsFor returns the row",
      "the transcript and the summary",
    ]) {
      skip(what, "the calls table does not exist yet");
    }
    process.exit(failures ? 1 : 0);
  }
  if (!demo) {
    skip("the checks that need a row", "they use the allowed number, and TWILIO_ALLOWED_NUMBERS is not set");
    process.exit(failures ? 1 : 0);
  }

  const db = supabase();
  const row = async (extra: Record<string, unknown> = {}) => {
    const { data, error } = await db
      .from("calls")
      .insert({ matter_id: TEST_MATTER, contact_ref: null, contact_name: "Check call", to_number: demo, placed_by: "check-calls", ...extra })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  };

  try {
    // The voice instructions, through the route itself, with a "To" the caller made up.
    const callId = await row();
    const voiceUrl = `${ORIGIN}/api/calls/voice`;
    const asked = { callId, To: STRANGER, From: "client:desk_check", CallSid: "CAparent" };
    const unsigned = await voiceRoute(fromTwilio(voiceUrl, asked));
    check("the voice route refuses an unsigned request", unsigned.status === 403 && (await unsigned.text()) === "");
    const answered = await voiceRoute(fromTwilio(voiceUrl, asked, sign(voiceUrl, asked)));
    const twiml = await answered.text();
    check("the voice route answers a signed request with TwiML", answered.status === 200 && (answered.headers.get("content-type") ?? "").includes("text/xml"));
    check("it dials the row's number", twiml.includes(`>${demo}</Number>`));
    check("it ignores the number the caller sent", !twiml.includes(STRANGER));
    check("it uses the caller ID", twiml.includes(`callerId="${process.env.TWILIO_CALLER_ID?.trim()}"`));
    check("it waits for an answer before joining the call", twiml.includes('answerOnBridge="true"'));
    const back = `${ORIGIN}/api/calls/status?callId=${callId}`;
    check("the end of the dial reports to the same site", twiml.includes(`action="${back}"`));
    check("the rung leg reports to the same site", twiml.includes(`statusCallback="${back}"`) && twiml.includes('statusCallbackEvent="initiated ringing answered completed"'));
    check(
      transcribes() ? "it asks for both sides' words" : "it does not ask for a transcript (TWILIO_TRANSCRIBE is off)",
      twiml.includes("<Transcription") === transcribes(),
    );
    const unknown = await voiceTwiml("00000000-0000-4000-8000-000000000000", ORIGIN);
    check("an unknown call is told it cannot be placed", unknown.includes("<Say>") && unknown.includes("<Hangup") && !unknown.includes("<Dial"));
    check("a call id that is not an id is not placed", !(await voiceTwiml("' or 1=1", ORIGIN)).includes("<Dial"));

    // Status reports: repeated, out of order, and with a shorter length after a longer one.
    const sid = `CAcheck${Date.now()}`;
    await recordStatus(callId, { CallSid: sid, CallStatus: "ringing" });
    check("ringing is recorded", (await getCall(callId)).status === "ringing");
    await recordStatus(callId, { CallSid: sid, CallStatus: "in-progress" });
    const answeredAt = (await getCall(callId)).answeredAt;
    check("answering is recorded", answeredAt !== null && (await getCall(callId)).status === "in-progress");
    await recordStatus(callId, { CallSid: sid, CallStatus: "completed", CallDuration: "42" });
    const done = await getCall(callId);
    check("the end and the length are recorded", done.status === "completed" && done.seconds === 42 && done.endedAt !== null);
    await recordStatus(callId, { CallSid: sid, CallStatus: "ringing" });
    await recordStatus(callId, { CallSid: sid, CallStatus: "in-progress" });
    const late = await getCall(callId);
    check("a late report does not move the call backwards", late.status === "completed" && late.answeredAt === answeredAt && late.endedAt === done.endedAt);
    await recordStatus(callId, { CallSid: "CAparent", DialCallSid: sid, DialCallStatus: "completed", DialCallDuration: "40" });
    check("a shorter length does not lower it", (await getCall(callId)).seconds === 42);
    await recordStatus(callId, { CallSid: "CAparent", DialCallSid: sid, DialCallStatus: "completed", DialCallDuration: "45" });
    await recordStatus(callId, { CallSid: "CAparent", DialCallSid: sid, DialCallStatus: "completed", DialCallDuration: "45" });
    const final = await getCall(callId);
    check("the longest length is kept, and a repeat changes nothing", final.seconds === 45 && final.endedAt === done.endedAt);

    // The status route itself: signed, it records; unsigned, it does not.
    const second = await row();
    const secondUrl = `${ORIGIN}/api/calls/status?callId=${second}`;
    const ended = { CallSid: "CAparent2", DialCallSid: `${sid}b`, DialCallStatus: "no-answer" };
    check("the status route refuses an unsigned request", (await statusRoute(fromTwilio(secondUrl, ended))).status === 403);
    check("nothing was recorded from it", (await getCall(second)).status === "started");
    check("the status route takes a signed report", (await statusRoute(fromTwilio(secondUrl, ended, sign(secondUrl, ended)))).ok);
    const unansweredCall = await getCall(second);
    check("a call nobody answered lasted no time", unansweredCall.status === "no-answer" && unansweredCall.seconds === 0 && unansweredCall.answeredAt === null);
    check("a call that is over cannot be placed again", !(await voiceTwiml(second, ORIGIN)).includes("<Dial"));

    // Only the end of the dial, with nothing before it: the answer time is worked back from the length.
    const third = await row();
    await recordStatus(third, { CallSid: "CAparent3", DialCallSid: `${sid}c`, DialCallStatus: "completed", DialCallDuration: "30" });
    const onlyEnd = await getCall(third);
    check(
      "a call known only by its end has its answer time worked back",
      onlyEnd.seconds === 30 && onlyEnd.answeredAt !== null && onlyEnd.endedAt !== null && Date.parse(onlyEnd.endedAt) - Date.parse(onlyEnd.answeredAt) === 30000,
    );

    // callsFor: the rows, newest first.
    const listed = await callsFor(TEST_MATTER);
    check("callsFor returns the rows", [callId, second, third].every((id) => listed.some((call) => call.id === id)));
    check("newest first", listed.every((call, i) => i === 0 || listed[i - 1].startedAt >= call.startedAt));
    check("a row reads back as a CallLog", listed[0]?.matterId === TEST_MATTER && listed[0]?.toNumber === demo && Array.isArray(listed[0]?.transcript));

    const stale = await row({ started_at: new Date(Date.now() - 11 * 60 * 1000).toISOString() });
    const fresh = await row();
    const now = await callsFor(TEST_MATTER);
    check("a call got ready but never placed drops off the case after ten minutes", !now.some((call) => call.id === stale) && now.some((call) => call.id === fresh));

    // What was said: both sides, in order, only finished sentences; then two sentences on it.
    const fourth = await row();
    const said = (track: string, text: string, at: string, final = "true") =>
      recordTranscript(fourth, {
        TranscriptionEvent: "transcription-content",
        Track: track,
        Final: final,
        Timestamp: at,
        TranscriptionData: JSON.stringify({ transcript: text, confidence: 0.9 }),
      });
    await Promise.all([
      said("outbound_track", "Records desk, how can I help?", "2020-01-01T10:00:01Z"),
      said("inbound_track", "Hello, I am calling to check that this line works.", "2020-01-01T10:00:04Z"),
      said("outbound_track", "It works. I will send a test page by Friday.", "2020-01-01T10:00:09Z"),
      said("inbound_track", "Hello, I am", "2020-01-01T10:00:03Z", "false"),
    ]);
    const heard = (await getCall(fourth)).transcript;
    check("finished sentences from both sides are kept in order", heard.length === 3 && heard.map((line) => line.speaker).join() === "them,firm,them", `${heard.length} lines`);
    check("no summary while the call is running", (await getCall(fourth)).summary === null);
    await recordStatus(fourth, { CallSid: "CAparent4", DialCallSid: `${sid}d`, DialCallStatus: "completed", DialCallDuration: "12" });
    const summary = (await getCall(fourth)).summary;
    check("a summary is written when the call ends", typeof summary === "string" && summary.length > 20, summary ? `${summary.length} characters` : "none; see the line above");
  } finally {
    const { error } = await db.from("calls").delete().eq("matter_id", TEST_MATTER);
    check("the test rows are deleted", !error && (await callsFor(TEST_MATTER)).length === 0);
  }

  console.log(failures ? `\n${failures} FAILED` : "\nAll checks passed. No call was placed.");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(`FAILED  ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
