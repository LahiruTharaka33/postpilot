"use client";

import { useRef, useState } from "react";

export interface ComposerMedia {
  id: string;
  url: string;
  type: "IMAGE" | "VIDEO";
  width: number;
  height: number;
  duration: number | null;
  size: number;
  fileName: string;
}

/** Reads width, height and duration in the browser so the server doesn't need ffmpeg. */
function measure(file: File): Promise<{ width: number; height: number; duration: number | null }> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const done = (r: { width: number; height: number; duration: number | null }) => {
      URL.revokeObjectURL(url);
      resolve(r);
    };
    if (file.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => done({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
      v.onerror = () => done({ width: 0, height: 0, duration: null });
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight, duration: null });
      img.onerror = () => done({ width: 0, height: 0, duration: null });
      img.src = url;
    }
  });
}

export function MediaUploader({
  slug,
  media,
  onChange,
  disabled,
}: {
  slug: string;
  media: ComposerMedia[];
  onChange: (m: ComposerMedia[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function upload(files: FileList | File[]) {
    setError(null);
    const list = Array.from(files);
    setUploading((n) => n + list.length);
    const added: ComposerMedia[] = [];
    for (const file of list) {
      try {
        const dims = await measure(file);
        const form = new FormData();
        form.set("file", file);
        form.set("slug", slug);
        form.set("width", String(dims.width));
        form.set("height", String(dims.height));
        if (dims.duration != null) form.set("duration", String(dims.duration));
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Upload failed");
        added.push(body as ComposerMedia);
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (added.length) onChange([...media, ...added]);
  }

  function move(i: number, dir: -1 | 1) {
    const next = [...media];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div>
      <p className="label">Media</p>
      <div className="flex flex-wrap gap-3">
        {media.map((m, i) => (
          <div key={m.id} className="group relative h-24 w-24 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
            {m.type === "VIDEO" ? (
              <video src={m.url} className="h-full w-full object-cover" muted />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt={m.fileName} className="h-full w-full object-cover" />
            )}
            <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">
              {m.type === "VIDEO" ? `▶ ${m.duration ? Math.round(m.duration) + "s" : ""}` : `${m.width}×${m.height}`}
            </span>
            {!disabled && (
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 px-1 text-xs text-white opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                <button type="button" onClick={() => move(i, -1)} aria-label="Move left" disabled={i === 0}>◀</button>
                <button type="button" onClick={() => onChange(media.filter((x) => x.id !== m.id))} aria-label="Remove">✕</button>
                <button type="button" onClick={() => move(i, 1)} aria-label="Move right" disabled={i === media.length - 1}>▶</button>
              </div>
            )}
          </div>
        ))}
        {Array.from({ length: uploading }).map((_, i) => (
          <div key={`u${i}`} className="flex h-24 w-24 animate-pulse items-center justify-center rounded-lg bg-zinc-100 text-xs text-zinc-500 dark:bg-zinc-800">Uploading…</div>
        ))}
        {!disabled && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); }}
            className={`flex h-24 min-w-24 flex-col items-center justify-center rounded-lg border-2 border-dashed px-3 text-xs text-zinc-500 ${dragOver ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950" : "border-zinc-300 hover:border-indigo-400 dark:border-zinc-700"}`}
          >
            <span className="text-xl">+</span>
            Add photos or video
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
        multiple
        hidden
        onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }}
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-zinc-500">JPG, PNG, WebP, GIF, MP4, MOV or WebM up to 200 MB. Drag files here or click to add. Crop each network in its own tab.</p>
    </div>
  );
}
