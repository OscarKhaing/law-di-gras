import { voiceTwiml } from "@/features/calls/server";
import { errorResponse } from "@/server/http";
import { formParams, publicUrl, validSignature } from "@/server/twilio";

// Twilio asks this, when the browser connects, what to do with the call.
export async function POST(request: Request) {
  const params = await formParams(request);
  if (!validSignature(request, params)) return new Response(null, { status: 403 });
  try {
    const twiml = await voiceTwiml(params.callId ?? "", publicUrl(request).origin);
    return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
  } catch (err) {
    return errorResponse(err);
  }
}
