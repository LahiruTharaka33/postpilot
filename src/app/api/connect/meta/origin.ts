import type { NextRequest } from "next/server";

/** The public address of this app. Behind Render's proxy, req.url can show the internal host. */
export function requestOrigin(req: NextRequest) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return host ? `${proto}://${host}` : req.nextUrl.origin;
}
