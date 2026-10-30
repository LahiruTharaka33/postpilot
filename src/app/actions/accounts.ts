"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { PLATFORMS, PLATFORM_RULES } from "@/lib/platforms";
import { getConnector } from "@/lib/connectors";
import { logActivity } from "@/lib/activity";
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
  const { accessToken } = await getConnector(account.platform as (typeof PLATFORMS)[number]).connect(account.handle);
  await db.socialAccount.update({ where: { id: account.id }, data: { status: "CONNECTED", accessToken } });
  revalidatePath(`/w/${slug}`, "layout");
}
