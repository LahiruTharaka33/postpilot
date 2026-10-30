import { execSync } from "child_process";

// Brings the test schema up to date. Tests delete data, so refuse anything but the test schema.
export default function setup() {
  const schema = new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema");
  if (schema !== "postpilot_test") throw new Error(`Tests must use the postpilot_test schema, not ${schema ?? "public"}`);
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: process.env });
}
