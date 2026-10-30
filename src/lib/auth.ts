import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { hasRole, type Role } from "./constants";

const COOKIE = "session";
function secret() {
  const value = process.env.SESSION_SECRET;
  // The fallback is public (it's in the repo), so production must set its own secret.
  if (!value && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
  return new TextEncoder().encode(value ?? "dev-only-secret");
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return await db.user.findUnique({ where: { id: payload.sub }, select: { id: true, name: true, email: true } });
  } catch {
    return null;
  }
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Loads the workspace by slug and checks the current user is a member with at least `min` role. */
export const requireMember = cache(async (slug: string, min: Role = "VIEWER") => {
  const user = await requireUser();
  const membership = await db.membership.findFirst({
    where: { userId: user.id, workspace: { slug } },
    include: { workspace: true },
  });
  if (!membership) notFound();
  if (!hasRole(membership.role, min)) throw new Error(`This needs the ${min} role`);
  return { user, workspace: membership.workspace, role: membership.role as Role };
});
