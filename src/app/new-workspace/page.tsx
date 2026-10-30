import { requireUser } from "@/lib/auth";
import { NewWorkspaceForm } from "@/components/NewWorkspaceForm";

export default async function NewWorkspacePage() {
  await requireUser();
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-lg p-6">
        <h1 className="text-lg font-semibold">Create a workspace</h1>
        <p className="mb-4 mt-1 text-sm text-zinc-500">One workspace per brand or client. Each has its own accounts, posts and team.</p>
        <NewWorkspaceForm />
      </div>
    </main>
  );
}
