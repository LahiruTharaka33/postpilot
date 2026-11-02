import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { hasRole } from "@/lib/constants";
import { PLATFORMS, type Platform } from "@/lib/platforms";
import { EmptyState, PageHeader, PlatformIcon } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { BankActions } from "@/components/BankActions";

export default async function BankPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; highlight?: string }>;
}) {
  const { slug } = await params;
  const { q = "", highlight } = await searchParams;
  const { workspace, role } = await requireMember(slug);
  const canEdit = hasRole(role, "EDITOR");
  const query = q.trim();

  const items = await db.bankPost.findMany({
    where: {
      workspaceId: workspace.id,
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { baseCaption: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  // First image or video of each item, for the card thumbnail.
  const firstIds = items.map((i) => (JSON.parse(i.mediaIds) as string[])[0]).filter(Boolean);
  const [media, accounts] = await Promise.all([
    db.media.findMany({ where: { workspaceId: workspace.id, id: { in: firstIds } }, select: { id: true, url: true, type: true } }),
    db.socialAccount.findMany({ where: { workspaceId: workspace.id }, select: { id: true, platform: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Post bank"
        description="Ready-made posts to reuse. Using one starts a new post from it; the bank copy stays for next time."
        action={canEdit && <Link href={`/w/${slug}/compose?bank=new`} className="btn-primary">+ Add to bank</Link>}
      />

      <form className="mb-5 flex gap-2" role="search">
        <input name="q" defaultValue={query} className="input max-w-md" placeholder="Search by name or caption" aria-label="Search the post bank" />
        <button className="btn-secondary">Search</button>
        {query && <Link href={`/w/${slug}/bank`} className="btn-secondary">Clear</Link>}
      </form>

      {items.length === 0 ? (
        query ? (
          <EmptyState title="No matches" body={`Nothing in the post bank matches "${query}".`} />
        ) : (
          <EmptyState
            title="The post bank is empty"
            body="Save posts you want to reuse, like promos, greetings or evergreen tips. Add one here, or use “Save to bank” while creating a post."
            href={canEdit ? `/w/${slug}/compose?bank=new` : undefined}
            cta="Add to bank"
          />
        )
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const thumb = media.find((m) => m.id === (JSON.parse(item.mediaIds) as string[])[0]);
            const mediaCount = (JSON.parse(item.mediaIds) as string[]).length;
            const platforms = PLATFORMS.filter((p) =>
              (JSON.parse(item.accountIds) as string[]).some((id) => accounts.find((a) => a.id === id)?.platform === p),
            );
            return (
              <li key={item.id} className={`card flex flex-col overflow-hidden ${highlight === item.id ? "ring-2 ring-indigo-500" : ""}`}>
                <div className="relative aspect-video bg-zinc-100 dark:bg-zinc-800">
                  {thumb ? (
                    thumb.type === "VIDEO" ? (
                      <video src={thumb.url} className="h-full w-full object-cover" muted preload="metadata" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-zinc-400">Text only</div>
                  )}
                  {mediaCount > 1 && <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">{mediaCount} items</span>}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h2 className="font-semibold">{item.title}</h2>
                  <p className="mt-1 line-clamp-3 flex-1 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
                    {item.baseCaption || <span className="text-zinc-400">(no caption)</span>}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    {platforms.length > 0 && (
                      <span className="flex -space-x-0.5">{platforms.map((p) => <PlatformIcon key={p} platform={p as Platform} size={16} />)}</span>
                    )}
                    <span>
                      Used {item.useCount} {item.useCount === 1 ? "time" : "times"}
                      {item.lastUsedAt && (
                        <>
                          {" · last "}
                          <LocalTime date={item.lastUsedAt} format="relative" />
                        </>
                      )}
                    </span>
                  </div>
                  {canEdit && <BankActions slug={slug} bankId={item.id} title={item.title} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
