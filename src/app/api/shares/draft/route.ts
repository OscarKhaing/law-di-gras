import { draftUpdate, shareErrorResponse } from "@/features/shares/server";
import { DraftBody } from "@/features/shares/schema";
import { errorResponse, parseJson } from "@/server/http";

export const maxDuration = 300;

// Stop the model call before Vercel stops the function, so the caller gets our error, not a bare 504.
const MODEL_DEADLINE_MS = 270_000;

// Draft the lines of an update for one provider, for the attorney to check. Nothing is saved.
export async function POST(request: Request) {
  const body = await parseJson(request, DraftBody);
  if ("response" in body) return body.response;
  try {
    const { matterId, contactRef } = body.data;
    return Response.json({ lines: await draftUpdate(matterId, contactRef, AbortSignal.timeout(MODEL_DEADLINE_MS)) });
  } catch (err) {
    return shareErrorResponse(err) ?? errorResponse(err);
  }
}
