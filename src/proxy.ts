import { NextResponse, type NextRequest } from "next/server";

// Optional site-wide password, so strangers can't spend API credits through the public URL.
// Off unless SITE_PASSWORD is set. The browser prompts once (any username) and then sends the
// credentials with every page load and API call.
export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice("Basic ".length));
      if (decoded.slice(decoded.indexOf(":") + 1) === password) return NextResponse.next();
    } catch {
      // Malformed header: fall through to the 401.
    }
  }

  return new NextResponse("Password required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Case Desk"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
