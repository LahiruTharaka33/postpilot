import { ASPECT_RATIOS, PLATFORM_RULES, countHashtags, type Platform, type PlatformOptions } from "./platforms";

export interface MediaInfo {
  type: "IMAGE" | "VIDEO";
  width: number;
  height: number;
  duration?: number | null;
  size: number;
}

export interface VariantInput {
  caption: string;
  media: MediaInfo[];
  options: PlatformOptions;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const MB = 1024 * 1024;

/** Checks a post version against one platform's rules. Errors block publishing; warnings don't. */
export function validateVariant(platform: Platform, input: VariantInput): ValidationResult {
  const rules = PLATFORM_RULES[platform];
  const errors: string[] = [];
  const warnings: string[] = [];
  const { caption, media, options } = input;
  const videos = media.filter((m) => m.type === "VIDEO");
  const images = media.filter((m) => m.type === "IMAGE");

  if (caption.length > rules.maxCaption) {
    errors.push(`Caption is ${caption.length}/${rules.maxCaption} characters`);
  }
  if (rules.maxHashtags && countHashtags(caption) > rules.maxHashtags) {
    errors.push(`Too many hashtags (${countHashtags(caption)}/${rules.maxHashtags})`);
  }
  if (!caption.trim() && media.length === 0) {
    errors.push("Add a caption or media");
  }
  if (!rules.textOnlyAllowed && media.length === 0) {
    errors.push(rules.requiresVideo ? `${rules.label} needs a video` : `${rules.label} needs at least 1 image or video`);
  }
  if (rules.requiresVideo && media.length > 0 && videos.length === 0) {
    errors.push(`${rules.label} needs a video, not an image`);
  }
  if (media.length > rules.maxMedia) {
    errors.push(`${rules.label} allows up to ${rules.maxMedia} media item${rules.maxMedia > 1 ? "s" : ""} (you have ${media.length})`);
  }
  if (!rules.allowMixedMedia && videos.length > 0 && images.length > 0) {
    errors.push(`${rules.label} can't mix images and videos in one post`);
  }
  if (platform === "X" && videos.length > 1) {
    errors.push("X allows only 1 video per post");
  }

  for (const m of media) {
    const limit = m.type === "VIDEO" ? rules.maxVideoMB : rules.maxImageMB;
    if (m.size > limit * MB) {
      errors.push(`A ${m.type.toLowerCase()} is ${(m.size / MB).toFixed(1)} MB; ${rules.label} limit is ${limit} MB`);
    }
    if (m.type === "VIDEO" && m.duration != null) {
      if (rules.maxVideoSeconds && m.duration > rules.maxVideoSeconds) {
        errors.push(`Video is ${Math.round(m.duration)}s; ${rules.label} limit is ${rules.maxVideoSeconds}s`);
      }
      if (rules.minVideoSeconds && m.duration < rules.minVideoSeconds) {
        errors.push(`Video must be at least ${rules.minVideoSeconds}s on ${rules.label}`);
      }
    }
  }

  // Aspect ratio: the chosen crop must be allowed, and a big mismatch with the source gets a warning.
  const first = media[0];
  if (first) {
    const allowed = first.type === "VIDEO" ? rules.videoAspects : rules.imageAspects;
    const aspect = options.aspect ?? allowed[0];
    if (!allowed.includes(aspect)) {
      errors.push(`${aspect} isn't supported on ${rules.label}; use ${allowed.join(", ")}`);
    } else if (aspect !== "original" && first.width && first.height) {
      const source = first.width / first.height;
      const target = ASPECT_RATIOS[aspect];
      if (Math.abs(source - target) / target > 0.15) {
        warnings.push(`Media will be cropped to ${aspect}; check the focal point`);
      }
    }
  }

  if (platform === "YOUTUBE") {
    if (!options.title?.trim()) errors.push("YouTube Shorts needs a title");
    else if (options.title.length > 100) errors.push(`Title is ${options.title.length}/100 characters`);
  }
  if (platform === "INSTAGRAM" && options.igFormat === "REEL" && videos.length === 0) {
    errors.push("Instagram Reels need a video");
  }
  if (caption.length > rules.previewTruncate && rules.previewTruncate < rules.maxCaption) {
    warnings.push(`Only the first ${rules.previewTruncate} characters show before "...more"`);
  }

  return { errors, warnings };
}
