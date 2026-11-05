"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { PLATFORMS, PLATFORM_RULES } from "@/lib/platforms";
import { getConnector } from "@/lib/connectors";
import { logActivity } from "@/lib/activity";
import { encryptToken } from "@/lib/crypto";
import { listPages } from "@/lib/meta";
import { clearPendingConnection, getPendingConnection } from "@/lib/meta-connect";
import type { FormState } from "./auth";

const COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444", "#0ea5e9"];

const connectSchema = z.object({
  slug: z.string(),
  platform: z.enum(PLATFORMS),
  handle: z
    .string()
    .trim()
    .transform((h) => h.replace(/^@/, ""))
    .pipe(z.string().regex(/^[\w.]{2,30}$/, "Handle can use letters, numbers, _ and . (2-30 characters)")),
  displayName: z.string().trim().min(1, "Enter a display name"),
});

/** Connects a mock account. A real connector would start an OAuth redirect here instead. */
export async function connectAccount(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = connectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { slug, platform, handle, displayName } = parsed.data;
  const { workspace, user } = await requireMember(slug, "OWNER");

  const { accessToken } = await getConnector(platform).connect(handle);
  await db.socialAccount.create({
    data: {
      workspaceId: workspace.id,
      platform,
      handle,
      displayName,
      accessToken,
      avatarColor: COLORS[Math.floor(Math.random() * COLORS.length)],
    },
  });
  await logActivity(workspace.id, user.id, `${user.name} connected ${PLATFORM_RULES[platform].label} @${handle}`);
  revalidatePath(`/w/${slug}`, "layout");
  return { message: `Connected @${handle}` };
}

/** Saves the Pages and Instagram accounts ticked in the Facebook page picker as real accounts. */
export async function saveMetaAccounts(slug: string, formData: FormData) {
  const { workspace, user } = await requireMember(slug, "OWNER");
  const userToken = await getPendingConnection(slug);
  if (!userToken) redirect(`/w/${slug}/accounts?meta_error=${encodeURIComponent("The Facebook sign-in expired. Please connect again.")}`);

  // Tokens come from Facebook again here, never from the form.
  const pages = await listPages(userToken);
  const fb = new Set(formData.getAll("fb").map(String));
  const ig = new Set(formData.getAll("ig").map(String));
  const picked = [
    ...pages
      .filter((p) => fb.has(p.id))
      .map((p) => ({ platform: "FACEBOOK" as const, externalId: p.id, handle: p.username ?? p.id, displayName: p.name, avatarUrl: p.pictureUrl, token: p.accessToken })),
    ...pages
      .filter((p) => p.instagram && ig.has(p.id))
      .map((p) => ({ platform: "INSTAGRAM" as const, externalId: p.instagram!.id, handle: p.instagram!.username, displayName: p.instagram!.username, avatarUrl: p.instagram!.pictureUrl, token: p.accessToken })),
  ];
  if (picked.length === 0) redirect(`/w/${slug}/accounts/meta?error=${encodeURIComponent("Tick at least one Page or Instagram account")}`);

  for (const a of picked) {
    const data = { handle: a.handle, displayName: a.displayName, avatarUrl: a.avatarUrl ?? null, accessToken: encryptToken(a.token), status: "CONNECTED" };
    const existing = await db.socialAccount.findFirst({
      where: { workspaceId: workspace.id, platform: a.platform, provider: "META", externalId: a.externalId },
    });
    if (existing) {
      await db.socialAccount.update({ where: { id: existing.id }, data });
    } else {
      await db.socialAccount.create({
        data: { ...data, workspaceId: workspace.id, platform: a.platform, provider: "META", externalId: a.externalId, avatarColor: COLORS[Math.floor(Math.random() * COLORS.length)] },
      });
    }
    await logActivity(workspace.id, user.id, `${user.name} connected ${PLATFORM_RULES[a.platform].label} ${a.displayName}`);
  }
  await clearPendingConnection();
  revalidatePath(`/w/${slug}`, "layout");
  redirect(`/w/${slug}/accounts?meta_connected=${picked.length}`);
}

export async function disconnectAccount(slug: string, accountId: string) {
  const { workspace, user } = await requireMember(slug, "OWNER");
  const account = await db.socialAccount.findFirstOrThrow({ where: { id: accountId, workspaceId: workspace.id } });
  // Keep the row so post history stays intact; it just can't be picked for new posts.
  await db.socialAccount.update({ where: { id: account.id }, data: { status: "DISCONNECTED", accessToken: null } });
  await logActivity(workspace.id, user.id, `${user.name} disconnected ${PLATFORM_RULES[account.platform as keyof typeof PLATFORM_RULES].label} @${account.handle}`);
  revalidatePath(`/w/${slug}`, "layout");
}

export async function reconnectAccount(slug: string, accountId: string) {
  const { workspace } = await requireMember(slug, "OWNER");
  const account = await db.socialAccount.findFirstOrThrow({ where: { id: accountId, workspaceId: workspace.id } });
  // Real accounts get a new token by signing in with Facebook again.
  if (account.provider === "META") redirect(`/api/connect/meta?slug=${encodeURIComponent(slug)}`);
  const { accessToken } = await getConnector(account.platform as (typeof PLATFORMS)[number]).connect(account.handle);
  await db.socialAccount.update({ where: { id: account.id }, data: { status: "CONNECTED", accessToken } });
  revalidatePath(`/w/${slug}`, "layout");
}
