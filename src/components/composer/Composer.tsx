"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { savePost, duplicatePost, retryPost } from "@/app/actions/posts";
import { PLATFORMS, PLATFORM_RULES, defaultAspect, type Aspect, type Platform, type PlatformOptions } from "@/lib/platforms";
import { validateVariant, type ValidationResult } from "@/lib/validation";
import { COMMON_TIMEZONES, utcToZonedInput, zonedTimeToUtc } from "@/lib/time";
import { PREVIEWS } from "@/components/previews/Previews";
import { PlatformIcon, StatusBadge } from "@/components/ui";
import { MediaUploader, type ComposerMedia } from "./MediaUploader";

export interface ComposerAccount {
  id: string;
  platform: Platform;
  handle: string;
  displayName: string;
  avatarColor: string;
  status: string;
}

export interface ComposerInitial {
  postId: string;
  baseCaption: string;
  media: ComposerMedia[];
  scheduledAt: string | null;
  timezone: string;
  status: string;
  variants: Array<{
    accountId: string;
    caption: string | null;
    options: PlatformOptions;
    scheduledAt: string | null;
    status: string;
    externalUrl: string | null;
    error: string | null;
  }>;
}

interface Props {
  slug: string;
  accounts: ComposerAccount[];
  initial?: ComposerInitial;
  defaultDate?: string;
  suggestedHashtags: string[];
  canEdit: boolean;
}

/** Per-platform customisation. `caption: null` means "use the main caption". */
type Custom = Record<Platform, { caption: string | null; options: PlatformOptions }>;

const EMOJIS = ["😀", "😍", "🔥", "🎉", "✨", "👏", "🙌", "💯", "❤️", "👉", "📣", "🚀", "☕", "🍰", "💪", "🌟", "✅", "📅", "🎁", "😎", "🤩", "🙏", "📸", "🎥"];

const ASPECT_LABELS: Record<Aspect, string> = {
  original: "Original",
  "1:1": "Square 1:1",
  "4:5": "Portrait 4:5",
  "9:16": "Vertical 9:16",
  "16:9": "Landscape 16:9",
  "1.91:1": "Wide 1.91:1",
};

function emptyCustom(): Custom {
  return Object.fromEntries(PLATFORMS.map((p) => [p, { caption: null, options: {} }])) as Custom;
}

function nextHour() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d;
}

