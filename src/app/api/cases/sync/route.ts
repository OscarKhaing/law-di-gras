import { z } from "zod";
import { documentStatus, syncCase } from "@/features/cases/server";
import { errorResponse, parseJson } from "@/server/http";
import { MatterKey } from "@/features/cases/schema";

export const maxDuration = 300;

const Body = z.object({ matterId: MatterKey });

/** Read a matter from Clio into Case Desk. */
export async function POST(request: Request) {
  const parsed = await parseJson(request, Body);
  if ("response" in parsed) return parsed.response;
  try {
    const file = await syncCase(parsed.data.matterId);
    return Response.json({
      matterId: file.matterId,
      entries: file.entries.length,
      fingerprint: file.fingerprint,
      documents: await documentStatus(file),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
