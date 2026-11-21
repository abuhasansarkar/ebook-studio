import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic auth redirect only (cookie presence). Real authorization is enforced
 * by the Express API on every request.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const login = new URL("/login", request.url);
    // Keep the query too, so a filtered list or ?bookId= screen reopens as it was.
    login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
