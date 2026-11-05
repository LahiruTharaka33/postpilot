import { db } from "@/lib/db";
import { getConnector, type PublishResult } from "@/lib/connectors";
import { decryptToken } from "@/lib/crypto";
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

  const connector = getConnector(variant.account.platform as Platform, variant.account.provider);
  let result: PublishResult;
  try {
    result = await connector.publish({
      account: { ...variant.account, accessToken: decryptToken(variant.account.accessToken) },
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
  } else if (result.retryable && !result.needsReconnect && attempts < MAX_ATTEMPTS) {
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
    // The owner sees "Reconnect" on the Accounts page, and the account can't be picked until then.
    if (result.needsReconnect) {
      await db.socialAccount.update({ where: { id: variant.accountId }, data: { status: "DISCONNECTED" } });
    }
  }
  await refreshPostStatus(variant.postId);
  return result;
}

/** Publishes every variant that is due. Called by the scheduler and by "Publish now". */
export async function processDue(now = new Date(), where: { postId?: string } = {}) {
  const due = await db.postVariant.findMany({
    where: { status: "SCHEDULED", nextAttemptAt: { lte: now }, ...where },
    select: { id: true },
    take: 50,
  });
  // One at a time keeps network API rate limits simple.
  let published = 0;
  for (const v of due) if (await publishVariant(v.id, now)) published++;
  return published;
}

/**
 * The scheduler wakes up often but only reads the database when a post is due, after a change,
 * or after `maxIdleMs` as a safety check. A check every minute would stop the database from ever
 * sleeping and use up a free plan's compute allowance.
 */
const DEFAULT_MAX_IDLE_MS = 60 * 60_000;

/** When to read the database next: the next due time, but never later than the safety check. */
export function nextCheckTime(now: number, earliestDue: Date | null, maxIdleMs = DEFAULT_MAX_IDLE_MS) {
  const safetyCheck = now + maxIdleMs;
  return earliestDue ? Math.min(earliestDue.getTime(), safetyCheck) : safetyCheck;
}

// On globalThis because Next.js bundles instrumentation and server actions separately, and both
// must share this state. It assumes one server process; another process's changes are picked up
// by the safety check.
const globals = globalThis as unknown as { postpilotScheduler?: { started: boolean; running: boolean; nextCheckAt: number; wakes: number } };
const scheduler = (globals.postpilotScheduler ??= { started: false, running: false, nextCheckAt: 0, wakes: 0 });

/** Call after anything that changes when posts are due, so the next tick reads the database. */
export function wakeScheduler() {
  scheduler.nextCheckAt = 0;
  scheduler.wakes++;
}

/** One scheduler pass. Returns false when it had nothing to do and left the database alone. */
export async function schedulerTick(now = Date.now(), maxIdleMs = DEFAULT_MAX_IDLE_MS) {
  if (scheduler.running || now < scheduler.nextCheckAt) return false;
  scheduler.running = true;
  const wakes = scheduler.wakes;
  try {
    await processDue(new Date(now));
    const next = await db.postVariant.findFirst({
      where: { status: "SCHEDULED", nextAttemptAt: { not: null } },
      orderBy: { nextAttemptAt: "asc" },
      select: { nextAttemptAt: true },
    });
    // A change made during this pass may not be in the query above, so look again next tick.
    scheduler.nextCheckAt = scheduler.wakes === wakes ? nextCheckTime(now, next?.nextAttemptAt ?? null, maxIdleMs) : 0;
    return true;
  } catch (e) {
    // nextCheckAt is unchanged and already in the past, so the next tick tries again.
    console.error("[scheduler] tick failed", e);
    return true;
  } finally {
    scheduler.running = false;
  }
}

/** Starts the in-process scheduler loop (once per server process). */
export function startScheduler(intervalMs = 60_000) {
  if (scheduler.started) return;
  scheduler.started = true;
  // Versions left in PUBLISHING by a restart are queued again. With real APIs, check the
  // network for the post first, because the request may have gone through before the restart.
  db.postVariant
    .updateMany({ where: { status: "PUBLISHING" }, data: { status: "SCHEDULED", nextAttemptAt: new Date() } })
    .catch((e) => console.error("[scheduler] recovery failed", e));
  const tick = () => void schedulerTick();
  setInterval(tick, intervalMs);
  setTimeout(tick, 5_000);
  console.log(`[scheduler] running every ${intervalMs / 1000}s`);
}
