import { NextResponse, type NextRequest } from "next/server";

// Quick redirect for signed-out visitors. Pages still check the session properly with requireUser().
export function middleware(req: NextRequest) {
  if (!req.cookies.has("session")) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
}

export const config = { matcher: ["/w/:path*", "/invite/:path*", "/new-workspace"] };
