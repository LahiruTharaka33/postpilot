"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import { uniqueSlug } from "@/lib/slug";
import { logActivity } from "@/lib/activity";

export type FormState = { error?: string; message?: string } | undefined;

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return { error: "Wrong email or password" };
  }
  await createSession(user.id);
  redirect(safeNext(parsed.data.next));
}

const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  workspace: z.string().trim().optional(),
  next: z.string().optional(),
});

export async function signup(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, password, workspace, next } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  if (await db.user.findUnique({ where: { email } })) return { error: "An account with this email already exists" };

  const user = await db.user.create({ data: { name, email, passwordHash: await bcrypt.hash(password, 10) } });
  // People joining through an invite link don't need a workspace of their own.
  if (workspace) {
    const ws = await db.workspace.create({ data: { name: workspace, slug: await uniqueSlug(workspace) } });
    await db.membership.create({ data: { userId: user.id, workspaceId: ws.id, role: "OWNER" } });
    await logActivity(ws.id, user.id, `${name} created the workspace`);
  }
  await createSession(user.id);
  redirect(safeNext(next));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function acceptInvite(token: string) {
  const user = await requireUser();
  const invite = await db.invite.findUnique({ where: { token }, include: { workspace: true } });
  if (!invite || invite.acceptedAt) redirect("/");
  await db.membership.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: invite.workspaceId } },
    create: { userId: user.id, workspaceId: invite.workspaceId, role: invite.role },
    update: { role: invite.role },
  });
  await db.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
  await logActivity(invite.workspaceId, user.id, `${user.name} joined as ${invite.role.toLowerCase()}`);
  redirect(`/w/${invite.workspace.slug}/dashboard`);
}


function safeNext(next?: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
