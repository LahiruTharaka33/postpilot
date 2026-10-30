"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { PLATFORM_RULES, type Platform } from "@/lib/platforms";
import { validateVariant, type MediaInfo } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { processDue, refreshPostStatus } from "@/server/publisher";

const optionsSchema = z
  .object({
    aspect: z.enum(["1:1", "4:5", "9:16", "16:9", "1.91:1", "original"]).optional(),
    focalX: z.number().min(0).max(100).optional(),
    focalY: z.number().min(0).max(100).optional(),
    title: z.string().max(200).optional(),
    privacy: z.enum(["PUBLIC", "FRIENDS", "PRIVATE"]).optional(),
    allowComments: z.boolean().optional(),
    allowDuet: z.boolean().optional(),
    visibility: z.enum(["PUBLIC", "CONNECTIONS"]).optional(),
    firstComment: z.string().max(2200).optional(),
    igFormat: z.enum(["FEED", "REEL"]).optional(),
    mediaIds: z.array(z.string()).max(10).optional(),
  })
  .strict();

const saveSchema = z.object({
  slug: z.string(),
  postId: z.string().optional(),
  baseCaption: z.string().max(70000),
  mediaIds: z.array(z.string()).max(10),
  mode: z.enum(["draft", "schedule", "now"]),
  scheduledAt: z.string().datetime().nullable(),
  timezone: z.string(),
  variants: z
    .array(
      z.object({
        accountId: z.string(),
        caption: z.string().nullable(),
        options: optionsSchema,
        // This network's own time; null or missing = the post's main time.
        scheduledAt: z.string().datetime().nullable().optional(),
      }),
    )
    .min(1, "Pick at least one account"),
});

export type SavePostInput = z.infer<typeof saveSchema>;
export type SavePostResult = { ok: true; postId: string; status: string } | { ok: false; error: string; details?: string[] };

export async function savePost(input: SavePostInput): Promise<SavePostResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;
  const { workspace, user } = await requireMember(data.slug, "EDITOR");

  const accounts = await db.socialAccount.findMany({
    where: { workspaceId: workspace.id, id: { in: data.variants.map((v) => v.accountId) }, status: "CONNECTED" },
  });
  if (accounts.length !== data.variants.length) return { ok: false, error: "One of the accounts is missing or disconnected" };

  const mediaRows = await db.media.findMany({ where: { workspaceId: workspace.id, id: { in: data.mediaIds } } });
  if (mediaRows.length !== data.mediaIds.length) return { ok: false, error: "Some media could not be found" };
  const mediaInfo = (ids: string[]): MediaInfo[] =>
    ids.map((id) => {
      const m = mediaRows.find((r) => r.id === id)!;
      return { type: m.type as MediaInfo["type"], width: m.width, height: m.height, duration: m.duration, size: m.size };
    });
  if (data.variants.some((v) => v.options.mediaIds?.some((id) => !data.mediaIds.includes(id)))) {
    return { ok: false, error: "A network uses media that isn't attached to the post" };
  }

  // Each network can go out at its own time.
  const now = new Date();
  const labelOf = (accountId: string) => PLATFORM_RULES[accounts.find((a) => a.id === accountId)!.platform as Platform].label;
  const times = new Map<string, Date | null>();
  for (const v of data.variants) {
    const iso = v.scheduledAt ?? data.scheduledAt;
    const t = data.mode === "now" ? now : iso ? new Date(iso) : null;
    if (data.mode === "schedule") {
      if (!t) return { ok: false, error: `Pick a date and time for ${labelOf(v.accountId)}` };
      if (t.getTime() < now.getTime() - 60_000) return { ok: false, error: `${labelOf(v.accountId)}: that time is in the past` };
    }
    times.set(v.accountId, t);
  }

  // Drafts can be incomplete; anything going out must pass every platform's rules.
  if (data.mode !== "draft") {
    const problems: string[] = [];
    for (const v of data.variants) {
      const account = accounts.find((a) => a.id === v.accountId)!;
      const platform = account.platform as Platform;
      const { errors } = validateVariant(platform, {
        caption: v.caption ?? data.baseCaption,
        media: mediaInfo(v.options.mediaIds ?? data.mediaIds),
        options: v.options,
      });
      problems.push(...errors.map((e) => `${PLATFORM_RULES[platform].label}: ${e}`));
    }
    if (problems.length) return { ok: false, error: "Fix these before publishing", details: problems };
  }

  if (data.postId) {
    const existing = await db.post.findFirst({ where: { id: data.postId, workspaceId: workspace.id } });
    if (!existing) return { ok: false, error: "Post not found" };
    const sent = await db.postVariant.count({ where: { postId: existing.id, status: { in: ["PUBLISHING", "PUBLISHED"] } } });
    if (sent > 0 || ["PUBLISHING", "PUBLISHED", "PARTIAL"].includes(existing.status)) {
      return { ok: false, error: "Part of this post has already gone out, so it can't be edited. Duplicate it or move the remaining networks on the calendar." };
    }
  }

  const variantStatus = data.mode === "draft" ? "DRAFT" : "SCHEDULED";
  const postData = {
    baseCaption: data.baseCaption,
    mediaIds: JSON.stringify(data.mediaIds),
    scheduledAt: earliest([...times.values()]),
    timezone: data.timezone,
    status: variantStatus,
  };
  const variants = data.variants.map((v) => ({
    accountId: v.accountId,
    caption: v.caption,
    options: JSON.stringify(v.options),
    scheduledAt: times.get(v.accountId) ?? null,
    status: variantStatus,
    nextAttemptAt: variantStatus === "SCHEDULED" ? times.get(v.accountId) ?? null : null,
  }));

  const post = await db.$transaction(async (tx) => {
    if (data.postId) {
      await tx.postVariant.deleteMany({ where: { postId: data.postId } });
      return tx.post.update({ where: { id: data.postId }, data: { ...postData, variants: { create: variants } } });
    }
    return tx.post.create({
      data: { ...postData, workspaceId: workspace.id, authorId: user.id, variants: { create: variants } },
    });
  });

  const verb = data.mode === "draft" ? "saved a draft" : data.mode === "now" ? "published a post" : "scheduled a post";
  await logActivity(workspace.id, user.id, `${user.name} ${verb} for ${accounts.length} account${accounts.length > 1 ? "s" : ""}`);

  if (data.mode === "now") await processDue(new Date(), { postId: post.id });
  const status = (await db.post.findUniqueOrThrow({ where: { id: post.id } })).status;
  revalidatePath(`/w/${data.slug}`, "layout");
  return { ok: true, postId: post.id, status };
}

