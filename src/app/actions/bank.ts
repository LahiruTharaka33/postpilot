"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { PLATFORMS } from "@/lib/platforms";
import { logActivity } from "@/lib/activity";
import { optionsSchema } from "@/lib/post-schema";

const customSchema = z.record(
  z.enum(PLATFORMS),
  z.object({ caption: z.string().max(70000).nullable(), options: optionsSchema }),
);

const saveSchema = z.object({
  slug: z.string(),
  bankId: z.string().optional(),
  title: z.string().trim().min(1, "Give it a name").max(120),
  baseCaption: z.string().max(70000),
  mediaIds: z.array(z.string()).max(10),
  accountIds: z.array(z.string()).max(50),
  custom: customSchema,
});

export type SaveBankPostInput = z.infer<typeof saveSchema>;
export type SaveBankPostResult = { ok: true; bankId: string } | { ok: false; error: string };

/** Creates or updates a post bank item. It needs no accounts or time, so nothing is validated against platform rules. */
export async function saveBankPost(input: SaveBankPostInput): Promise<SaveBankPostResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;
  const { workspace, user } = await requireMember(data.slug, "EDITOR");
  if (!data.baseCaption.trim() && data.mediaIds.length === 0) return { ok: false, error: "Add a caption or media first" };

  // Only keep media and accounts that belong to this workspace.
  const [media, accounts] = await Promise.all([
    db.media.findMany({ where: { workspaceId: workspace.id, id: { in: data.mediaIds } }, select: { id: true } }),
    db.socialAccount.findMany({ where: { workspaceId: workspace.id, id: { in: data.accountIds } }, select: { id: true } }),
  ]);
  const values = {
    title: data.title,
    baseCaption: data.baseCaption,
    mediaIds: JSON.stringify(data.mediaIds.filter((id) => media.some((m) => m.id === id))),
    accountIds: JSON.stringify(data.accountIds.filter((id) => accounts.some((a) => a.id === id))),
    custom: JSON.stringify(data.custom),
  };

  let bankId = data.bankId;
  if (bankId) {
    const updated = await db.bankPost.updateMany({ where: { id: bankId, workspaceId: workspace.id }, data: values });
    if (updated.count === 0) return { ok: false, error: "That post bank item no longer exists" };
  } else {
    bankId = (await db.bankPost.create({ data: { ...values, workspaceId: workspace.id, authorId: user.id } })).id;
    await logActivity(workspace.id, user.id, `${user.name} added "${data.title}" to the post bank`);
  }
  revalidatePath(`/w/${data.slug}/bank`);
  return { ok: true, bankId };
}

export async function deleteBankPost(slug: string, bankId: string) {
  const { workspace, user } = await requireMember(slug, "EDITOR");
  const item = await db.bankPost.findFirst({ where: { id: bankId, workspaceId: workspace.id } });
  if (!item) return;
  await db.bankPost.delete({ where: { id: item.id } });
  await logActivity(workspace.id, user.id, `${user.name} removed "${item.title}" from the post bank`);
  revalidatePath(`/w/${slug}/bank`);
}
