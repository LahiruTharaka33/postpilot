"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { addDays, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { reschedulePost } from "@/app/actions/posts";
import { PLATFORMS, PLATFORM_RULES, type Platform } from "@/lib/platforms";
import { STATUS_STYLES } from "@/lib/constants";
import { PlatformIcon } from "./ui";

/**
 * One chip on the calendar: a post, or the networks of a post that share one time
 * (a post scheduled at different times per network shows one chip per time).
 */
export interface CalendarPost {
  key: string;
  postId: string;
  variantIds: string[];
  /** True when the post has other networks at other times. */
  split: boolean;
  caption: string;
  status: string;
  scheduledAt: string | null;
  accounts: Array<{ id: string; platform: Platform; handle: string }>;
}

interface Props {
  slug: string;
  view: "month" | "week";
  anchor: string;
  posts: CalendarPost[];
  drafts: CalendarPost[];
  accounts: Array<{ id: string; platform: Platform; handle: string }>;
  canEdit: boolean;
  highlight?: string;
  prevDate: string;
  nextDate: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

export function CalendarView({ slug, view, anchor, posts, drafts, accounts, canEdit, highlight, prevDate, nextDate }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<Platform[]>([]);
  const [accountFilter, setAccountFilter] = useState("");
  // Optimistic positions while a drag is being saved.
  const [moved, setMoved] = useState<Record<string, string>>({});
  const anchorDate = new Date(anchor);
  const today = new Date();

  const visible = useMemo(() => {
    const match = (p: CalendarPost) =>
      (platformFilter.length === 0 || p.accounts.some((a) => platformFilter.includes(a.platform))) &&
      (!accountFilter || p.accounts.some((a) => a.id === accountFilter));
    return {
      posts: posts.filter(match).map((p) => ({ ...p, scheduledAt: moved[p.key] ?? p.scheduledAt })),
      drafts: drafts.filter(match).filter((p) => !moved[p.key]),
    };
  }, [posts, drafts, platformFilter, accountFilter, moved]);

  const days = useMemo(() => {
    const first = view === "month" ? startOfWeek(startOfMonth(anchorDate)) : startOfWeek(anchorDate);
    const last = view === "month" ? endOfWeek(endOfMonth(anchorDate)) : endOfWeek(anchorDate);
    const out: Date[] = [];
    for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, view]);

  function postsOn(day: Date, hour?: number) {
    return visible.posts
      .filter((p) => p.scheduledAt && isSameDay(new Date(p.scheduledAt), day) && (hour === undefined || new Date(p.scheduledAt).getHours() === hour))
      .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
  }

  function drop(key: string, day: Date, hour?: number) {
    const post = [...posts, ...drafts].find((p) => p.key === key);
    if (!post) return;
    const original = post.scheduledAt ? new Date(post.scheduledAt) : null;
    const target = new Date(day);
    target.setHours(hour ?? original?.getHours() ?? 9, hour === undefined ? original?.getMinutes() ?? 0 : 0, 0, 0);
    if (original && target.getTime() === original.getTime()) return;
    if (post.status === "SCHEDULED" && target.getTime() < Date.now()) {
      setError("Scheduled posts can't be moved into the past.");
      return;
    }
    setError(null);
    setMoved((m) => ({ ...m, [key]: target.toISOString() }));
    start(async () => {
      try {
        // Only the networks on this chip move; other times of the same post stay put.
        await reschedulePost(slug, post.postId, target.toISOString(), post.variantIds);
        router.refresh();
      } catch (e) {
        setMoved((m) => {
          const next = { ...m };
          delete next[key];
          return next;
        });
        setError(e instanceof Error ? e.message : "Couldn't move that post");
      }
    });
  }

  const dropProps = (day: Date, hour?: number) =>
    canEdit
      ? {
          onDragOver: (e: React.DragEvent) => e.preventDefault(),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            drop(e.dataTransfer.getData("text/calendar-key"), day, hour);
          },
        }
      : {};

