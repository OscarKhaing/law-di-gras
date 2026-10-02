import { z } from "zod";
import { MatterKey } from "@/features/cases/schema";
import { clearFreshRead } from "@/features/cases/server";
import { errorResponse, parseJson } from "@/server/http";

export const maxDuration = 300;

const Body = z.object({ matterId: MatterKey });

/** Clear a fresh read of a case so it can be read from nothing again. The case itself is refused. */
export async function POST(request: Request) {
  const parsed = await parseJson(request, Body);
  if ("response" in parsed) return parsed.response;
  try {
    await clearFreshRead(parsed.data.matterId);
    return Response.json({ cleared: true });
  } catch (err) {
    return errorResponse(err);
  }
}
