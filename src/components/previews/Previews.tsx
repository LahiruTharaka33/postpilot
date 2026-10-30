"use client";

import { PLATFORM_RULES, type Platform } from "@/lib/platforms";
import { Caption, ICONS, Icon, MediaFrame, MediaGrid, MiniAvatar, aspectValue, type PreviewProps } from "./common";

const shell = "overflow-hidden rounded-xl border border-zinc-200 bg-white text-[14px] text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function FacebookPreview({ account, caption, media, options }: PreviewProps) {
  return (
    <div className={shell}>
      <div className="flex items-center gap-2.5 p-3">
        <MiniAvatar account={account} size={40} />
        <div className="leading-tight">
          <p className="font-semibold">{account.displayName}</p>
          <p className="flex items-center gap-1 text-xs text-zinc-500">Just now · <Icon d={ICONS.globe} className="h-3 w-3" /></p>
        </div>
        <Icon d={ICONS.more} className="ml-auto h-5 w-5 text-zinc-500" />
      </div>
      {caption && <Caption text={caption} limit={PLATFORM_RULES.FACEBOOK.previewTruncate} linkColor="#1877F2" moreLabel="See more" className="px-3 pb-3" />}
      <MediaGrid media={media} options={options} />
      {options.firstComment && (
        <div className="flex gap-2 border-t border-zinc-100 px-3 pt-2 text-[13px] dark:border-zinc-800">
          <MiniAvatar account={account} size={24} />
          <p className="rounded-2xl bg-zinc-100 px-3 py-1.5 dark:bg-zinc-800"><b>{account.displayName}</b> {options.firstComment}</p>
        </div>
      )}
      <div className="mx-3 mt-2 flex justify-around border-t border-zinc-200 py-1.5 text-[13px] font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        <span className="flex items-center gap-1.5"><Icon d={ICONS.like} className="h-4 w-4" />Like</span>
        <span className="flex items-center gap-1.5"><Icon d={ICONS.comment} className="h-4 w-4" />Comment</span>
        <span className="flex items-center gap-1.5"><Icon d={ICONS.share} className="h-4 w-4" />Share</span>
      </div>
    </div>
  );
}

