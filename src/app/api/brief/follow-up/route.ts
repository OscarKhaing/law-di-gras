import { z } from "zod";
import { draftFollowUp } from "@/features/brief/server";
import { MatterKey } from "@/features/cases/schema";
import { errorResponse, parseJson } from "@/server/http";

export const maxDuration = 300;

// Stop the model call before Vercel stops the function, so the caller gets our error, not a bare 504.
const MODEL_DEADLINE_MS = 270_000;

const Body = z.object({ matterId: MatterKey, index: z.number().int().nonnegative() });

// Draft a follow-up for one request the firm is waiting on, for a person to edit. Nothing is saved or sent.
export async function POST(request: Request) {
  const body = await parseJson(request, Body);
  if ("response" in body) return body.response;
  try {
    const { matterId, index } = body.data;
    return Response.json(await draftFollowUp(matterId, index, AbortSignal.timeout(MODEL_DEADLINE_MS)));
  } catch (err) {
    return errorResponse(err);
  }
}
