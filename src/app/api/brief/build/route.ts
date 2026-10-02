import { z } from "zod";
import { buildBrief } from "@/features/brief/server";
import { errorResponse, parseJson } from "@/server/http";

export const maxDuration = 300;

const Body = z.object({ matterId: z.number().int().positive() });

/** Write the brief for a case from what has been read. */
export async function POST(request: Request) {
  const parsed = await parseJson(request, Body);
  if ("response" in parsed) return parsed.response;
  try {
    const stored = await buildBrief(parsed.data.matterId);
    return Response.json({ fingerprint: stored.fingerprint });
  } catch (err) {
    return errorResponse(err);
  }
}