/**
 * Moves a post to a new time (calendar drag and drop).
 * With `variantIds`, only those networks move to `isoDate`. Without, every network that hasn't gone out
 * shifts by the same amount, so different times per network keep their spacing.
 */
export async function reschedulePost(slug: string, postId: string, isoDate: string, variantIds?: string[]) {
  const { workspace } = await requireMember(slug, "EDITOR");
  const post = await db.post.findFirstOrThrow({ where: { id: postId, workspaceId: workspace.id }, include: { variants: true } });
  const when = new Date(isoDate);
  if (isNaN(when.getTime())) throw new Error("Invalid date");

  const movable = post.variants.filter(
    (v) => ["SCHEDULED", "DRAFT"].includes(v.status) && (!variantIds || variantIds.includes(v.id)),
  );
  if (movable.length === 0) throw new Error("Nothing to move: these networks have already gone out");

  const anchor = variantIds ? null : earliest(movable.map((v) => v.scheduledAt));
  const updates = movable.map((v) => ({
    v,
    at: anchor && v.scheduledAt ? new Date(v.scheduledAt.getTime() + (when.getTime() - anchor.getTime())) : when,
  }));
  if (updates.some(({ v, at }) => v.status === "SCHEDULED" && at.getTime() < Date.now())) {
    throw new Error("Scheduled posts can't be moved into the past");
  }

  await db.$transaction(
    updates.map(({ v, at }) =>
      db.postVariant.update({
        where: { id: v.id },
        data: { scheduledAt: at, ...(v.status === "SCHEDULED" ? { nextAttemptAt: at } : {}) },
      }),
    ),
  );
  await syncPostTime(postId);
  revalidatePath(`/w/${slug}`, "layout");
}

function earliest(dates: Array<Date | null | undefined>) {
  const valid = dates.filter((d): d is Date => d instanceof Date);
  return valid.length ? new Date(Math.min(...valid.map((d) => d.getTime()))) : null;
}

/** Keeps Post.scheduledAt equal to the earliest time of its networks. */
async function syncPostTime(postId: string) {
  const variants = await db.postVariant.findMany({ where: { postId }, select: { scheduledAt: true } });
  await db.post.update({ where: { id: postId }, data: { scheduledAt: earliest(variants.map((v) => v.scheduledAt)) } });
}

/** Re-queues failed versions of a post and publishes them right away. */
export async function retryPost(slug: string, postId: string) {
  const { workspace, user } = await requireMember(slug, "EDITOR");
  await db.post.findFirstOrThrow({ where: { id: postId, workspaceId: workspace.id } });
  await db.postVariant.updateMany({
    where: { postId, status: "FAILED" },
    data: { status: "SCHEDULED", attempts: 0, nextAttemptAt: new Date(), error: null },
  });
  await refreshPostStatus(postId);
  await logActivity(workspace.id, user.id, `${user.name} retried a failed post`);
  await processDue(new Date(), { postId });
  revalidatePath(`/w/${slug}`, "layout");
}

export async function unschedulePost(slug: string, postId: string) {
  const { workspace } = await requireMember(slug, "EDITOR");
  await db.post.findFirstOrThrow({ where: { id: postId, workspaceId: workspace.id, status: "SCHEDULED" } });
  await db.postVariant.updateMany({ where: { postId, status: "SCHEDULED" }, data: { status: "DRAFT", nextAttemptAt: null } });
  await refreshPostStatus(postId);
  revalidatePath(`/w/${slug}`, "layout");
}

export async function duplicatePost(slug: string, postId: string) {
  const { workspace, user } = await requireMember(slug, "EDITOR");
  const post = await db.post.findFirstOrThrow({ where: { id: postId, workspaceId: workspace.id }, include: { variants: true } });
  const copy = await db.post.create({
    data: {
      workspaceId: workspace.id,
      authorId: user.id,
      baseCaption: post.baseCaption,
      mediaIds: post.mediaIds,
      timezone: post.timezone,
      status: "DRAFT",
      variants: {
        create: post.variants.map((v) => ({ accountId: v.accountId, caption: v.caption, options: v.options, status: "DRAFT" })),
      },
    },
  });
  revalidatePath(`/w/${slug}`, "layout");
  return copy.id;
}

export async function deletePost(slug: string, postId: string) {
  const { workspace, user } = await requireMember(slug, "EDITOR");
  await db.post.deleteMany({ where: { id: postId, workspaceId: workspace.id } });
  await logActivity(workspace.id, user.id, `${user.name} deleted a post`);
  revalidatePath(`/w/${slug}`, "layout");
}
