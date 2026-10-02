import { recordTranscript } from "@/features/calls/server";
import { errorResponse } from "@/server/http";
import { formParams, publicUrl, validSignature } from "@/server/twilio";

export const maxDuration = 60;

// Twilio reports here what each side of a call said, a sentence at a time.
export async function POST(request: Request) {
  const params = await formParams(request);
  if (!validSignature(request, params)) return new Response(null, { status: 403 });
  try {
    await recordTranscript(publicUrl(request).searchParams.get("callId") ?? "", params);
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
