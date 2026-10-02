import { AskRequest } from "@/features/ask/schema";
import { askCase } from "@/features/ask/server";
import { MatterKey } from "@/features/cases/schema";
import { errorResponse, parseJson } from "@/server/http";

export const maxDuration = 60;

// Stop the model call before the function is stopped, so the caller gets our message, not a bare 504.
const MODEL_DEADLINE_MS = 50_000;

const Body = AskRequest.extend({ matterId: MatterKey });

// Answer a question about a case from its file, with the sources the answer rests on. Nothing is saved.
export async function POST(request: Request) {
  const body = await parseJson(request, Body);
  if ("response" in body) return body.response;
  try {
    const { matterId, question, ...options } = body.data;
    return Response.json(await askCase(matterId, question, { ...options, signal: AbortSignal.timeout(MODEL_DEADLINE_MS) }));
  } catch (err) {
    return errorResponse(err);
  }
}
