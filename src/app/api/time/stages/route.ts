import { z } from "zod";
import { MatterKey } from "@/features/cases/schema";
import { stageDates } from "@/features/time/server";
import { errorResponse, parseJson } from "@/server/http";

export const maxDuration = 300;

// Stop the model call before Vercel stops the function, so the caller gets our error, not a bare 504.
const MODEL_DEADLINE_MS = 270_000;

// `kept: true` asks only for an answer worked out earlier, so opening the part never calls a model.
const Body = z.object({ matterId: MatterKey, kept: z.boolean().optional() });

// When each stage of a case began, for the time on desk to be divided by phase. Nothing is sent to Clio.
export async function POST(request: Request) {
  const body = await parseJson(request, Body);
  if ("response" in body) return body.response;
  try {
    return Response.json({ stages: await stageDates(body.data.matterId, AbortSignal.timeout(MODEL_DEADLINE_MS), body.data.kept === true) });
  } catch (err) {
    return errorResponse(err);
  }
}
