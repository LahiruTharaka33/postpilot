import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444"];

/** The seed wipes all data, so it only runs against a non-production schema such as "dev". */
function assertSafeTarget() {
  const schema = new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema");
  if (!schema || schema === "public") {
    console.error(`Refusing to seed: DATABASE_URL points at the ${schema ?? "public"} schema (production). Use a dev schema, e.g. ...&schema=dev`);
    process.exit(1);
  }
}

async function main() {
  assertSafeTarget();
  await db.activity.deleteMany();
  await db.postVariant.deleteMany();
  await db.post.deleteMany();
  await db.media.deleteMany();
  await db.socialAccount.deleteMany();
  await db.invite.deleteMany();
  await db.membership.deleteMany();
  await db.workspace.deleteMany();
  await db.user.deleteMany();

  // Demo logins (local development only): see README.md.
  const passwordHash = await bcrypt.hash("password123", 10);
  const owner = await db.user.create({ data: { name: "Demo Owner", email: "owner@demo.test", passwordHash } });
  const viewer = await db.user.create({ data: { name: "Demo Viewer", email: "viewer@demo.test", passwordHash } });

  const workspaces = [
    { name: "Sunrise Café", slug: "sunrise-cafe", handle: "sunrisecafe" },
    { name: "Peak Fitness", slug: "peak-fitness", handle: "peakfitness" },
  ];

  for (const [i, w] of workspaces.entries()) {
    const workspace = await db.workspace.create({ data: { name: w.name, slug: w.slug } });
    await db.membership.create({ data: { userId: owner.id, workspaceId: workspace.id, role: "OWNER" } });
    await db.membership.create({ data: { userId: viewer.id, workspaceId: workspace.id, role: "VIEWER" } });

    const platforms = ["FACEBOOK", "INSTAGRAM", "TIKTOK", "X", "LINKEDIN", "YOUTUBE"];
    const accounts = [];
    for (const [j, platform] of platforms.entries()) {
      accounts.push(
        await db.socialAccount.create({
          data: {
            workspaceId: workspace.id,
            platform,
            handle: w.handle,
            displayName: w.name,
            avatarColor: COLORS[(i + j) % COLORS.length],
            accessToken: `mock-token-${platform.toLowerCase()}-${w.handle}`,
          },
        }),
      );
    }

    const day = 24 * 60 * 60 * 1000;
    const at = (offsetDays: number, hour: number) => {
      const d = new Date(Date.now() + offsetDays * day);
      d.setHours(hour, 0, 0, 0);
      return d;
    };
    const textAccounts = accounts.filter((a) => ["FACEBOOK", "X", "LINKEDIN"].includes(a.platform));

    const samples = [
      { caption: `New week, new specials at ${w.name}! What should we feature next? #monday`, when: at(1, 9), status: "SCHEDULED" },
      { caption: `Thank you for 10k followers! 🎉 #community`, when: at(3, 12), status: "SCHEDULED" },
      { caption: `Behind the scenes with the team. #team`, when: at(-2, 15), status: "PUBLISHED" },
      { caption: `Draft idea: customer of the month spotlight`, when: null, status: "DRAFT" },
    ];
    for (const s of samples) {
      await db.post.create({
        data: {
          workspaceId: workspace.id,
          authorId: owner.id,
          baseCaption: s.caption,
          status: s.status,
          scheduledAt: s.when,
          timezone: "UTC",
          variants: {
            create: textAccounts.map((a) => ({
              accountId: a.id,
              scheduledAt: s.when,
              status: s.status,
              nextAttemptAt: s.status === "SCHEDULED" ? s.when : null,
              publishedAt: s.status === "PUBLISHED" ? s.when : null,
              externalUrl: s.status === "PUBLISHED" ? `https://example.com/${a.platform.toLowerCase()}/demo` : null,
            })),
          },
        },
      });
    }
    await db.activity.create({ data: { workspaceId: workspace.id, userId: owner.id, message: `Created workspace ${w.name}` } });
  }
  console.log("Seeded. Log in as owner@demo.test / password123 (or viewer@demo.test).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
