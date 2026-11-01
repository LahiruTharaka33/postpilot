import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { registerConnector } from "@/lib/connectors";
import { MockConnector } from "@/lib/connectors/mock";
import { MAX_ATTEMPTS, backoffMinutes, nextCheckTime, processDue, rollupStatus, schedulerTick, wakeScheduler } from "@/server/publisher";

describe("rollupStatus", () => {
  it("derives the post status from its versions", () => {
    expect(rollupStatus(["DRAFT", "DRAFT"])).toBe("DRAFT");
    expect(rollupStatus(["SCHEDULED", "PUBLISHED"])).toBe("SCHEDULED");
    expect(rollupStatus(["PUBLISHED", "PUBLISHED"])).toBe("PUBLISHED");
    expect(rollupStatus(["PUBLISHED", "FAILED"])).toBe("PARTIAL");
    expect(rollupStatus(["FAILED"])).toBe("FAILED");
    expect(rollupStatus(["PUBLISHING", "FAILED"])).toBe("PUBLISHING");
  });

  it("backs off 1, 2, 4 minutes", () => {
    expect([1, 2, 3].map(backoffMinutes)).toEqual([1, 2, 4]);
  });
});

describe("nextCheckTime", () => {
  const now = 1_000_000;

  it("uses the safety check when nothing is scheduled or the next post is far away", () => {
    expect(nextCheckTime(now, null, 5000)).toBe(now + 5000);
    expect(nextCheckTime(now, new Date(now + 9000), 5000)).toBe(now + 5000);
  });

  it("uses the due time when it comes first", () => {
    expect(nextCheckTime(now, new Date(now + 2000), 5000)).toBe(now + 2000);
  });
});

describe("processDue", () => {
  let workspaceId: string;
  let authorId: string;

  beforeEach(async () => {
    await db.workspace.deleteMany();
    await db.user.deleteMany();
    for (const p of ["FACEBOOK", "X"] as const) registerConnector(new MockConnector(p, 0, [0, 0]));
    const user = await db.user.create({ data: { name: "T", email: `t${Date.now()}@t.test`, passwordHash: "x" } });
    const ws = await db.workspace.create({ data: { name: "W", slug: `w${Date.now()}` } });
    workspaceId = ws.id;
    authorId = user.id;
  });

  afterAll(() => db.$disconnect());

  async function makePost(caption: string, scheduledAt: Date) {
    const accounts = await Promise.all(
      ["FACEBOOK", "X"].map((platform) =>
        db.socialAccount.create({ data: { workspaceId, platform, handle: "brand", displayName: "Brand", avatarColor: "#000" } }),
      ),
    );
    return db.post.create({
      data: {
        workspaceId,
        authorId,
        baseCaption: caption,
        status: "SCHEDULED",
        scheduledAt,
        variants: { create: accounts.map((a) => ({ accountId: a.id, status: "SCHEDULED", nextAttemptAt: scheduledAt })) },
      },
      include: { variants: true },
    });
  }

  it("publishes due posts and skips future ones", async () => {
    const now = new Date();
    const due = await makePost("Due", new Date(now.getTime() - 1000));
    const later = await makePost("Later", new Date(now.getTime() + 3_600_000));

    expect(await processDue(now)).toBe(2);
    const dueAfter = await db.post.findUniqueOrThrow({ where: { id: due.id }, include: { variants: true } });
    expect(dueAfter.status).toBe("PUBLISHED");
    expect(dueAfter.variants.every((v) => v.externalUrl?.startsWith("https://"))).toBe(true);
    expect((await db.post.findUniqueOrThrow({ where: { id: later.id } })).status).toBe("SCHEDULED");
  });

  it("publishes each network at its own time", async () => {
    const now = new Date();
    const later = new Date(now.getTime() + 3_600_000);
    const post = await makePost("Split", new Date(now.getTime() - 1000));
    const [fb, x] = post.variants;
    await db.postVariant.update({ where: { id: x.id }, data: { scheduledAt: later, nextAttemptAt: later } });

    expect(await processDue(now)).toBe(1);
    let p = await db.post.findUniqueOrThrow({ where: { id: post.id }, include: { variants: true } });
    expect(p.variants.find((v) => v.id === fb.id)?.status).toBe("PUBLISHED");
    expect(p.variants.find((v) => v.id === x.id)?.status).toBe("SCHEDULED");
    expect(p.status).toBe("SCHEDULED");

    expect(await processDue(new Date(later.getTime() + 1000))).toBe(1);
    p = await db.post.findUniqueOrThrow({ where: { id: post.id }, include: { variants: true } });
    expect(p.status).toBe("PUBLISHED");
  });

  it("scheduler leaves the database alone until a post is due or something changes", async () => {
    const t0 = Date.now();
    const hour = 3_600_000;
    wakeScheduler();
    expect(await schedulerTick(t0, hour)).toBe(true);

    // Nothing is scheduled, so the next ticks skip the database until the safety check.
    expect(await schedulerTick(t0 + 60_000, hour)).toBe(false);
    expect(await schedulerTick(t0 + hour - 1, hour)).toBe(false);

    // A new post wakes the scheduler, which then remembers its due time.
    const due = new Date(t0 + 10 * 60_000);
    const post = await makePost("Later today", due);
    wakeScheduler();
    expect(await schedulerTick(t0 + 60_000, hour)).toBe(true);
    expect(await schedulerTick(t0 + 2 * 60_000, hour)).toBe(false);
    expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe("SCHEDULED");

    // At the due time it publishes without being woken.
    expect(await schedulerTick(due.getTime() + 1000, hour)).toBe(true);
    expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe("PUBLISHED");
  });

  it("does not publish the same version twice when two ticks overlap", async () => {
    const now = new Date();
    await makePost("Once", new Date(now.getTime() - 1000));
    const [a, b] = await Promise.all([processDue(now), processDue(now)]);
    expect(a + b).toBe(2);
  });

  it("retries with backoff, then marks the post failed", async () => {
    let now = new Date();
    const post = await makePost("Broken #fail", new Date(now.getTime() - 1000));

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      expect(await processDue(now)).toBe(2);
      const p = await db.post.findUniqueOrThrow({ where: { id: post.id }, include: { variants: true } });
      if (attempt < MAX_ATTEMPTS) {
        expect(p.status).toBe("SCHEDULED");
        expect(p.variants[0].attempts).toBe(attempt);
        // Not due again until the backoff passes.
        expect(await processDue(now)).toBe(0);
        now = new Date(now.getTime() + backoffMinutes(attempt) * 60_000 + 1000);
      } else {
        expect(p.status).toBe("FAILED");
        expect(p.variants[0].error).toMatch(/forced failure/);
      }
    }
  });
});
