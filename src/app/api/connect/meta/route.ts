import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/auth";
import { metaConfig, metaLoginUrl, metaRedirectUri } from "@/lib/meta";
import { saveLoginState } from "@/lib/meta-connect";
import { requestOrigin } from "./origin";

/** Starts "Connect Facebook & Instagram": sends a workspace owner to Facebook's login dialog. */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  await requireMember(slug, "OWNER");
  const origin = requestOrigin(req);
  const config = metaConfig();
  if (!config) {
    return NextResponse.redirect(new URL(`/w/${slug}/accounts?meta_error=${encodeURIComponent("Facebook connect isn't set up on this server")}`, origin));
  }
  const state = randomBytes(16).toString("hex");
  await saveLoginState(state, slug);
  return NextResponse.redirect(metaLoginUrl(config, metaRedirectUri(origin), state));
}
