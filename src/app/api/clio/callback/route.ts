import { cookies } from "next/headers";
import { callbackUrl, exchangeCode } from "@/server/clio";
import { errorResponse } from "@/server/http";

/** Clio sends the browser back here with a code, which is traded for tokens. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expected = (await cookies()).get("clio_state")?.value;
    if (!code) {
      return Response.json(
        { error: { type: "clio_declined", message: "Clio did not allow the connection. Start again from the case list." } },
        { status: 400 },
      );
    }
    if (!state || state !== expected) {
      return Response.json(
        { error: { type: "invalid_request", message: "This connection attempt did not start here. Start again from the case list." } },
        { status: 400 },
      );
    }
    const redirectUri = callbackUrl(request);
    await exchangeCode(code, redirectUri);
    return Response.redirect(new URL("/", redirectUri));
  } catch (err) {
    return errorResponse(err);
  }
}
