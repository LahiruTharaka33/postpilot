import { db } from "./db";

export function logActivity(workspaceId: string, userId: string | null, message: string) {
  return db.activity.create({ data: { workspaceId, userId, message } });
}
