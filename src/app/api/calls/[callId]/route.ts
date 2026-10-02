import { z } from "zod";
import { callErrorResponse, getCall } from "@/features/calls/server";

// One call as it stands, for the screen to watch after hanging up.
export async function GET(_request: Request, { params }: { params: Promise<{ callId: string }> }) {
  const callId = z.uuid().safeParse((await params).callId);
  if (!callId.success) return Response.json({ error: { type: "invalid_request", message: "Not a call." } }, { status: 400 });
  try {
    return Response.json(await getCall(callId.data));
  } catch (err) {
    return callErrorResponse(err);
  }
}
