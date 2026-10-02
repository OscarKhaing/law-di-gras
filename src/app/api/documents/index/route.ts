import { z } from "zod";
import { indexDocument } from "@/features/documents/server";
import { errorResponse, parseJson } from "@/server/http";
import { MatterKey } from "@/features/cases/schema";

export const maxDuration = 300;

const Body = z.object({ matterId: MatterKey, ref: z.string().regex(/^D\d+$/) });

// Index the pages of one document of a case. Parts already indexed are skipped, so a long scan
// that ran past the time limit is finished by asking again.
export async function POST(request: Request) {
  const body = await parseJson(request, Body);
  if ("response" in body) return body.response;
  try {
    return Response.json(await indexDocument(body.data.matterId, body.data.ref));
  } catch (err) {
    return errorResponse(err);
  }
}
