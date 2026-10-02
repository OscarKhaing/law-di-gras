import { z } from "zod";
import { recordVisit } from "@/features/cases/server";
import { errorResponse, parseJson } from "@/server/http";

const Body = z.object({
  matterId: z.number().int().positive(),
  viewer: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});

/** Note that a reader opened a case, and say when they last did. */
export async function POST(request: Request) {
  const parsed = await parseJson(request, Body);
  if ("response" in parsed) return parsed.response;
  try {
    return Response.json({ previous: await recordVisit(parsed.data.matterId, parsed.data.viewer) });
  } catch (err) {
    return errorResponse(err);
  }
}
