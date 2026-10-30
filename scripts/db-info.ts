// Prints which schemas and tables exist in the database (read-only).
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });

async function main() {
  const rows = await db.$queryRaw<Array<{ table_schema: string; n: bigint }>>`
    select table_schema, count(*) as n from information_schema.tables
    where table_schema not in ('pg_catalog', 'information_schema') group by table_schema order by table_schema`;
  console.log(rows.length ? rows.map((r) => `${r.table_schema}: ${r.n} tables`).join("\n") : "No tables yet");
}

main().finally(() => db.$disconnect());
