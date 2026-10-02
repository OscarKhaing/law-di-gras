import { publishShare, shareErrorResponse } from "@/features/shares/server";
import { PublishBody } from "@/features/shares/schema";
import { errorResponse, parseJson } from "@/server/http";

// Publish the lines the attorney switched on to one provider's link. `token` is the new link's
// token, returned this once; it is null when a live link was updated in place and stays the same.
export async function POST(request: Request) {
  const body = await parseJson(request, PublishBody);
  if ("response" in body) return body.response;
  try {
    const { matterId, contactRef, lines } = body.data;
    return Response.json(await publishShare(matterId, contactRef, lines));
  } catch (err) {
    return shareErrorResponse(err) ?? errorResponse(err);
  }
}
