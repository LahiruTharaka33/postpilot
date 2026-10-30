import Link from "next/link";
import { startOfWeek } from "date-fns";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { hasRole } from "@/lib/constants";
import type { Platform } from "@/lib/platforms";
import { EmptyState, PageHeader, PlatformIcon, StatusBadge } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireMember(slug);
  const where = { workspaceId: workspace.id };

  const [scheduled, publishedThisWeek, failed, drafts, upcoming, accounts, activity] = await Promise.all([
    db.post.count({ where: { ...where, status: "SCHEDULED" } }),
    db.postVariant.count({ where: { post: where, status: "PUBLISHED", publishedAt: { gte: startOfWeek(new Date()) } } }),
    db.post.count({ where: { ...where, status: { in: ["FAILED", "PARTIAL"] } } }),
    db.post.count({ where: { ...where, status: "DRAFT" } }),
    db.post.findMany({
      where: { ...where, status: "SCHEDULED" },
      orderBy: { scheduledAt: "asc" },
      take: 6,
      include: { variants: { include: { account: true } } },
    }),
    db.socialAccount.findMany({ where: { ...where, status: "CONNECTED" }, orderBy: { platform: "asc" } }),
    db.activity.findMany({ where, orderBy: { createdAt: "desc" }, take: 8, include: { user: true } }),
  ]);

  const stats = [
    { label: "Scheduled", value: scheduled, href: "posts?status=SCHEDULED" },
    { label: "Published this week", value: publishedThisWeek, href: "posts?status=PUBLISHED" },
    { label: "Need attention", value: failed, href: "posts?status=FAILED", alert: failed > 0 },
    { label: "Drafts", value: drafts, href: "posts?status=DRAFT" },
  ];

  return (
    <>
      <PageHeader
        title={workspace.name}
        description="What's going out, what went out, and what needs a look."
        action={hasRole(role, "EDITOR") && <Link href={`/w/${slug}/compose`} className="btn-primary">+ Create post</Link>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={`/w/${slug}/${s.href}`} className="card p-4 transition hover:border-indigo-300">
            <p className="text-sm text-zinc-500">{s.label}</p>
            <p className={`mt-1 text-3xl font-semibold tabular-nums ${s.alert ? "text-red-600" : ""}`}>{s.value}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-3 font-semibold">Up next</h2>
          {upcoming.length === 0 ? (
            <EmptyState title="Nothing scheduled" body="Schedule a post and it will show up here." href={hasRole(role, "EDITOR") ? `/w/${slug}/compose` : undefined} cta="Create post" />
          ) : (
            <ul className="card divide-y divide-zinc-100 dark:divide-zinc-800">
              {upcoming.map((p) => (
                <li key={p.id}>
                  <Link href={`/w/${slug}/compose?post=${p.id}`} className="flex items-center gap-4 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <div className="w-32 shrink-0 text-sm">
                      <p className="font-medium"><LocalTime date={p.scheduledAt} format="relative" /></p>
                      <p className="text-xs text-zinc-500"><LocalTime date={p.scheduledAt} /></p>
                    </div>
                    <p className="min-w-0 flex-1 truncate text-sm">{p.baseCaption || <span className="text-zinc-400">(no caption)</span>}</p>
                    <div className="flex -space-x-1">
                      {p.variants.map((v) => <PlatformIcon key={v.id} platform={v.account.platform as Platform} size={22} className="ring-2 ring-white dark:ring-zinc-900" />)}
                    </div>
                    <StatusBadge status={p.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Connected accounts</h2>
              <Link href={`/w/${slug}/accounts`} className="text-sm text-indigo-600 hover:underline">Manage</Link>
            </div>
            <div className="card p-4">
              {accounts.length === 0 ? (
                <p className="text-sm text-zinc-500">No accounts yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {accounts.map((a) => (
                    <li key={a.id} className="flex items-center gap-2.5 text-sm">
                      <PlatformIcon platform={a.platform as Platform} size={22} />
                      <span className="truncate">@{a.handle}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          <section>
            <h2 className="mb-3 font-semibold">Recent activity</h2>
            <ul className="card space-y-3 p-4 text-sm">
              {activity.length === 0 && <li className="text-zinc-500">No activity yet.</li>}
              {activity.map((a) => (
                <li key={a.id}>
                  <p>{a.message}</p>
                  <p className="text-xs text-zinc-500"><LocalTime date={a.createdAt} format="relative" /></p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
