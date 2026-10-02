import { finishUpload, shareErrorResponse } from "@/features/shares/link";
import { errorResponse } from "@/server/http";

// The office's browser says a file has been sent. finishUpload checks the link, that the path is in
// this share's own folder and that the file is really there and is what it claims to be, and only
// then tells the firm. Nothing is written to Clio. This route imports only the provider's side.
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const { token, lineId, path } = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return Response.json(await finishUpload(token, lineId, path));
  } catch (err) {
    return shareErrorResponse(err) ?? errorResponse(err);
  }
}
