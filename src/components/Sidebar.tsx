"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/actions/auth";

const NAV = [
  { href: "dashboard", label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { href: "compose", label: "Create post", icon: "M12 5v14M5 12h14" },
  { href: "calendar", label: "Calendar", icon: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" },
  { href: "posts", label: "Posts", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "accounts", label: "Accounts", icon: "M8 12a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M17 11a3 3 0 100-6M22 21v-1a5 5 0 00-4-4.9" },
  { href: "settings", label: "Team & settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" },
];

interface Props {
  slug: string;
  workspaces: Array<{ slug: string; name: string }>;
  user: { name: string; email: string };
  role: string;
}

export function Sidebar({ slug, workspaces, user, role }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const current = workspaces.find((w) => w.slug === slug);

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white">P</div>
        <span className="font-semibold">PostPilot</span>
      </div>
      <div className="px-3">
        <label className="sr-only" htmlFor="ws">Workspace</label>
        <select
          id="ws"
          className="input"
          value={slug}
          onChange={(e) => {
            if (e.target.value === "__new") router.push("/new-workspace");
            else router.push(`/w/${e.target.value}/dashboard`);
          }}
        >
          {workspaces.map((w) => (
            <option key={w.slug} value={w.slug}>{w.name}</option>
          ))}
          <option value="__new">+ New workspace…</option>
        </select>
        <p className="mt-1 px-1 text-xs text-zinc-500">Your role: {role.toLowerCase()}</p>
      </div>
      <nav className="mt-4 flex-1 space-y-0.5 px-3">
        {NAV.filter((n) => n.href !== "compose" || role !== "VIEWER").map((n) => {
          const href = `/w/${slug}/${n.href}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={n.href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                active ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={n.icon} />
              </svg>
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        <p className="truncate px-1 text-sm font-medium">{user.name}</p>
        <p className="truncate px-1 text-xs text-zinc-500">{user.email}</p>
        <form action={logout}>
          <button className="mt-2 w-full rounded-lg px-1 py-1 text-left text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">Log out</button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 lg:hidden dark:border-zinc-800 dark:bg-zinc-900">
        <span className="font-semibold">{current?.name}</span>
        <button className="btn-secondary px-2.5 py-1.5" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
      </header>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-zinc-200 bg-white transition-transform dark:border-zinc-800 dark:bg-zinc-900 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {nav}
      </aside>
    </>
  );
}
