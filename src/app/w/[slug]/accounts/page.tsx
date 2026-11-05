import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { hasRole } from "@/lib/constants";
import { PLATFORMS, PLATFORM_RULES, type Platform } from "@/lib/platforms";
import { disconnectAccount, reconnectAccount } from "@/app/actions/accounts";
import { Avatar, PageHeader, PlatformIcon } from "@/components/ui";
import { ConnectAccountForm } from "@/components/ConnectAccountForm";
import { metaConfig } from "@/lib/meta";

export default async function AccountsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ meta_error?: string; meta_connected?: string }>;
}) {
  const { slug } = await params;
  const { meta_error, meta_connected } = await searchParams;
  const { workspace, role } = await requireMember(slug);
  const isOwner = hasRole(role, "OWNER");
  const metaEnabled = metaConfig() !== null;
  const accounts = await db.socialAccount.findMany({
    where: { workspaceId: workspace.id },
    orderBy: [{ platform: "asc" }, { createdAt: "asc" }],
  });

  return (
    <>
      <PageHeader title="Social accounts" description="The profiles and pages this workspace posts to." />
      {meta_error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{meta_error}</p>}
      {meta_connected && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">Connected {meta_connected} account{meta_connected === "1" ? "" : "s"} from Facebook.</p>}
      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        {metaEnabled
          ? "Facebook Pages and Instagram accounts connected with Facebook post for real. Accounts marked “demo” are simulated and nothing is posted to the real networks."
          : "Demo mode: accounts are simulated and nothing is posted to the real networks. Real sign-in (OAuth) plugs in through the connector for each platform."}
      </div>
      {isOwner && metaEnabled && (
        <section className="card mb-6 flex flex-wrap items-center gap-4 p-5">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Facebook and Instagram</h2>
            <p className="text-sm text-zinc-500">Sign in with Facebook and choose the Pages, and their linked Instagram accounts, this workspace posts to.</p>
          </div>
          <a href={`/api/connect/meta?slug=${encodeURIComponent(slug)}`} className="btn-primary">Connect with Facebook</a>
        </section>
      )}
      {isOwner && (
        <section className="card mb-6 p-5">
          <h2 className="mb-3 font-semibold">{metaEnabled ? "Add a demo account" : "Connect an account"}</h2>
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
                      <Avatar name={a.displayName} color={a.avatarColor} size={32} imageUrl={a.avatarUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.displayName}</p>
                        <p className="truncate text-xs text-zinc-500">
                          @{a.handle} ·{" "}
                          {a.provider === "MOCK" && metaEnabled && <span className="text-zinc-400">demo · </span>}
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
