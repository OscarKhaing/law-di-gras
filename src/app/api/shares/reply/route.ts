import { replyToShare, shareErrorResponse } from "@/features/shares/server";
import { ReplyBody } from "@/features/shares/schema";
import { errorResponse, parseJson } from "@/server/http";

// A provider's office answers one request on its update. The token in the body is the only
// credential, and replyToShare checks it; the reply is stored in our database, never in Clio.
export async function POST(request: Request) {
  const body = await parseJson(request, ReplyBody);
  if ("response" in body) return body.response;
  try {
    const { token, lineId, text } = body.data;
    return Response.json(await replyToShare(token, lineId, text));
  } catch (err) {
    return shareErrorResponse(err) ?? errorResponse(err);
  }
}
