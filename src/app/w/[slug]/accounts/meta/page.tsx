import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { listPages, type MetaPage } from "@/lib/meta";
import { getPendingConnection } from "@/lib/meta-connect";
import { saveMetaAccounts } from "@/app/actions/accounts";
import { Avatar, PageHeader, PlatformIcon } from "@/components/ui";

/** The page picker: after Facebook's login, the owner chooses which Pages and Instagram accounts this workspace posts to. */
export default async function MetaPickerPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { workspace } = await requireMember(slug, "OWNER");
  const userToken = await getPendingConnection(slug);

  let pages: MetaPage[] | null = null;
  let loadError: string | null = null;
  if (userToken) {
    try {
      pages = await listPages(userToken);
    } catch (e) {
      loadError = e instanceof Error ? e.message : "unknown error";
    }
  }

  const existing = await db.socialAccount.findMany({
    where: { workspaceId: workspace.id, provider: "META", status: "CONNECTED" },
    select: { platform: true, externalId: true },
  });
  const isConnected = (platform: string, id?: string) => existing.some((a) => a.platform === platform && a.externalId === id);

  return (
    <>
      <PageHeader title="Choose Pages to connect" description={`Pick the Facebook Pages and Instagram accounts ${workspace.name} posts to.`} />
      {!userToken || loadError ? (
        <div className="card p-5 text-sm">
          <p className="mb-3">{loadError ? `Couldn't load your Pages from Facebook: ${loadError}` : "Your Facebook sign-in has expired."}</p>
          <a href={`/api/connect/meta?slug=${encodeURIComponent(slug)}`} className="btn-primary">Connect with Facebook again</a>
        </div>
      ) : pages!.length === 0 ? (
        <div className="card p-5 text-sm">
          <p className="mb-2 font-medium">Facebook didn&apos;t share any Pages.</p>
          <p className="mb-3 text-zinc-500">
            You need full control of a Facebook Page, and you need to tick it on Facebook&apos;s &ldquo;Choose Pages&rdquo; screen.
          </p>
          <a href={`/api/connect/meta?slug=${encodeURIComponent(slug)}`} className="btn-primary">Try again</a>
        </div>
      ) : (
        <form action={saveMetaAccounts.bind(null, slug)} className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <ul className="space-y-3">
            {pages!.map((p) => (
              <li key={p.id} className="card space-y-3 p-4">
                <label className="flex items-center gap-3">
                  <input type="checkbox" name="fb" value={p.id} defaultChecked className="size-4" />
                  <PlatformIcon platform="FACEBOOK" size={20} />
                  <Avatar name={p.name} color="#1877F2" size={32} imageUrl={p.pictureUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block text-xs text-zinc-500">
                      Facebook Page{isConnected("FACEBOOK", p.id) && " · already connected, saving updates it"}
                    </span>
                  </span>
                </label>
                {p.instagram ? (
                  <label className="flex items-center gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                    <input type="checkbox" name="ig" value={p.id} defaultChecked className="size-4" />
                    <PlatformIcon platform="INSTAGRAM" size={20} />
                    <Avatar name={p.instagram.username} color="#E1306C" size={32} imageUrl={p.instagram.pictureUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">@{p.instagram.username}</span>
                      <span className="block text-xs text-zinc-500">
                        Instagram, linked to this Page{isConnected("INSTAGRAM", p.instagram.id) && " · already connected, saving updates it"}
                      </span>
                    </span>
                  </label>
                ) : (
                  <p className="border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
                    No Instagram account linked. To post to Instagram, make it a Business or Creator account and link it to this Page.
                  </p>
                )}
              </li>
            ))}
          </ul>
          <div className="flex gap-3">
            <button className="btn-primary">Connect selected</button>
            <Link href={`/w/${slug}/accounts`} className="btn-secondary">Cancel</Link>
          </div>
        </form>
      )}
    </>
  );
}
