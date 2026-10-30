"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember, requireUser } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { logActivity } from "@/lib/activity";
import { uniqueSlug } from "@/lib/slug";
import type { FormState } from "./auth";

export async function createWorkspace(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a name" };
  const ws = await db.workspace.create({ data: { name, slug: await uniqueSlug(name) } });
  await db.membership.create({ data: { userId: user.id, workspaceId: ws.id, role: "OWNER" } });
  await logActivity(ws.id, user.id, `${user.name} created the workspace`);
  redirect(`/w/${ws.slug}/accounts`);
}

const inviteSchema = z.object({
  slug: z.string(),
  email: z.string().email("Enter a valid email"),
  role: z.enum(ROLES),
});

/** Creates an invite link. v1 shows the link on screen instead of emailing it. */
export async function createInvite(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { workspace, user } = await requireMember(parsed.data.slug, "OWNER");
  const token = randomBytes(16).toString("hex");
  await db.invite.create({
    data: { token, email: parsed.data.email.toLowerCase(), role: parsed.data.role, workspaceId: workspace.id },
  });
  await logActivity(workspace.id, user.id, `${user.name} invited ${parsed.data.email} as ${parsed.data.role.toLowerCase()}`);
  revalidatePath(`/w/${workspace.slug}/settings`);
  return { message: `/invite/${token}` };
}

export async function changeRole(slug: string, membershipId: string, role: string) {
  const { workspace, user } = await requireMember(slug, "OWNER");
  if (!ROLES.includes(role as (typeof ROLES)[number])) throw new Error("Unknown role");
  const membership = await db.membership.findFirstOrThrow({ where: { id: membershipId, workspaceId: workspace.id } });
  if (membership.userId === user.id) throw new Error("You can't change your own role");
  await db.membership.update({ where: { id: membershipId }, data: { role } });
  revalidatePath(`/w/${slug}/settings`);
}

export async function removeMember(slug: string, membershipId: string) {
  const { workspace, user } = await requireMember(slug, "OWNER");
  const membership = await db.membership.findFirstOrThrow({ where: { id: membershipId, workspaceId: workspace.id } });
  if (membership.userId === user.id) throw new Error("You can't remove yourself");
  await db.membership.delete({ where: { id: membershipId } });
  revalidatePath(`/w/${slug}/settings`);
}
