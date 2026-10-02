import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { authorizeUrl, callbackUrl } from "@/server/clio";
import { errorResponse } from "@/server/http";

/** Send the browser to Clio to allow read access. Clio sends it back to /api/clio/callback. */
export async function GET(request: Request) {
  try {
    const state = randomUUID();
    (await cookies()).set("clio_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
    return Response.redirect(authorizeUrl(callbackUrl(request), state));
  } catch (err) {
    return errorResponse(err);
  }
}