export function Composer({ slug, accounts, initial, defaultDate, suggestedHashtags, canEdit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const browserTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  // Once any network has gone out the post can't be edited (the rest can still be moved on the calendar).
  const locked =
    !!initial &&
    (["PUBLISHING", "PUBLISHED", "PARTIAL"].includes(initial.status) ||
      initial.variants.some((v) => ["PUBLISHING", "PUBLISHED"].includes(v.status)));
  const readOnly = locked || !canEdit;

  const [selected, setSelected] = useState<string[]>(() => initial?.variants.map((v) => v.accountId) ?? []);
  const [caption, setCaption] = useState(initial?.baseCaption ?? "");
  const [media, setMedia] = useState<ComposerMedia[]>(initial?.media ?? []);
  const [custom, setCustom] = useState<Custom>(() => {
    const c = emptyCustom();
    for (const v of initial?.variants ?? []) {
      const acc = accounts.find((a) => a.id === v.accountId);
      if (acc) c[acc.platform] = { caption: v.caption, options: v.options };
    }
    return c;
  });
  const [tab, setTab] = useState<"ALL" | Platform>("ALL");
  const [previewTab, setPreviewTab] = useState<Platform | null>(null);
  const [timezone, setTimezone] = useState(initial?.timezone ?? browserTz);
  const [when, setWhen] = useState("");
  // Optional per-network times (wall-clock strings in `timezone`); a missing entry uses `when`.
  const [perNetwork, setPerNetwork] = useState(false);
  const [times, setTimes] = useState<Partial<Record<Platform, string>>>({});
  const [result, setResult] = useState<{ error: string; details?: string[] } | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Set the initial date in the browser so it uses the viewer's time zone.
  useEffect(() => {
    if (initial?.scheduledAt) setWhen(utcToZonedInput(new Date(initial.scheduledAt), initial.timezone));
    else if (defaultDate) setWhen(`${defaultDate}T09:00`);
    else setWhen(utcToZonedInput(nextHour(), browserTz));

    if (initial) {
      const loaded: Partial<Record<Platform, string>> = {};
      for (const v of initial.variants) {
        const acc = accounts.find((a) => a.id === v.accountId);
        if (acc && v.scheduledAt && !loaded[acc.platform]) loaded[acc.platform] = utcToZonedInput(new Date(v.scheduledAt), initial.timezone);
      }
      if (new Set(Object.values(loaded)).size > 1) {
        setPerNetwork(true);
        setTimes(loaded);
      }
    }
  }, [initial, defaultDate, browserTz, accounts]);

  const selectedAccounts = accounts.filter((a) => selected.includes(a.id));
  const platforms = PLATFORMS.filter((p) => selectedAccounts.some((a) => a.platform === p));
  const activePreview = previewTab && platforms.includes(previewTab) ? previewTab : tab !== "ALL" && platforms.includes(tab) ? tab : platforms[0];

  const captionFor = (p: Platform) => custom[p].caption ?? caption;
  // Each network can use a subset of the uploaded media (e.g. the photo for Instagram, the video for TikTok).
  const mediaFor = (p: Platform) => {
    const ids = custom[p].options.mediaIds;
    return ids ? media.filter((m) => ids.includes(m.id)) : media;
  };
  const optionsFor = (p: Platform): PlatformOptions => ({
    aspect: defaultAspect(p, mediaFor(p)[0]?.type),
    ...(p === "TIKTOK" ? { privacy: "PUBLIC", allowComments: true, allowDuet: true } : {}),
    ...(p === "YOUTUBE" ? { privacy: "PUBLIC" } : {}),
    ...(p === "INSTAGRAM" ? { igFormat: "FEED" } : {}),
    // Unset values fall back to the defaults above.
    ...Object.fromEntries(Object.entries(custom[p].options).filter(([, v]) => v !== undefined)),
    ...(custom[p].options.mediaIds ? { mediaIds: mediaFor(p).map((m) => m.id) } : {}),
  });

  const validation = useMemo(() => {
    const out = {} as Record<Platform, ValidationResult>;
    for (const p of platforms) out[p] = validateVariant(p, { caption: captionFor(p), media: mediaFor(p), options: optionsFor(p) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platforms.join(), caption, media, custom]);
  const errorCount = platforms.reduce((n, p) => n + validation[p].errors.length, 0);

  function updateCustom(p: Platform, patch: Partial<Custom[Platform]> & { options?: PlatformOptions }) {
    setCustom((c) => ({ ...c, [p]: { ...c[p], ...patch, options: { ...c[p].options, ...(patch.options ?? {}) } } }));
  }

  function toggleAccount(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function insertText(text: string) {
    const el = textareaRef.current;
    const target = tab === "ALL" ? caption : captionFor(tab);
    const start = el?.selectionStart ?? target.length;
    const end = el?.selectionEnd ?? target.length;
    const next = target.slice(0, start) + text + target.slice(end);
    if (tab === "ALL") setCaption(next);
    else updateCustom(tab, { caption: next });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  }

  const timeFor = (p: Platform) => (perNetwork ? times[p] || when : when);
  const missingTime = platforms.some((p) => !timeFor(p));

  function toIso(local: string) {
    if (!local) return null;
    const d = zonedTimeToUtc(local, timezone);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  function submit(mode: "draft" | "schedule" | "now") {
    setResult(null);
    const scheduledAt = toIso(when);
    startTransition(async () => {
      const res = await savePost({
        slug,
        postId: initial?.postId,
        baseCaption: caption,
        mediaIds: media.map((m) => m.id),
        mode,
        scheduledAt,
        timezone,
        variants: selectedAccounts.map((a) => ({
          accountId: a.id,
          caption: custom[a.platform].caption,
          options: optionsFor(a.platform),
          scheduledAt: perNetwork ? toIso(timeFor(a.platform)) : null,
        })),
      });
      if (!res.ok) {
        setResult({ error: res.error, details: res.details });
        return;
      }
      router.push(mode === "schedule" ? `/w/${slug}/calendar?highlight=${res.postId}` : `/w/${slug}/posts?highlight=${res.postId}`);
      router.refresh();
    });
  }

  const connected = accounts.filter((a) => a.status === "CONNECTED" || selected.includes(a.id));
  const editingCaption = tab === "ALL" ? caption : captionFor(tab);
  const PreviewComponent = activePreview ? PREVIEWS[activePreview] : null;
  const previewAccount = activePreview ? selectedAccounts.find((a) => a.platform === activePreview) : undefined;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-5">
        {initial && (
          <div className="card flex flex-wrap items-center gap-3 p-4">
            <StatusBadge status={initial.status} />
            <p className="text-sm text-zinc-500">
              {locked ? "This post has gone out, so it can't be edited." : !canEdit ? "You have view-only access." : "Editing an existing post."}
            </p>
            <div className="ml-auto flex gap-2">
              {canEdit && ["FAILED", "PARTIAL"].includes(initial.status) && (
                <button className="btn-secondary" disabled={pending} onClick={() => startTransition(async () => { await retryPost(slug, initial.postId); router.refresh(); })}>
                  Retry failed
                </button>
              )}
              {canEdit && (
                <button
                  className="btn-secondary"
                  disabled={pending}
                  onClick={() => startTransition(async () => { const id = await duplicatePost(slug, initial.postId); router.push(`/w/${slug}/compose?post=${id}`); })}
                >
                  Duplicate
                </button>
              )}
            </div>
          </div>
        )}

        {initial && initial.variants.some((v) => v.externalUrl || v.error) && (
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Publishing results</h2>
            <ul className="space-y-1.5 text-sm">
              {initial.variants.map((v) => {
                const a = accounts.find((x) => x.id === v.accountId);
                if (!a) return null;
                return (
                  <li key={v.accountId} className="flex flex-wrap items-center gap-2">
                    <PlatformIcon platform={a.platform} size={18} />
                    <span>@{a.handle}</span>
                    <StatusBadge status={v.status} />
                    {v.externalUrl && <a className="truncate text-indigo-600 hover:underline" href={v.externalUrl} target="_blank" rel="noreferrer">{v.externalUrl}</a>}
                    {v.error && <span className="text-red-600">{v.error}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <fieldset disabled={readOnly} className="min-w-0 space-y-5">
          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Post to</h2>
              {connected.length > 0 && !readOnly && (
                <button type="button" className="text-sm text-indigo-600 hover:underline" onClick={() => setSelected(selected.length === connected.length ? [] : connected.map((a) => a.id))}>
                  {selected.length === connected.length ? "Clear" : "Select all"}
                </button>
              )}
            </div>
            {connected.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No accounts connected yet. <Link href={`/w/${slug}/accounts`} className="text-indigo-600 hover:underline">Connect one</Link>.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {connected.map((a) => {
                  const on = selected.includes(a.id);
                  return (
                    <button
                      type="button"
                      key={a.id}
                      onClick={() => toggleAccount(a.id)}
                      aria-pressed={on}
                      className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition ${
                        on ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950" : "border-zinc-200 opacity-60 hover:opacity-100 dark:border-zinc-700"
                      }`}
                    >
                      <PlatformIcon platform={a.platform} size={24} className="rounded-full" />@{a.handle}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card">
            <div className="flex gap-1 overflow-x-auto border-b border-zinc-100 px-2 pt-2 dark:border-zinc-800">
              <TabButton active={tab === "ALL"} onClick={() => setTab("ALL")}>All networks</TabButton>
              {platforms.map((p) => {
                const v = validation[p];
                return (
                  <TabButton key={p} active={tab === p} onClick={() => { setTab(p); setPreviewTab(p); }}>
                    <PlatformIcon platform={p} size={16} />
                    {PLATFORM_RULES[p].label}
                    {v.errors.length > 0 ? (
                      <span className="rounded-full bg-red-100 px-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{v.errors.length}</span>
                    ) : v.warnings.length > 0 ? (
                      <span className="text-xs text-amber-500">!</span>
                    ) : (
                      <span className="text-xs text-emerald-500">✓</span>
                    )}
                    {custom[p].caption !== null && <span className="text-xs text-indigo-500" title="Custom caption">•</span>}
                  </TabButton>
                );
              })}
            </div>

            <div className="space-y-4 p-4">
              {tab !== "ALL" && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {custom[tab].caption === null ? (
                    <>
                      <span className="text-zinc-500">Using the main caption.</span>
                      <button type="button" className="text-indigo-600 hover:underline" onClick={() => updateCustom(tab, { caption })}>
                        Write a custom {PLATFORM_RULES[tab].label} caption
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-zinc-500">Custom caption for {PLATFORM_RULES[tab].label}.</span>
                      <button type="button" className="text-indigo-600 hover:underline" onClick={() => updateCustom(tab, { caption: null })}>
                        Go back to the main caption
                      </button>
                    </>
                  )}
                </div>
              )}

              <div>
                <textarea
                  ref={textareaRef}
                  className="input min-h-40 resize-y text-[15px] leading-relaxed"
                  placeholder="What do you want to share?"
                  value={editingCaption}
                  readOnly={tab !== "ALL" && custom[tab].caption === null}
                  onChange={(e) => (tab === "ALL" ? setCaption(e.target.value) : updateCustom(tab, { caption: e.target.value }))}
                  aria-label="Caption"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <button type="button" className="btn-secondary px-2.5 py-1" onClick={() => setShowEmoji((s) => !s)} aria-label="Insert emoji">😊</button>
                    {showEmoji && (
                      <div className="absolute left-0 top-9 z-20 grid w-64 grid-cols-8 gap-1 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                        {EMOJIS.map((e) => (
                          <button type="button" key={e} className="rounded p-1 text-lg hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => { insertText(e); setShowEmoji(false); }}>
                            {e}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {suggestedHashtags.slice(0, 6).map((h) => (
                    <button type="button" key={h} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300" onClick={() => insertText(` ${h}`)}>
                      {h}
                    </button>
                  ))}
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    {(tab === "ALL" ? platforms : [tab]).map((p) => {
                      const len = captionFor(p).length;
                      const max = PLATFORM_RULES[p].maxCaption;
                      return (
                        <span key={p} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs tabular-nums ${len > max ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                          <PlatformIcon platform={p} size={12} />
                          {len}/{max}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {tab === "ALL" ? (
                <MediaUploader slug={slug} media={media} onChange={setMedia} disabled={readOnly} />
              ) : (
                <PlatformSettings
                  platform={tab}
                  options={optionsFor(tab)}
                  media={mediaFor(tab)}
                  allMedia={media}
                  onChange={(options) => updateCustom(tab, { options })}
                />
              )}

              {tab !== "ALL" && (validation[tab].errors.length > 0 || validation[tab].warnings.length > 0) && (
                <ul className="space-y-1 text-sm">
                  {validation[tab].errors.map((e) => <li key={e} className="text-red-600">✕ {e}</li>)}
                  {validation[tab].warnings.map((w) => <li key={w} className="text-amber-600">! {w}</li>)}
                </ul>
              )}
            </div>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 font-semibold">When</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="when">{perNetwork ? "Default date and time" : "Date and time"}</label>
                <input id="when" type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="tz">Time zone</label>
                <select id="tz" className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {Array.from(new Set([browserTz, timezone, ...COMMON_TIMEZONES])).map((z) => <option key={z} value={z}>{z.replace("_", " ")}</option>)}
                </select>
              </div>
            </div>

            {platforms.length > 1 && (
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={perNetwork}
                  onChange={(e) => {
                    setPerNetwork(e.target.checked);
                    // Start every network at the default time so only the ones that differ need changing.
                    if (e.target.checked) setTimes((t) => Object.fromEntries(platforms.map((p) => [p, t[p] || when])));
                  }}
                />
                Post at a different time on each network
              </label>
            )}

            {perNetwork && platforms.length > 1 && (
              <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
                {[...platforms]
                  .sort((a, b) => timeFor(a).localeCompare(timeFor(b)))
                  .map((p) => (
                    <li key={p} className="flex flex-wrap items-center gap-3 px-3 py-2">
                      <PlatformIcon platform={p} size={22} />
                      <label htmlFor={`when-${p}`} className="min-w-28 flex-1 text-sm font-medium">
                        {PLATFORM_RULES[p].label}
                      </label>
                      <input
                        id={`when-${p}`}
                        type="datetime-local"
                        className="input w-auto"
                        value={timeFor(p)}
                        onChange={(e) => setTimes((t) => ({ ...t, [p]: e.target.value }))}
                      />
                      {timeFor(p) !== when && (
                        <button type="button" className="text-xs text-zinc-500 hover:underline" onClick={() => setTimes((t) => ({ ...t, [p]: when }))}>
                          Use default
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            )}

            {result && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                <p className="font-medium">{result.error}</p>
                {result.details && <ul className="mt-1 list-disc pl-5">{result.details.map((d) => <li key={d}>{d}</li>)}</ul>}
              </div>
            )}

            {!readOnly && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" className="btn-primary" disabled={pending || selected.length === 0 || errorCount > 0 || missingTime} onClick={() => submit("schedule")}>
                  Schedule
                </button>
                <button type="button" className="btn-secondary" disabled={pending || selected.length === 0 || errorCount > 0} onClick={() => submit("now")}>
                  Publish now
                </button>
                <button type="button" className="btn-secondary" disabled={pending || selected.length === 0} onClick={() => submit("draft")}>
                  Save draft
                </button>
                <span className="text-sm text-zinc-500">
                  {pending ? "Saving…" : selected.length === 0 ? "Pick at least one account" : errorCount > 0 ? `${errorCount} issue${errorCount > 1 ? "s" : ""} to fix` : "Ready to go"}
                </span>
              </div>
            )}
          </section>
        </fieldset>
      </div>

      <aside className="xl:sticky xl:top-6 xl:self-start">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Preview</h2>
        </div>
        {platforms.length === 0 ? (
          <div className="card p-6 text-center text-sm text-zinc-500">Pick an account to see how the post will look.</div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {platforms.map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setPreviewTab(p)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${activePreview === p ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950" : "border-zinc-200 dark:border-zinc-700"}`}
                >
                  <PlatformIcon platform={p} size={14} />
                  {PLATFORM_RULES[p].label}
                </button>
              ))}
            </div>
            {PreviewComponent && previewAccount && activePreview && (
              <PreviewComponent account={previewAccount} caption={captionFor(activePreview)} media={mediaFor(activePreview)} options={optionsFor(activePreview)} />
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
        active ? "border-indigo-600 text-indigo-700 dark:text-indigo-300" : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function PlatformSettings({
  platform,
  options,
  media,
  allMedia,
  onChange,
}: {
  platform: Platform;
  options: PlatformOptions;
  media: ComposerMedia[];
  allMedia: ComposerMedia[];
  onChange: (o: PlatformOptions) => void;
}) {
  const rules = PLATFORM_RULES[platform];
  const first = media[0];
  const aspects = first?.type === "VIDEO" ? rules.videoAspects : rules.imageAspects;

  function toggleMedia(id: string) {
    const ids = media.some((m) => m.id === id) ? media.filter((m) => m.id !== id).map((m) => m.id) : allMedia.filter((m) => m.id === id || media.some((x) => x.id === m.id)).map((m) => m.id);
    onChange({ mediaIds: ids.length === allMedia.length ? undefined : ids });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {allMedia.length > 0 && (
        <div className="sm:col-span-2">
          <p className="label">Media for {rules.label}</p>
          <div className="flex flex-wrap gap-2">
            {allMedia.map((m) => {
              const on = media.some((x) => x.id === m.id);
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => toggleMedia(m.id)}
                  aria-pressed={on}
                  title={on ? "Click to leave out" : "Click to include"}
                  className={`relative h-16 w-16 overflow-hidden rounded-lg border-2 ${on ? "border-indigo-500" : "border-transparent opacity-40"}`}
                >
                  {m.type === "VIDEO" ? (
                    <video src={m.url} className="h-full w-full object-cover" muted />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt={m.fileName} className="h-full w-full object-cover" />
                  )}
                  <span className="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[10px] text-white">{on ? "✓" : m.type === "VIDEO" ? "▶" : ""}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-zinc-500">Click to include or leave out an item for this network only.</p>
        </div>
      )}
      {rules.options.includes("igFormat") && (
        <Field label="Format">
          <select className="input" value={options.igFormat} onChange={(e) => onChange({ igFormat: e.target.value as PlatformOptions["igFormat"], aspect: e.target.value === "REEL" ? "9:16" : undefined })}>
            <option value="FEED">Feed post / carousel</option>
            <option value="REEL">Reel</option>
          </select>
        </Field>
      )}
      {rules.options.includes("title") && (
        <Field label="Title (required, max 100)">
          <input className="input" value={options.title ?? ""} maxLength={100} onChange={(e) => onChange({ title: e.target.value })} />
        </Field>
      )}
      {rules.options.includes("privacy") && (
        <Field label="Who can view">
          <select className="input" value={options.privacy} onChange={(e) => onChange({ privacy: e.target.value as PlatformOptions["privacy"] })}>
            <option value="PUBLIC">Everyone</option>
            {platform === "TIKTOK" && <option value="FRIENDS">Friends</option>}
            <option value="PRIVATE">Only me</option>
          </select>
        </Field>
      )}
      {rules.options.includes("visibility") && (
        <Field label="Visibility">
          <select className="input" value={options.visibility ?? "PUBLIC"} onChange={(e) => onChange({ visibility: e.target.value as PlatformOptions["visibility"] })}>
            <option value="PUBLIC">Anyone</option>
            <option value="CONNECTIONS">Connections only</option>
          </select>
        </Field>
      )}
      {rules.options.includes("allowComments") && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={options.allowComments !== false} onChange={(e) => onChange({ allowComments: e.target.checked })} /> Allow comments
        </label>
      )}
      {rules.options.includes("allowDuet") && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={options.allowDuet !== false} onChange={(e) => onChange({ allowDuet: e.target.checked })} /> Allow duet and stitch
        </label>
      )}
      {rules.options.includes("firstComment") && (
        <Field label="First comment (optional)" wide>
          <input className="input" value={options.firstComment ?? ""} placeholder="e.g. extra hashtags or a link" onChange={(e) => onChange({ firstComment: e.target.value })} />
        </Field>
      )}

      {first && (
        <div className="sm:col-span-2">
          <p className="label">Crop</p>
          <div className="flex flex-wrap gap-1.5">
            {aspects.map((a) => (
              <button
                type="button"
                key={a}
                onClick={() => onChange({ aspect: a })}
                className={`rounded-lg border px-2.5 py-1 text-xs ${options.aspect === a ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "border-zinc-200 dark:border-zinc-700"}`}
              >
                {ASPECT_LABELS[a]}
              </button>
            ))}
          </div>
          {options.aspect !== "original" && (
            <div className="mt-3">
              <p className="mb-1 text-xs text-zinc-500">Click the image to choose what stays in frame.</p>
              <div
                className="relative inline-block max-w-full cursor-crosshair overflow-hidden rounded-lg"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  onChange({ focalX: Math.round(((e.clientX - r.left) / r.width) * 100), focalY: Math.round(((e.clientY - r.top) / r.height) * 100) });
                }}
              >
                {first.type === "VIDEO" ? (
                  <video src={first.url} className="block max-h-48 max-w-full" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={first.url} alt="Focal point picker" className="block max-h-48 max-w-full" />
                )}
                <span
                  className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-indigo-500/60 shadow"
                  style={{ left: `${options.focalX ?? 50}%`, top: `${options.focalY ?? 50}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <p className="label">{label}</p>
      {children}
    </div>
  );
}
