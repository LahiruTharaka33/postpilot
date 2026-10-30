"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, signup } from "@/app/actions/auth";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, action, pending] = useActionState(mode === "login" ? login : signup, undefined);
  const invited = next?.startsWith("/invite/");
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      {mode === "signup" && (
        <div>
          <label className="label" htmlFor="name">Your name</label>
          <input id="name" name="name" className="input" autoComplete="name" required />
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
        />
      </div>
      {mode === "signup" && !invited && (
        <div>
          <label className="label" htmlFor="workspace">First brand or client</label>
          <input id="workspace" name="workspace" className="input" placeholder="e.g. Sunrise Café" required />
        </div>
      )}
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
      </button>
      <p className="text-center text-sm text-zinc-500">
        {mode === "login" ? (
          <>No account? <Link className="text-indigo-600 hover:underline" href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Sign up</Link></>
        ) : (
          <>Have an account? <Link className="text-indigo-600 hover:underline" href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Log in</Link></>
        )}
      </p>
    </form>
  );
}
