"use client";

import { useActionState, useTransition } from "react";
import { changeRole, createInvite, removeMember } from "@/app/actions/workspace";
import { ROLES } from "@/lib/constants";

interface Member {
  id: string;
  role: string;
  user: { id: string; name: string; email: string };
}

interface Props {
  slug: string;
  members: Member[];
  currentUserId: string;
  canManage: boolean;
}

export function TeamManager({ slug, members, currentUserId, canManage }: Props) {
  const [state, action, pending] = useActionState(createInvite, undefined);
  const [busy, start] = useTransition();
  const inviteUrl = state?.message && typeof window !== "undefined" ? `${window.location.origin}${state.message}` : null;

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="border-b border-zinc-100 px-5 py-3 font-semibold dark:border-zinc-800">Members</h2>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {m.user.name}
                  {m.user.id === currentUserId && " (you)"}
                </p>
                <p className="text-xs text-zinc-500">{m.user.email}</p>
              </div>
              {canManage && m.user.id !== currentUserId ? (
                <>
                  <select
                    className="input w-auto py-1"
                    defaultValue={m.role}
                    disabled={busy}
                    onChange={(e) => start(() => changeRole(slug, m.id, e.target.value))}
                    aria-label={`Role for ${m.user.name}`}
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
                  </select>
                  <button
                    className="text-xs text-red-600 hover:underline"
                    disabled={busy}
                    onClick={() => confirm(`Remove ${m.user.name}?`) && start(() => removeMember(slug, m.id))}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <span className="text-sm text-zinc-500">{m.role.toLowerCase()}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {canManage && (
        <section className="card p-5">
          <h2 className="font-semibold">Invite a teammate</h2>
          <p className="mb-3 mt-1 text-sm text-zinc-500">
            Owners manage accounts and the team. Editors create and schedule posts. Viewers can only look.
          </p>
          <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input type="hidden" name="slug" value={slug} />
            <input name="email" type="email" className="input" placeholder="teammate@company.com" required />
            <select name="role" className="input w-auto" defaultValue="EDITOR">
              {ROLES.map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
            </select>
            <button className="btn-primary" disabled={pending}>Create invite link</button>
          </form>
          {state?.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
          {inviteUrl && (
            <div className="mt-3 rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
              <p className="mb-1 text-zinc-600 dark:text-zinc-400">Send this link to your teammate (email sending isn&apos;t set up yet):</p>
              <div className="flex gap-2">
                <input readOnly value={inviteUrl} className="input font-mono text-xs" onFocus={(e) => e.target.select()} />
                <button type="button" className="btn-secondary" onClick={() => navigator.clipboard.writeText(inviteUrl)}>Copy</button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
