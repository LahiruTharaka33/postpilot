// Measures round-trip time of a trivial query, through the pooler and directly.
import { PrismaClient } from "@prisma/client";

async function measure(label: string, url: string | undefined) {
  const db = new PrismaClient({ datasourceUrl: url });
  await db.$queryRaw`select 1`;
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await db.$queryRaw`select 1`;
    times.push(Math.round(performance.now() - t));
  }
  console.log(`${label}: ${times.join(", ")} ms`);
  await db.$disconnect();
}

measure("pooled", process.env.DATABASE_URL).then(() => measure("direct", process.env.DIRECT_URL));
