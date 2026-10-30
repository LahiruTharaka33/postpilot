"use client";

import { useActionState } from "react";
import { createWorkspace } from "@/app/actions/workspace";

export function NewWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspace, undefined);
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row">
      <input name="name" className="input" placeholder="Brand or client name" required />
      <button className="btn-primary shrink-0" disabled={pending}>{pending ? "Creating…" : "Create workspace"}</button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
