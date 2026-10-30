"use client";

import { useEffect, useState } from "react";

/** Formats a date in the viewer's own time zone (the server doesn't know it). */
export function LocalTime({ date, format = "datetime" }: { date: string | Date | null; format?: "datetime" | "relative" }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!date) return;
    const d = new Date(date);
    if (format === "relative") {
      const mins = Math.round((d.getTime() - Date.now()) / 60_000);
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
      const abs = Math.abs(mins);
      setText(abs < 60 ? rtf.format(mins, "minute") : abs < 1440 ? rtf.format(Math.round(mins / 60), "hour") : rtf.format(Math.round(mins / 1440), "day"));
    } else {
      setText(d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));
    }
  }, [date, format]);
  if (!date) return <span className="text-zinc-400">Not scheduled</span>;
  return <time dateTime={new Date(date).toISOString()} suppressHydrationWarning>{text ?? "…"}</time>;
}
