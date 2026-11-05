import { NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/auth";
import { exchangeCode, metaConfig, metaRedirectUri } from "@/lib/meta";
import { savePendingConnection, takeLoginState } from "@/lib/meta-connect";
import { requestOrigin } from "../origin";

/** Facebook sends the person back here after the login dialog. The page picker comes next. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const origin = requestOrigin(req);
  const slug = await takeLoginState(params.get("state"));
  if (!slug) {
    return NextResponse.redirect(new URL("/?meta_error=" + encodeURIComponent("The Facebook sign-in expired. Please try again."), origin));
  }
  const back = (error: string) =>
    NextResponse.redirect(new URL(`/w/${slug}/accounts?meta_error=${encodeURIComponent(error)}`, origin));

  await requireMember(slug, "OWNER");
  const config = metaConfig();
  if (!config) return back("Facebook connect isn't set up on this server");

  const code = params.get("code");
  // The person pressed Cancel, or Facebook refused the login.
  if (!code) return back(params.get("error_description") ?? "Facebook sign-in was cancelled");

  try {
    const userToken = await exchangeCode(config, metaRedirectUri(origin), code);
    await savePendingConnection(slug, userToken);
  } catch (e) {
    console.error("[meta] code exchange failed", e);
    return back(`Facebook sign-in failed: ${e instanceof Error ? e.message : "unknown error"}`);
  }
  return NextResponse.redirect(new URL(`/w/${slug}/accounts/meta`, origin));
}
