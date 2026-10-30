export const PLATFORMS = ["FACEBOOK", "INSTAGRAM", "TIKTOK", "X", "LINKEDIN", "YOUTUBE"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type Aspect = "1:1" | "4:5" | "9:16" | "16:9" | "1.91:1" | "original";

export const ASPECT_RATIOS: Record<Exclude<Aspect, "original">, number> = {
  "1:1": 1,
  "4:5": 4 / 5,
  "9:16": 9 / 16,
  "16:9": 16 / 9,
  "1.91:1": 1.91,
};

export interface PlatformRules {
  label: string;
  color: string; // brand-ish accent used for chips and badges
  maxCaption: number;
  maxHashtags?: number;
  textOnlyAllowed: boolean;
  requiresVideo: boolean;
  maxMedia: number;
  allowMixedMedia: boolean;
  imageAspects: Aspect[]; // first entry is the default crop
  videoAspects: Aspect[];
  maxVideoSeconds?: number;
  minVideoSeconds?: number;
  maxImageMB: number;
  maxVideoMB: number;
  previewTruncate: number; // characters shown before "...more" in the feed
  options: Array<keyof PlatformOptions>;
}

/** Per-variant settings the composer can set. Stored as JSON on PostVariant.options. */
export interface PlatformOptions {
  aspect?: Aspect;
  focalX?: number; // 0-100, crop focus point
  focalY?: number;
  title?: string; // YouTube
  privacy?: "PUBLIC" | "FRIENDS" | "PRIVATE"; // TikTok / YouTube
  allowComments?: boolean; // TikTok
  allowDuet?: boolean; // TikTok
  visibility?: "PUBLIC" | "CONNECTIONS"; // LinkedIn
  firstComment?: string; // Facebook, Instagram, LinkedIn
  igFormat?: "FEED" | "REEL"; // Instagram
  mediaIds?: string[]; // subset of the post's media for this network; unset = all
}

export const PLATFORM_RULES: Record<Platform, PlatformRules> = {
  FACEBOOK: {
    label: "Facebook",
    color: "#1877F2",
    maxCaption: 63206,
    textOnlyAllowed: true,
    requiresVideo: false,
    maxMedia: 10,
    allowMixedMedia: true,
    imageAspects: ["original", "1:1", "4:5", "16:9"],
    videoAspects: ["original", "16:9", "1:1", "4:5", "9:16"],
    maxVideoSeconds: 240 * 60,
    maxImageMB: 10,
    maxVideoMB: 1024,
    previewTruncate: 250,
    options: ["aspect", "firstComment"],
  },
  INSTAGRAM: {
    label: "Instagram",
    color: "#E1306C",
    maxCaption: 2200,
    maxHashtags: 30,
    textOnlyAllowed: false,
    requiresVideo: false,
    maxMedia: 10,
    allowMixedMedia: true,
    imageAspects: ["1:1", "4:5", "1.91:1"],
    videoAspects: ["9:16", "4:5", "1:1"],
    maxVideoSeconds: 15 * 60,
    minVideoSeconds: 3,
    maxImageMB: 8,
    maxVideoMB: 300,
    previewTruncate: 125,
    options: ["igFormat", "aspect", "firstComment"],
  },
  TIKTOK: {
    label: "TikTok",
    color: "#000000",
    maxCaption: 2200,
    textOnlyAllowed: false,
    requiresVideo: true,
    maxMedia: 1,
    allowMixedMedia: false,
    imageAspects: ["9:16"],
    videoAspects: ["9:16"],
    maxVideoSeconds: 10 * 60,
    minVideoSeconds: 3,
    maxImageMB: 20,
    maxVideoMB: 287,
    previewTruncate: 100,
    options: ["privacy", "allowComments", "allowDuet"],
  },
  X: {
    label: "X",
    color: "#0F1419",
    maxCaption: 280,
    textOnlyAllowed: true,
    requiresVideo: false,
    maxMedia: 4,
    allowMixedMedia: false,
    imageAspects: ["16:9", "1:1", "original"],
    videoAspects: ["16:9", "1:1", "original"],
    maxVideoSeconds: 140,
    maxImageMB: 5,
    maxVideoMB: 512,
    previewTruncate: 280,
    options: ["aspect"],
  },
  LINKEDIN: {
    label: "LinkedIn",
    color: "#0A66C2",
    maxCaption: 3000,
    textOnlyAllowed: true,
    requiresVideo: false,
    maxMedia: 9,
    allowMixedMedia: false,
    imageAspects: ["1.91:1", "1:1", "4:5", "original"],
    videoAspects: ["16:9", "1:1", "9:16"],
    maxVideoSeconds: 15 * 60,
    minVideoSeconds: 3,
    maxImageMB: 8,
    maxVideoMB: 5120,
    previewTruncate: 210,
    options: ["visibility", "aspect", "firstComment"],
  },
  YOUTUBE: {
    label: "YouTube Shorts",
    color: "#FF0000",
    maxCaption: 5000,
    textOnlyAllowed: false,
    requiresVideo: true,
    maxMedia: 1,
    allowMixedMedia: false,
    imageAspects: ["9:16"],
    videoAspects: ["9:16"],
    maxVideoSeconds: 180,
    maxImageMB: 2,
    maxVideoMB: 2048,
    previewTruncate: 100,
    options: ["title", "privacy"],
  },
};

export function parseOptions(json: string | null | undefined): PlatformOptions {
  try {
    return json ? (JSON.parse(json) as PlatformOptions) : {};
  } catch {
    return {};
  }
}

export function defaultAspect(platform: Platform, firstMediaType?: "IMAGE" | "VIDEO"): Aspect {
  const rules = PLATFORM_RULES[platform];
  return (firstMediaType === "VIDEO" ? rules.videoAspects : rules.imageAspects)[0];
}

export function countHashtags(text: string) {
  return (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
}
