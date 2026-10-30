import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { acceptInvite } from "@/app/actions/auth";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await requireUser();
  const invite = await db.invite.findUnique({ where: { token }, include: { workspace: true } });
  if (!invite) notFound();
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md p-6 text-center">
        {invite.acceptedAt ? (
          <p>This invite has already been used.</p>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Join {invite.workspace.name}</h1>
            <p className="mt-2 text-sm text-zinc-500">
              You&apos;re signed in as {user.email}. You&apos;ll join as <b>{invite.role.toLowerCase()}</b>.
            </p>
            <form action={acceptInvite.bind(null, token)} className="mt-5">
              <button className="btn-primary w-full">Accept invite</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
