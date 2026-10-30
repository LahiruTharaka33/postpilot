export const ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const POST_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHING", "PUBLISHED", "PARTIAL", "FAILED"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const VARIANT_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHING", "PUBLISHED", "FAILED"] as const;
export type VariantStatus = (typeof VARIANT_STATUSES)[number];

const RANK: Record<Role, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };

export function hasRole(role: string, min: Role) {
  return (RANK[role as Role] ?? -1) >= RANK[min];
}

export const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  SCHEDULED: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  PUBLISHING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  PUBLISHED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  PARTIAL: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};
