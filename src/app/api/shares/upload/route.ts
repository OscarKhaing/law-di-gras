import { shareErrorResponse, startUpload } from "@/features/shares/link";
import { errorResponse } from "@/server/http";

// A provider's office asks to attach a file to its answer to one request. The token in the body is
// the only credential and is checked before anything else, so a dead link learns nothing. The
// answer is a one-time address in our private storage: the browser sends the file there itself,
// because a file is too large to pass through a route. This route imports only the provider's side.
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const { token, lineId, fileName, type, size } = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return Response.json(await startUpload(token, lineId, fileName, type, size));
  } catch (err) {
    return shareErrorResponse(err) ?? errorResponse(err);
  }
}
