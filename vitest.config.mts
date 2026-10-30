import { readFileSync } from "fs";
import path from "path";
import { defineConfig } from "vitest/config";

// Tests run against their own schema in the same database, never "dev" or production ("public").
const TEST_SCHEMA = "postpilot_test";

function testUrl(name: string) {
  const line = readFileSync(path.resolve(__dirname, ".env"), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} is missing from .env`);
  const url = new URL(line.slice(name.length + 1).replace(/^"|"$/g, ""));
  url.searchParams.set("schema", TEST_SCHEMA);
  return url.toString();
}

const env = { DATABASE_URL: testUrl("DATABASE_URL"), DIRECT_URL: testUrl("DIRECT_URL"), MOCK_FAIL_RATE: "0" };
// Global setup runs in this process, test files in workers; both need the test URLs.
Object.assign(process.env, env);

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    globalSetup: "./tests/global-setup.ts",
    env,
    fileParallelism: false,
    // Generous: from far away, every query to the cloud database takes ~0.3s.
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
});
