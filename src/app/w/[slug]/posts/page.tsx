import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { POST_STATUSES, hasRole } from "@/lib/constants";
import type { Platform } from "@/lib/platforms";
import { EmptyState, PageHeader, PlatformIcon, StatusBadge } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { PostActions } from "@/components/PostActions";

export default async function PostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string; highlight?: string }>;
}) {
  const { slug } = await params;
  const { status, highlight } = await searchParams;
  const { workspace, role } = await requireMember(slug);
  const canEdit = hasRole(role, "EDITOR");
  const filter = POST_STATUSES.includes(status as (typeof POST_STATUSES)[number]) ? status : undefined;
  // "Failed" also covers posts that only partly went out.
  const statusWhere = filter === "FAILED" ? { in: ["FAILED", "PARTIAL"] } : filter;

  const [posts, counts] = await Promise.all([
    db.post.findMany({
      where: { workspaceId: workspace.id, ...(statusWhere ? { status: statusWhere } : {}) },
      include: { variants: { include: { account: { select: { platform: true, handle: true } } } }, author: { select: { name: true } } },
      orderBy: [{ scheduledAt: { sort: "desc", nulls: "first" } }, { updatedAt: "desc" }],
      take: 100,
    }),
    db.post.groupBy({ by: ["status"], where: { workspaceId: workspace.id }, _count: true }),
  ]);
  const count = (s: string) => counts.filter((c) => (s === "FAILED" ? ["FAILED", "PARTIAL"] : [s]).includes(c.status)).reduce((n, c) => n + c._count, 0);
  const tabs = [
    { key: undefined, label: "All", n: counts.reduce((n, c) => n + c._count, 0) },
    { key: "SCHEDULED", label: "Scheduled", n: count("SCHEDULED") },
    { key: "DRAFT", label: "Drafts", n: count("DRAFT") },
    { key: "PUBLISHED", label: "Published", n: count("PUBLISHED") },
    { key: "FAILED", label: "Failed", n: count("FAILED") },
  ];

  return (
    <>
      <PageHeader
        title="Posts"
        description="Every post in this workspace."
        action={canEdit && <Link href={`/w/${slug}/compose`} className="btn-primary">+ Create post</Link>}
      />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={`/w/${slug}/posts${t.key ? `?status=${t.key}` : ""}`}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${filter === t.key ? "border-indigo-600 text-indigo-700 dark:text-indigo-300" : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}
          >
            {t.label} <span className="ml-1 text-xs text-zinc-400">{t.n}</span>
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <EmptyState title="No posts here" body="Posts you create will be listed here." href={canEdit ? `/w/${slug}/compose` : undefined} cta="Create post" />
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => {
            // Errors from final failures and from attempts that will be retried.
            const split = new Set(p.variants.map((v) => v.scheduledAt?.getTime())).size > 1;
            const errors = Array.from(new Set(p.variants.filter((v) => v.error && v.status !== "PUBLISHED").map((v) => v.error)));
            return (
              <li key={p.id} className={`card p-4 ${highlight === p.id ? "ring-2 ring-indigo-500" : ""}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                      <StatusBadge status={p.status} />
                      <span className="text-zinc-500">
                        {split && "From "}
                        <LocalTime date={p.scheduledAt} />
                        {split && " · different times per network"}
                      </span>
                      <span className="text-xs text-zinc-400">by {p.author.name}</span>
                    </div>
                    <Link href={`/w/${slug}/compose?post=${p.id}`} className="line-clamp-2 text-sm hover:underline">
                      {p.baseCaption || <span className="text-zinc-400">(media only)</span>}
                    </Link>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.variants.map((v) => (
                        <span key={v.id} className="flex items-center gap-1 rounded-full bg-zinc-100 py-0.5 pl-0.5 pr-2 text-xs dark:bg-zinc-800" title={v.error ?? v.status.toLowerCase()}>
                          <PlatformIcon platform={v.account.platform as Platform} size={16} className="rounded-full" />
                          {v.externalUrl ? (
                            <a href={v.externalUrl} target="_blank" rel="noreferrer" className="hover:underline">@{v.account.handle}</a>
                          ) : (
                            <span>@{v.account.handle}</span>
                          )}
                          {split && v.scheduledAt && (
                            <span className="text-zinc-500">
                              · <LocalTime date={v.scheduledAt} />
                            </span>
                          )}
                          <span className={v.status === "FAILED" ? "text-red-600" : v.status === "PUBLISHED" ? "text-emerald-600" : "text-zinc-400"}>
                            {v.status === "PUBLISHED" ? "✓" : v.status === "FAILED" ? "✕" : v.status === "SCHEDULED" && v.attempts > 0 ? "retrying" : ""}
                          </span>
                        </span>
                      ))}
                    </div>
                    {errors.length > 0 && <p className="mt-2 text-xs text-red-600">{errors.join(" · ")}</p>}
                  </div>
                  {canEdit && <PostActions slug={slug} postId={p.id} status={p.status} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
