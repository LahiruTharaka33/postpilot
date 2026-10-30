import { describe, expect, it } from "vitest";
import { validateVariant, type MediaInfo } from "@/lib/validation";

const image: MediaInfo = { type: "IMAGE", width: 1080, height: 1080, size: 500_000 };
const vertical: MediaInfo = { type: "VIDEO", width: 1080, height: 1920, duration: 30, size: 20_000_000 };
const landscape: MediaInfo = { type: "VIDEO", width: 1920, height: 1080, duration: 30, size: 20_000_000 };

describe("validateVariant", () => {
  it("accepts a text-only post on Facebook, X and LinkedIn", () => {
    for (const p of ["FACEBOOK", "X", "LINKEDIN"] as const) {
      expect(validateVariant(p, { caption: "Hello", media: [], options: {} }).errors).toEqual([]);
    }
  });

  it("enforces X's 280 character limit", () => {
    const { errors } = validateVariant("X", { caption: "a".repeat(312), media: [], options: {} });
    expect(errors).toContain("Caption is 312/280 characters");
  });

  it("requires media on Instagram", () => {
    const { errors } = validateVariant("INSTAGRAM", { caption: "Hi", media: [], options: {} });
    expect(errors).toContain("Instagram needs at least 1 image or video");
  });

  it("requires a video on TikTok and YouTube", () => {
    expect(validateVariant("TIKTOK", { caption: "Hi", media: [image], options: {} }).errors).toContain("TikTok needs a video, not an image");
    expect(validateVariant("TIKTOK", { caption: "Hi", media: [vertical], options: {} }).errors).toEqual([]);
  });

  it("needs a YouTube title", () => {
    expect(validateVariant("YOUTUBE", { caption: "", media: [vertical], options: {} }).errors).toContain("YouTube Shorts needs a title");
    expect(validateVariant("YOUTUBE", { caption: "", media: [vertical], options: { title: "My short" } }).errors).toEqual([]);
  });

  it("warns when the crop differs a lot from the source", () => {
    const { errors, warnings } = validateVariant("TIKTOK", { caption: "", media: [landscape], options: {} });
    expect(errors).toEqual([]);
    expect(warnings).toContain("Media will be cropped to 9:16; check the focal point");
  });

  it("rejects crops a platform doesn't support", () => {
    const { errors } = validateVariant("INSTAGRAM", { caption: "", media: [image], options: { aspect: "16:9" } });
    expect(errors[0]).toMatch(/16:9 isn't supported on Instagram/);
  });

  it("limits Instagram hashtags to 30", () => {
    const caption = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ");
    expect(validateVariant("INSTAGRAM", { caption, media: [image], options: {} }).errors).toContain("Too many hashtags (31/30)");
  });

  it("limits media count and mixing", () => {
    expect(validateVariant("X", { caption: "", media: [image, image, image, image, image], options: {} }).errors[0]).toMatch(/up to 4/);
    expect(validateVariant("X", { caption: "", media: [image, landscape], options: {} }).errors).toContain("X can't mix images and videos in one post");
  });
});
