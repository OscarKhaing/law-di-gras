import { FileBody } from "@/features/shares/schema";
import { receivedFileUrl, shareErrorResponse } from "@/features/shares/server";
import { errorResponse, parseJson } from "@/server/http";

// The firm opens a file a provider's office sent with its update: a short-lived address in our
// private storage, given only for a file that belongs to that share.
export async function POST(request: Request) {
  const body = await parseJson(request, FileBody);
  if ("response" in body) return body.response;
  try {
    return Response.json(await receivedFileUrl(body.data.shareId, body.data.path));
  } catch (err) {
    return shareErrorResponse(err) ?? errorResponse(err);
  }
}
