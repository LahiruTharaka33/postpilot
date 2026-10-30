"use client";

import { useState } from "react";
import { ASPECT_RATIOS, type Aspect, type PlatformOptions } from "@/lib/platforms";

export interface PreviewMedia {
  id: string;
  url: string;
  type: "IMAGE" | "VIDEO";
  width: number;
  height: number;
}

export interface PreviewProps {
  account: { displayName: string; handle: string; avatarColor: string };
  caption: string;
  media: PreviewMedia[];
  options: PlatformOptions;
}

export function aspectValue(aspect: Aspect | undefined, media?: PreviewMedia) {
  if (!aspect || aspect === "original") return media && media.width && media.height ? media.width / media.height : 1;
  return ASPECT_RATIOS[aspect];
}

/** Shows one image or video cropped to the chosen aspect ratio around the focal point. */
export function MediaFrame({
  media,
  aspect,
  options,
  className = "",
  autoPlay = false,
}: {
  media: PreviewMedia;
  aspect: number;
  options: PlatformOptions;
  className?: string;
  autoPlay?: boolean;
}) {
  const style = { objectPosition: `${options.focalX ?? 50}% ${options.focalY ?? 50}%` };
  return (
    <div className={`relative w-full overflow-hidden bg-zinc-200 dark:bg-zinc-800 ${className}`} style={aspect ? { aspectRatio: aspect } : undefined}>
      {media.type === "VIDEO" ? (
        <video src={media.url} className="absolute inset-0 h-full w-full object-cover" style={style} muted loop playsInline autoPlay={autoPlay} controls={!autoPlay} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.url} alt="" className="absolute inset-0 h-full w-full object-cover" style={style} />
      )}
    </div>
  );
}

/** Grid of up to 4 items with a "+N" overlay, like Facebook / X / LinkedIn. */
export function MediaGrid({ media, options, aspect, rounded = "" }: { media: PreviewMedia[]; options: PlatformOptions; aspect?: number; rounded?: string }) {
  if (media.length === 0) return null;
  if (media.length === 1) return <MediaFrame media={media[0]} aspect={aspect ?? aspectValue(options.aspect, media[0])} options={options} className={rounded} />;
  const shown = media.slice(0, 4);
  return (
    <div className={`grid gap-0.5 overflow-hidden ${rounded} ${shown.length === 2 ? "grid-cols-2" : "grid-cols-2 grid-rows-2"}`} style={{ aspectRatio: shown.length === 2 ? 2 / 1.2 : 1 }}>
      {shown.map((m, i) => (
        <div key={m.id} className={`relative ${shown.length === 3 && i === 0 ? "row-span-2" : ""}`}>
          <MediaFrame media={m} aspect={0} options={options} className="h-full" />
          {i === 3 && media.length > 4 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-2xl font-semibold text-white">+{media.length - 4}</div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Caption with highlighted #hashtags / @mentions and a "...more" toggle after `limit` characters. */
export function Caption({
  text,
  limit,
  linkColor,
  moreLabel = "more",
  prefix,
  className = "",
  as: Tag = "p",
}: {
  text: string;
  limit: number;
  linkColor: string;
  moreLabel?: string;
  prefix?: React.ReactNode;
  className?: string;
  as?: "p" | "span";
}) {
  const [expanded, setExpanded] = useState(false);
  const cut = !expanded && text.length > limit;
  const shown = cut ? text.slice(0, limit).trimEnd() : text;
  return (
    <Tag className={`whitespace-pre-wrap break-words ${className}`}>
      {prefix}
      {shown.split(/(\s+)/).map((part, i) =>
        /^[#@][\p{L}\p{N}_.]+/u.test(part) ? (
          <span key={i} style={{ color: linkColor }}>{part}</span>
        ) : (
          part
        ),
      )}
      {cut && (
        <>
          …{" "}
          <button type="button" className="font-medium opacity-60 hover:underline" onClick={() => setExpanded(true)}>
            {moreLabel}
          </button>
        </>
      )}
    </Tag>
  );
}

export function MiniAvatar({ account, size = 36 }: { account: PreviewProps["account"]; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ background: account.avatarColor, width: size, height: size, fontSize: size * 0.4 }}
    >
      {account.displayName.charAt(0).toUpperCase()}
    </span>
  );
}

export function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export const ICONS = {
  like: "M7 10v11H3V10h4zm0 0l4-8a3 3 0 013 3v4h5.5a2 2 0 012 2.3l-1.4 8A2 2 0 0118.1 21H7",
  heart: "M12 21s-7.5-4.6-9.5-9.3C1.1 8.3 3.2 4.5 7 4.5c2.1 0 3.6 1.1 5 3 1.4-1.9 2.9-3 5-3 3.8 0 5.9 3.8 4.5 7.2C19.5 16.4 12 21 12 21z",
  comment: "M21 12a8 8 0 01-11.8 7L4 20l1.1-4.6A8 8 0 1121 12z",
  share: "M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v14",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
  bookmark: "M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z",
  repost: "M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3",
  views: "M3 20V10M9 20V4M15 20v-8M21 20V8",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  music: "M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zm12-2a3 3 0 11-6 0 3 3 0 016 0z",
  globe: "M12 22a10 10 0 100-20 10 10 0 000 20zM2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20",
};
