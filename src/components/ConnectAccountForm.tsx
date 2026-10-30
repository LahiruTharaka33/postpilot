"use client";

import { useActionState } from "react";
import { connectAccount } from "@/app/actions/accounts";
import { PLATFORMS, PLATFORM_RULES } from "@/lib/platforms";

export function ConnectAccountForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(connectAccount, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="slug" value={slug} />
      <div>
        <label className="label" htmlFor="platform">Platform</label>
        <select id="platform" name="platform" className="input">
          {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_RULES[p].label}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="handle">Handle</label>
        <input id="handle" name="handle" className="input" placeholder="@yourbrand" required />
      </div>
      <div>
        <label className="label" htmlFor="displayName">Display name</label>
        <input id="displayName" name="displayName" className="input" placeholder="Your Brand" required />
      </div>
      <button className="btn-primary" disabled={pending}>{pending ? "Connecting…" : "Connect"}</button>
      {state?.error && <p className="text-sm text-red-600 sm:col-span-4">{state.error}</p>}
      {state?.message && <p className="text-sm text-emerald-600 sm:col-span-4">{state.message}</p>}
    </form>
  );
}
