import { replyToShare, shareErrorResponse } from "@/features/shares/link";
import { errorResponse } from "@/server/http";

// A provider's office answers one request on its update. The token in the body is the only
// credential. replyToShare checks it before anything else, so an unknown, withdrawn or expired link
// gets the same answer whatever the rest of the body holds; the reply is stored in our database,
// never in Clio. This route imports only the provider's side (link.ts), which cannot read the case.
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const { token, lineId, text } = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return Response.json(await replyToShare(token, lineId, text));
  } catch (err) {
    return shareErrorResponse(err) ?? errorResponse(err);
  }
}
