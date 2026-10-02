import { revokeShare, shareErrorResponse } from "@/features/shares/server";
import { RevokeBody } from "@/features/shares/schema";
import { errorResponse, parseJson } from "@/server/http";

// Withdraw a provider's link.
export async function POST(request: Request) {
  const body = await parseJson(request, RevokeBody);
  if ("response" in body) return body.response;
  try {
    return Response.json(await revokeShare(body.data.shareId));
  } catch (err) {
    return shareErrorResponse(err) ?? errorResponse(err);
  }
}