export function InstagramPreview(props: PreviewProps) {
  const { account, caption, media, options } = props;
  if (options.igFormat === "REEL") return <VerticalVideoPreview {...props} platform="INSTAGRAM" />;
  const first = media[0];
  return (
    <div className={shell}>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[2px]">
          <span className="block rounded-full bg-white p-[2px] dark:bg-zinc-900"><MiniAvatar account={account} size={28} /></span>
        </span>
        <p className="font-semibold">{account.handle}</p>
        <Icon d={ICONS.more} className="ml-auto h-5 w-5" />
      </div>
      {first ? (
        <div className="relative">
          <MediaFrame media={first} aspect={aspectValue(options.aspect ?? "1:1", first)} options={options} />
          {media.length > 1 && <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">1/{media.length}</span>}
        </div>
      ) : (
        <div className="flex aspect-square items-center justify-center bg-zinc-100 text-sm text-zinc-400 dark:bg-zinc-800">Instagram needs an image or video</div>
      )}
      <div className="flex items-center gap-4 px-3 pt-2.5">
        <Icon d={ICONS.heart} className="h-6 w-6" />
        <Icon d={ICONS.comment} className="h-6 w-6" />
        <Icon d={ICONS.send} className="h-6 w-6" />
        {media.length > 1 && (
          <div className="mx-auto flex gap-1">
            {media.map((m, i) => <span key={m.id} className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-sky-500" : "bg-zinc-300"}`} />)}
          </div>
        )}
        <Icon d={ICONS.bookmark} className="ml-auto h-6 w-6" />
      </div>
      <div className="px-3 pb-3 pt-2">
        {caption && <Caption text={caption} limit={PLATFORM_RULES.INSTAGRAM.previewTruncate} linkColor="#00376B" prefix={<b className="mr-1">{account.handle}</b>} />}
        {options.firstComment && <p className="mt-1 text-zinc-500">View 1 comment</p>}
      </div>
    </div>
  );
}

/** Shared full-screen vertical layout for TikTok, YouTube Shorts and Instagram Reels. */
function VerticalVideoPreview({ account, caption, media, options, platform }: PreviewProps & { platform: Platform }) {
  const first = media[0];
  const rules = PLATFORM_RULES[platform];
  const rail = platform === "YOUTUBE" ? [ICONS.like, ICONS.comment, ICONS.share] : [ICONS.heart, ICONS.comment, ICONS.bookmark, ICONS.share];
  return (
    <div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-[28px] border-[6px] border-zinc-900 bg-black text-white shadow-lg">
      <div style={{ aspectRatio: 9 / 16 }} className="relative">
        {first ? (
          <MediaFrame media={first} aspect={9 / 16} options={options} autoPlay className="!absolute inset-0 h-full" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-zinc-400">{rules.label} needs a vertical video</div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
        <div className="absolute inset-x-0 top-3 text-center text-[13px] font-semibold">
          {platform === "TIKTOK" ? <span><span className="opacity-60">Following</span> &nbsp; For You</span> : platform === "YOUTUBE" ? "Shorts" : "Reels"}
        </div>
        <div className="absolute bottom-20 right-2 flex flex-col items-center gap-4">
          <span className="rounded-full border-2 border-white"><MiniAvatar account={account} size={36} /></span>
          {rail.map((d, i) => <Icon key={i} d={d} className="h-7 w-7 drop-shadow" />)}
        </div>
        <div className="absolute bottom-3 left-3 right-14 text-[13px] leading-snug">
          <p className="mb-1 flex items-center gap-2 font-semibold">
            @{account.handle}
            {platform === "YOUTUBE" && <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-black">Subscribe</span>}
          </p>
          {platform === "YOUTUBE" && options.title && <p className="mb-0.5 font-semibold">{options.title}</p>}
          {caption && <Caption text={caption} limit={rules.previewTruncate} linkColor="#fff" className="[&_span]:font-semibold" />}
          {platform !== "YOUTUBE" && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs opacity-90"><Icon d={ICONS.music} className="h-3.5 w-3.5" />Original sound · {account.displayName}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function TikTokPreview(props: PreviewProps) {
  return (
    <div>
      <VerticalVideoPreview {...props} platform="TIKTOK" />
      <p className="mt-2 text-center text-xs text-zinc-500">
        Visibility: {(props.options.privacy ?? "PUBLIC").toLowerCase()} · Comments {props.options.allowComments === false ? "off" : "on"} · Duet{" "}
        {props.options.allowDuet === false ? "off" : "on"}
      </p>
    </div>
  );
}

export function YouTubePreview(props: PreviewProps) {
  return (
    <div>
      <VerticalVideoPreview {...props} platform="YOUTUBE" />
      <p className="mt-2 text-center text-xs text-zinc-500">Visibility: {(props.options.privacy ?? "PUBLIC").toLowerCase()}</p>
    </div>
  );
}

export function XPreview({ account, caption, media, options }: PreviewProps) {
  const over = caption.length > PLATFORM_RULES.X.maxCaption;
  return (
    <div className={`${shell} flex gap-3 p-3`}>
      <MiniAvatar account={account} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate">
          <b>{account.displayName}</b> <span className="text-zinc-500">@{account.handle} · now</span>
        </p>
        {caption && (
          <p className="whitespace-pre-wrap break-words">
            <Caption as="span" text={caption.slice(0, 280)} limit={280} linkColor="#1D9BF0" />
            {over && <span className="bg-red-200 text-red-900">{caption.slice(280)}</span>}
          </p>
        )}
        {media.length > 0 && (
          <div className="mt-2">
            <MediaGrid media={media} options={options} rounded="rounded-2xl border border-zinc-200 dark:border-zinc-700" />
          </div>
        )}
        <div className="mt-2 flex justify-between pr-6 text-zinc-500">
          <Icon d={ICONS.comment} className="h-4 w-4" />
          <Icon d={ICONS.repost} className="h-4 w-4" />
          <Icon d={ICONS.heart} className="h-4 w-4" />
          <Icon d={ICONS.views} className="h-4 w-4" />
          <Icon d={ICONS.share} className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export function LinkedInPreview({ account, caption, media, options }: PreviewProps) {
  return (
    <div className={shell}>
      <div className="flex gap-2.5 p-3">
        <MiniAvatar account={account} size={44} />
        <div className="leading-tight">
          <p className="font-semibold">{account.displayName}</p>
          <p className="text-xs text-zinc-500">@{account.handle}</p>
          <p className="flex items-center gap-1 text-xs text-zinc-500">
            Now · {options.visibility === "CONNECTIONS" ? "Connections only" : <Icon d={ICONS.globe} className="h-3 w-3" />}
          </p>
        </div>
      </div>
      {caption && <Caption text={caption} limit={PLATFORM_RULES.LINKEDIN.previewTruncate} linkColor="#0A66C2" moreLabel="see more" className="px-3 pb-3" />}
      <MediaGrid media={media} options={options} />
      <div className="mx-3 mt-1 flex justify-around border-t border-zinc-200 py-2 text-[13px] font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        <span className="flex items-center gap-1.5"><Icon d={ICONS.like} className="h-4 w-4" />Like</span>
        <span className="flex items-center gap-1.5"><Icon d={ICONS.comment} className="h-4 w-4" />Comment</span>
        <span className="flex items-center gap-1.5"><Icon d={ICONS.repost} className="h-4 w-4" />Repost</span>
        <span className="flex items-center gap-1.5"><Icon d={ICONS.send} className="h-4 w-4" />Send</span>
      </div>
    </div>
  );
}

export const PREVIEWS: Record<Platform, (props: PreviewProps) => React.ReactElement> = {
  FACEBOOK: FacebookPreview,
  INSTAGRAM: InstagramPreview,
  TIKTOK: TikTokPreview,
  X: XPreview,
  LINKEDIN: LinkedInPreview,
  YOUTUBE: YouTubePreview,
};
