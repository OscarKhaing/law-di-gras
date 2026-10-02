import { callErrorResponse, StartBody, startCall } from "@/features/calls/server";
import { parseJson } from "@/server/http";

// Get a call ready for the browser to place: who is rung is decided here, from Clio, not by the browser.
export async function POST(request: Request) {
  const body = await parseJson(request, StartBody);
  if ("response" in body) return body.response;
  try {
    const { matterId, contactRef, number, demonstration } = body.data;
    return Response.json(await startCall(matterId, contactRef ?? null, number ?? null, demonstration ?? false));
  } catch (err) {
    return callErrorResponse(err);
  }
}
