import twilio from "twilio";

// The only file that reads the TWILIO_ variables. Calls are placed from the browser through a TwiML
// App whose Voice Request URL is /api/calls/voice on the deployed site; Twilio then reports each
// call's progress, and its real length, to /api/calls/status.

const REQUIRED = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_TWIML_APP_SID",
  "TWILIO_CALLER_ID",
] as const;

const env = (name: (typeof REQUIRED)[number]) => process.env[name]?.trim() ?? "";

/** Whether everything needed to place a call is set. */
export function configured(): boolean {
  return REQUIRED.every((name) => env(name) !== "");
}

/** Whether both sides' words are written down as the call runs. Off unless TWILIO_TRANSCRIBE=1. */
export function transcribes(): boolean {
  return process.env.TWILIO_TRANSCRIBE?.trim() === "1";
}

/**
 * A phone number as E.164, or null when it cannot be one. Punctuation and spaces are dropped; ten
 * digits are taken as a US number; anything else must start with + and have 8 to 15 digits.
 */
export function normaliseNumber(input: string): string | null {
  const text = input.trim();
  if (!/^\+?[\d\s().-]+$/.test(text)) return null;
  const digits = text.replace(/\D/g, "");
  if (text.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  return digits.length === 10 ? `+1${digits}` : null;
}

/** The only numbers this line may ring, or null when it may ring any. */
export function allowedNumbers(): string[] | null {
  const raw = process.env.TWILIO_ALLOWED_NUMBERS?.trim();
  if (!raw) return null;
  // A list that is set but has nothing readable in it allows nothing, rather than everything.
  return raw
    .split(",")
    .map((item) => normaliseNumber(item))
    .filter((item): item is string => item !== null);
}

/** Whether a number (E.164) may be rung. */
export function mayRing(number: string): boolean {
  const allowed = allowedNumbers();
  return allowed === null || allowed.includes(number);
}

/** The number a demonstration rings when a contact's own number is not allowed, or null. */
export function demonstrationNumber(): string | null {
  return allowedNumbers()?.[0] ?? null;
}

/** A short-lived pass that lets one browser place calls through the TwiML App, and take none. */
export function accessToken(identity: string): string {
  const token = new twilio.jwt.AccessToken(env("TWILIO_ACCOUNT_SID"), env("TWILIO_API_KEY_SID"), env("TWILIO_API_KEY_SECRET"), {
    identity,
    ttl: 600,
  });
  token.addGrant(new twilio.jwt.AccessToken.VoiceGrant({ outgoingApplicationSid: env("TWILIO_TWIML_APP_SID"), incomingAllow: false }));
  return token.toJwt();
}

/** The public address Twilio called: behind Vercel the request's own URL is not the one it signed. */
export function publicUrl(request: Request): URL {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? url.protocol.replace(":", "");
  return new URL(`${proto}://${host}${url.pathname}${url.search}`);
}

/** Whether a request really came from Twilio: its signature covers the full URL and every form field. */
export function validSignature(request: Request, params: Record<string, string>): boolean {
  const signature = request.headers.get("x-twilio-signature");
  const authToken = env("TWILIO_AUTH_TOKEN");
  if (!signature || !authToken) return false;
  return twilio.validateRequest(authToken, signature, publicUrl(request).toString(), params);
}

/** The form fields of a request from Twilio. */
export async function formParams(request: Request): Promise<Record<string, string>> {
  const form = await request.formData().catch(() => null);
  const params: Record<string, string> = {};
  form?.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });
  return params;
}

/**
 * Instructions to ring `to` and join it to the browser. `statusUrl` hears how the call goes and how
 * long it lasted; `transcriptUrl`, when given, hears what each side says.
 */
export function dialTwiml({ to, statusUrl, transcriptUrl }: { to: string; statusUrl: string; transcriptUrl: string | null }): string {
  const response = new twilio.twiml.VoiceResponse();
  if (transcriptUrl) response.start().transcription({ statusCallbackUrl: transcriptUrl, statusCallbackMethod: "POST", track: "both_tracks" });
  const dial = response.dial({ callerId: env("TWILIO_CALLER_ID"), answerOnBridge: true, action: statusUrl, method: "POST" });
  dial.number(
    { statusCallback: statusUrl, statusCallbackMethod: "POST", statusCallbackEvent: ["initiated", "ringing", "answered", "completed"] },
    to,
  );
  return response.toString();
}

/** Instructions that say a call cannot be placed, and hang up. */
export function refusalTwiml(): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say("This call cannot be placed.");
  response.hangup();
  return response.toString();
}

/** Nothing further to do: the answer to a report from Twilio. */
export function emptyTwiml(): string {
  return new twilio.twiml.VoiceResponse().toString();
}
