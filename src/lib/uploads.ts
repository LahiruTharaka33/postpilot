import { db } from "./db";
import { getCurrentUser } from "./auth";
import { hasRole } from "./constants";

/** The workspace the current user may upload to, or null when they aren't signed in or are only a viewer. */
export async function uploadWorkspace(slug: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const membership = await db.membership.findFirst({ where: { userId: user.id, workspace: { slug } } });
  return membership && hasRole(membership.role, "EDITOR") ? membership.workspaceId : null;
}
