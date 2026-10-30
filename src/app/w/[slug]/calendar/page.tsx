import { addDays, addMonths, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { hasRole } from "@/lib/constants";
import type { Platform } from "@/lib/platforms";
import { rollupStatus } from "@/server/publisher";
import { PageHeader } from "@/components/ui";
import { CalendarView, type CalendarPost } from "@/components/CalendarView";

const include = {
  variants: { include: { account: { select: { id: true, platform: true, handle: true } } } },
} as const;

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ view?: string; date?: string; highlight?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { workspace, role } = await requireMember(slug);
  const view = sp.view === "week" ? "week" : "month";
  const anchor = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? new Date(`${sp.date}T12:00:00Z`) : new Date();

  // Load a padded range; the browser places posts in the viewer's own time zone.
  const from = addDays(view === "month" ? startOfWeek(startOfMonth(anchor)) : startOfWeek(anchor), -2);
  const to = addDays(view === "month" ? endOfWeek(endOfMonth(anchor)) : endOfWeek(anchor), 2);

  const [posts, drafts, accounts] = await Promise.all([
    db.post.findMany({
      // Any network of the post falls in range (networks can have different times).
      where: { workspaceId: workspace.id, variants: { some: { scheduledAt: { gte: from, lte: to } } } },
      include,
    }),
    db.post.findMany({
      where: { workspaceId: workspace.id, status: "DRAFT", scheduledAt: null },
      include,
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    db.socialAccount.findMany({ where: { workspaceId: workspace.id }, select: { id: true, platform: true, handle: true } }),
  ]);

  /** One calendar entry per distinct time within a post. */
  const toEntries = (p: (typeof posts)[number]): CalendarPost[] => {
    const groups = new Map<string, typeof p.variants>();
    for (const v of p.variants) {
      const k = v.scheduledAt?.toISOString() ?? "none";
      groups.set(k, [...(groups.get(k) ?? []), v]);
    }
    return [...groups.entries()].map(([k, vs]) => ({
      key: `${p.id}:${k}`,
      postId: p.id,
      variantIds: vs.map((v) => v.id),
      split: groups.size > 1,
      caption: p.baseCaption,
      status: rollupStatus(vs.map((v) => v.status)),
      scheduledAt: k === "none" ? null : k,
      accounts: vs.map((v) => ({ id: v.account.id, platform: v.account.platform as Platform, handle: v.account.handle })),
    }));
  };

  return (
    <>
      <PageHeader title="Calendar" description="Drag a post to another day to reschedule it. Click a day to plan a new post." />
      <CalendarView
        slug={slug}
        view={view}
        anchor={anchor.toISOString()}
        posts={posts
          .flatMap(toEntries)
          .filter((e) => e.scheduledAt && new Date(e.scheduledAt) >= from && new Date(e.scheduledAt) <= to)}
        drafts={drafts.filter((p) => p.variants.length > 0).map((p) => ({ ...toEntries(p)[0], key: `${p.id}:none`, variantIds: p.variants.map((v) => v.id), split: false }))}
        accounts={accounts.map((a) => ({ ...a, platform: a.platform as Platform }))}
        canEdit={hasRole(role, "EDITOR")}
        highlight={sp.highlight}
        prevDate={(view === "month" ? addMonths(anchor, -1) : addDays(anchor, -7)).toISOString().slice(0, 10)}
        nextDate={(view === "month" ? addMonths(anchor, 1) : addDays(anchor, 7)).toISOString().slice(0, 10)}
      />
    </>
  );
}