  const chip = (p: CalendarPost, compact = false) => {
    const draggable = canEdit && ["SCHEDULED", "DRAFT"].includes(p.status);
    const platforms = Array.from(new Set(p.accounts.map((a) => a.platform)));
    return (
      <Link
        key={p.key}
        href={`/w/${slug}/compose?post=${p.postId}`}
        draggable={draggable}
        onDragStart={(e) => e.dataTransfer.setData("text/calendar-key", p.key)}
        onClick={(e) => e.stopPropagation()}
        className={`block rounded-md border px-1.5 py-1 text-xs transition hover:shadow ${STATUS_STYLES[p.status]} ${
          highlight === p.postId ? "ring-2 ring-indigo-500" : "border-transparent"
        } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
        title={`${p.status.toLowerCase()}${p.split ? " · this post goes out at different times per network" : ""} — ${p.caption}`}
      >
        <div className="flex items-center gap-1">
          {p.scheduledAt && <span className="shrink-0 font-medium tabular-nums">{format(new Date(p.scheduledAt), "HH:mm")}</span>}
          <span className="flex shrink-0 -space-x-0.5">
            {platforms.map((pl) => <PlatformIcon key={pl} platform={pl} size={12} />)}
          </span>
          {p.split && <span className="shrink-0 opacity-60" aria-label="Part of a post with several times">⧉</span>}
          {!compact && <span className="truncate">{p.caption || "(media only)"}</span>}
        </div>
        {compact && <p className="mt-0.5 truncate">{p.caption || "(media only)"}</p>}
      </Link>
    );
  };

  const nav = (date: string, v = view) => `/w/${slug}/calendar?view=${v}&date=${date}`;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link className="btn-secondary px-2.5" href={nav(prevDate)} aria-label="Previous">‹</Link>
          <Link className="btn-secondary" href={nav(dayKey(today))}>Today</Link>
          <Link className="btn-secondary px-2.5" href={nav(nextDate)} aria-label="Next">›</Link>
          <h2 className="ml-2 text-lg font-semibold">
            {view === "month" ? format(anchorDate, "MMMM yyyy") : `${format(days[0], "MMM d")} – ${format(days[days.length - 1], "MMM d, yyyy")}`}
          </h2>
          {pending && <span className="text-sm text-zinc-500">Saving…</span>}
          <div className="ml-auto flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700">
            {(["month", "week"] as const).map((v) => (
              <Link key={v} href={nav(dayKey(anchorDate), v)} className={`rounded-md px-3 py-1 text-sm capitalize ${view === v ? "bg-indigo-600 text-white" : ""}`}>
                {v}
              </Link>
            ))}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {PLATFORMS.map((p) => {
            const on = platformFilter.includes(p);
            return (
              <button
                key={p}
                onClick={() => setPlatformFilter((f) => (on ? f.filter((x) => x !== p) : [...f, p]))}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${on ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950" : "border-zinc-200 dark:border-zinc-700"}`}
                aria-pressed={on}
              >
                <PlatformIcon platform={p} size={14} />
                {PLATFORM_RULES[p].label}
              </button>
            );
          })}
          <select className="input ml-auto w-auto py-1 text-xs" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} aria-label="Filter by account">
            <option value="">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{PLATFORM_RULES[a.platform].label} @{a.handle}</option>)}
          </select>
        </div>
        {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

        {view === "month" ? (
          <div className="card overflow-x-auto">
            <div className="grid min-w-[700px] grid-cols-7">
              {days.slice(0, 7).map((d) => (
                <div key={d.toISOString()} className="border-b border-zinc-200 px-2 py-2 text-xs font-medium text-zinc-500 dark:border-zinc-800">{format(d, "EEE")}</div>
              ))}
              {days.map((d) => {
                const isPast = d < startOfDay(today);
                return (
                  <div
                    key={d.toISOString()}
                    {...dropProps(d)}
                    onClick={() => canEdit && !isPast && router.push(`/w/${slug}/compose?date=${dayKey(d)}`)}
                    className={`group min-h-28 border-b border-r border-zinc-100 p-1.5 dark:border-zinc-800 ${isSameMonth(d, anchorDate) ? "" : "bg-zinc-50 dark:bg-zinc-950/50"} ${
                      canEdit && !isPast ? "cursor-pointer hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30" : ""
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isSameDay(d, today) ? "bg-indigo-600 font-semibold text-white" : isSameMonth(d, anchorDate) ? "" : "text-zinc-400"}`}>
                        {format(d, "d")}
                      </span>
                      {canEdit && !isPast && <span className="text-xs text-indigo-500 opacity-0 group-hover:opacity-100">+</span>}
                    </div>
                    <div className="space-y-1">{postsOn(d).map((p) => chip(p))}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="card max-h-[70vh] overflow-auto">
            <div className="grid min-w-[800px] grid-cols-[56px_repeat(7,1fr)]">
              <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />
              {days.map((d) => (
                <div key={d.toISOString()} className={`sticky top-0 z-10 border-b border-zinc-200 bg-white px-2 py-2 text-xs font-medium dark:border-zinc-800 dark:bg-zinc-900 ${isSameDay(d, today) ? "text-indigo-600" : "text-zinc-500"}`}>
                  {format(d, "EEE d")}
                </div>
              ))}
              {HOURS.map((h) => (
                <div key={h} className="contents">
                  <div className="border-b border-zinc-100 px-2 py-1 text-right text-[11px] text-zinc-400 dark:border-zinc-800">{String(h).padStart(2, "0")}:00</div>
                  {days.map((d) => (
                    <div key={d.toISOString() + h} {...dropProps(d, h)} className="min-h-12 space-y-1 border-b border-l border-zinc-100 p-1 dark:border-zinc-800">
                      {postsOn(d, h).map((p) => chip(p, true))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <aside>
        <h3 className="mb-2 font-semibold">Unscheduled drafts</h3>
        <p className="mb-3 text-xs text-zinc-500">{canEdit ? "Drag a draft onto a day to give it a date. It stays a draft until you schedule it." : "Drafts without a date."}</p>
        <div className="space-y-1.5">
          {visible.drafts.length === 0 && <p className="text-sm text-zinc-400">None</p>}
          {visible.drafts.map((p) => chip(p, true))}
        </div>
      </aside>
    </div>
  );
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
