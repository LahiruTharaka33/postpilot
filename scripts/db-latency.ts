// Measures round-trip time of a trivial query, through the pooler and directly.
// A slow first query (several seconds) means the database was asleep and had to wake up.
import { PrismaClient } from "@prisma/client";

async function measure(label: string, url: string | undefined) {
  const db = new PrismaClient({ datasourceUrl: url });
  const times: number[] = [];
  for (let i = 0; i < 6; i++) {
    const t = performance.now();
    await db.$queryRaw`select 1`;
    times.push(Math.round(performance.now() - t));
  }
  console.log(`${label}: ${times.join(", ")} ms`);
  await db.$disconnect();
}

measure("pooled", process.env.DATABASE_URL).then(() => measure("direct", process.env.DIRECT_URL));
