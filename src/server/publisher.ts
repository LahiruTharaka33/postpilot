import { db } from "@/lib/db";
import { getConnector } from "@/lib/connectors";
import { parseOptions, type Platform } from "@/lib/platforms";
import type { PostStatus } from "@/lib/constants";

export const MAX_ATTEMPTS = 3;

/** Minutes to wait before retry number `attempts` (1, 2, 4...). */
export function backoffMinutes(attempts: number) {
  return 2 ** Math.max(0, attempts - 1);
}

/** Derives a post's status from its variants' statuses. */
export function rollupStatus(statuses: string[]): PostStatus {
  if (statuses.length === 0 || statuses.every((s) => s === "DRAFT")) return "DRAFT";
  if (statuses.some((s) => s === "PUBLISHING")) return "PUBLISHING";
  if (statuses.some((s) => s === "SCHEDULED")) return "SCHEDULED";
  if (statuses.every((s) => s === "PUBLISHED")) return "PUBLISHED";
  if (statuses.some((s) => s === "PUBLISHED")) return "PARTIAL";
  return "FAILED";
}

export async function refreshPostStatus(postId: string) {
  const variants = await db.postVariant.findMany({ where: { postId }, select: { status: true } });
  const status = rollupStatus(variants.map((v) => v.status));
  await db.post.update({ where: { id: postId }, data: { status } });
  return status;
}

/** Claims one variant (SCHEDULED -> PUBLISHING) so two workers never publish it twice, then publishes it. */
export async function publishVariant(variantId: string, now = new Date()) {
  const claimed = await db.postVariant.updateMany({
    where: { id: variantId, status: "SCHEDULED" },
    data: { status: "PUBLISHING" },
  });
  if (claimed.count === 0) return null;

  try {
    return await publishClaimed(variantId, now);
  } catch (e) {
    // A database error after the claim must not leave the version stuck in PUBLISHING.
    console.error("[publisher] failed to publish", variantId, e);
    await db.postVariant
      .update({
        where: { id: variantId },
        data: { status: "SCHEDULED", attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + 60_000), error: "Internal error, will retry" },
      })
      .catch((err) => console.error("[publisher] could not requeue", variantId, err));
    return { ok: false as const, error: "Internal error", retryable: true };
  }
}

async function publishClaimed(variantId: string, now: Date) {
  const variant = await db.postVariant.findUniqueOrThrow({
    where: { id: variantId },
    include: { account: true, post: true },
  });
  const options = parseOptions(variant.options);
  const mediaIds: string[] = options.mediaIds ?? JSON.parse(variant.post.mediaIds);
  const mediaRows = await db.media.findMany({ where: { id: { in: mediaIds } } });
  const media = mediaIds
    .map((id) => mediaRows.find((m) => m.id === id))
    .filter((m) => m != null)
    .map((m) => ({ url: m.url, type: m.type as "IMAGE" | "VIDEO" }));

  const connector = getConnector(variant.account.platform as Platform);
  let result;
  try {
    result = await connector.publish({
      account: variant.account,
      caption: variant.caption ?? variant.post.baseCaption,
      media,
      options,
    });
  } catch (e) {
    result = { ok: false as const, error: e instanceof Error ? e.message : String(e), retryable: true };
  }

  const attempts = variant.attempts + 1;
  const label = `${variant.account.platform} @${variant.account.handle}`;
  if (result.ok) {
    await db.postVariant.update({
      where: { id: variantId },
      data: { status: "PUBLISHED", attempts, publishedAt: now, externalUrl: result.url, error: null, nextAttemptAt: null },
    });
    await db.activity.create({ data: { workspaceId: variant.post.workspaceId, message: `Published to ${label}` } });
  } else if (result.retryable && attempts < MAX_ATTEMPTS) {
    const next = new Date(now.getTime() + backoffMinutes(attempts) * 60_000);
    await db.postVariant.update({
      where: { id: variantId },
      data: { status: "SCHEDULED", attempts, error: result.error, nextAttemptAt: next },
    });
  } else {
    await db.postVariant.update({
      where: { id: variantId },
      data: { status: "FAILED", attempts, error: result.error, nextAttemptAt: null },
    });
    await db.activity.create({
      data: { workspaceId: variant.post.workspaceId, message: `Failed to publish to ${label}: ${result.error}` },
    });
  }
  await refreshPostStatus(variant.postId);
  return result;
}

/** Publishes every variant that is due. Called every minute by the scheduler and by "Publish now". */
export async function processDue(now = new Date(), where: { postId?: string } = {}) {
  const due = await db.postVariant.findMany({
    where: { status: "SCHEDULED", nextAttemptAt: { lte: now }, ...where },
    select: { id: true },
    take: 50,
  });
  // One at a time: SQLite allows a single writer, and it keeps API rate limits simple.
  let published = 0;
  for (const v of due) if (await publishVariant(v.id, now)) published++;
  return published;
}

let started = false;

/** Starts the in-process scheduler loop (once per server process). */
export function startScheduler(intervalMs = 60_000) {
  if (started) return;
  started = true;
  // Versions left in PUBLISHING by a restart are queued again. With real APIs, check the
  // network for the post first, because the request may have gone through before the restart.
  db.postVariant
    .updateMany({ where: { status: "PUBLISHING" }, data: { status: "SCHEDULED", nextAttemptAt: new Date() } })
    .catch((e) => console.error("[scheduler] recovery failed", e));
  const tick = () =>
    processDue().catch((e) => console.error("[scheduler] tick failed", e));
  setInterval(tick, intervalMs);
  setTimeout(tick, 5_000);
  console.log(`[scheduler] running every ${intervalMs / 1000}s`);
}
