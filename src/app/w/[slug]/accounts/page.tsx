import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { hasRole } from "@/lib/constants";
import { PLATFORMS, PLATFORM_RULES, type Platform } from "@/lib/platforms";
import { disconnectAccount, reconnectAccount } from "@/app/actions/accounts";
import { Avatar, PageHeader, PlatformIcon } from "@/components/ui";
import { ConnectAccountForm } from "@/components/ConnectAccountForm";

export default async function AccountsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireMember(slug);
  const isOwner = hasRole(role, "OWNER");
  const accounts = await db.socialAccount.findMany({
    where: { workspaceId: workspace.id },
    orderBy: [{ platform: "asc" }, { createdAt: "asc" }],
  });

  return (
    <>
      <PageHeader title="Social accounts" description="The profiles and pages this workspace posts to." />
      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Demo mode: accounts are simulated and nothing is posted to the real networks. Real sign-in (OAuth) plugs in through the connector for each platform.
      </div>
      {isOwner && (
        <section className="card mb-6 p-5">
          <h2 className="mb-3 font-semibold">Connect an account</h2>
          <ConnectAccountForm slug={slug} />
        </section>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {PLATFORMS.map((p) => {
          const list = accounts.filter((a) => a.platform === p);
          return (
            <section key={p} className="card p-4">
              <div className="mb-3 flex items-center gap-2">
                <PlatformIcon platform={p as Platform} size={24} />
                <h3 className="font-semibold">{PLATFORM_RULES[p].label}</h3>
                <span className="ml-auto text-xs text-zinc-500">{list.filter((a) => a.status === "CONNECTED").length} connected</span>
              </div>
              {list.length === 0 ? (
                <p className="text-sm text-zinc-500">No accounts.</p>
              ) : (
                <ul className="space-y-3">
                  {list.map((a) => (
                    <li key={a.id} className="flex items-center gap-3">
                      <Avatar name={a.displayName} color={a.avatarColor} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.displayName}</p>
                        <p className="truncate text-xs text-zinc-500">
                          @{a.handle} ·{" "}
                          {a.status === "CONNECTED" ? <span className="text-emerald-600">connected</span> : <span className="text-zinc-400">disconnected</span>}
                        </p>
                      </div>
                      {isOwner && (
                        <form action={(a.status === "CONNECTED" ? disconnectAccount : reconnectAccount).bind(null, slug, a.id)}>
                          <button className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                            {a.status === "CONNECTED" ? "Disconnect" : "Reconnect"}
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
