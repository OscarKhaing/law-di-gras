import { recordStatus } from "@/features/calls/server";
import { errorResponse } from "@/server/http";
import { emptyTwiml, formParams, publicUrl, validSignature } from "@/server/twilio";

export const maxDuration = 60;

// Twilio reports here how a call is going and, when it ends, how long it lasted.
export async function POST(request: Request) {
  const params = await formParams(request);
  if (!validSignature(request, params)) return new Response(null, { status: 403 });
  try {
    await recordStatus(publicUrl(request).searchParams.get("callId") ?? "", params);
    return new Response(emptyTwiml(), { headers: { "Content-Type": "text/xml" } });
  } catch (err) {
    return errorResponse(err);
  }
}
