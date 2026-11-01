import { describe, expect, it } from "vitest";
import { presignUpload, publicUrl, workspacePrefix, type R2Config } from "@/lib/r2";

const config: R2Config = {
  endpoint: "https://account.r2.cloudflarestorage.com",
  bucket: "bucket",
  accessKeyId: "test-key",
  secretAccessKey: "test-secret",
  publicUrl: "https://media.example.com",
  prefix: "dev/",
};

describe("R2 uploads", () => {
  it("signs the file's type and size so a different file can't be sent", async () => {
    const url = new URL(await presignUpload(config, "dev/ws/file.png", "image/png", 123));
    expect(url.hostname).toContain("r2.cloudflarestorage.com");
    expect(url.pathname).toContain("dev/ws/file.png");
    const signed = url.searchParams.get("X-Amz-SignedHeaders") ?? "";
    expect(signed).toContain("content-type");
    expect(signed).toContain("content-length");
    expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false);
  });

  it("keeps workspaces and environments apart", () => {
    expect(workspacePrefix(config, "ws1")).toBe("dev/ws1/");
    expect(publicUrl(config, "dev/ws1/a.png")).toBe("https://media.example.com/dev/ws1/a.png");
  });
});
