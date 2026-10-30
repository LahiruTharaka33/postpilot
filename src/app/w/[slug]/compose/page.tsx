import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { hasRole } from "@/lib/constants";
import { parseOptions, type Platform } from "@/lib/platforms";
import { PageHeader } from "@/components/ui";
import { Composer, type ComposerInitial } from "@/components/composer/Composer";
import type { ComposerMedia } from "@/components/composer/MediaUploader";

export default async function ComposePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ post?: string; date?: string }>;
}) {
  const { slug } = await params;
  const { post: postId, date } = await searchParams;
  const { workspace, role } = await requireMember(slug);

  const [accounts, recent] = await Promise.all([
    db.socialAccount.findMany({
      where: { workspaceId: workspace.id },
      // Only what the browser needs; never send tokens to the client.
      select: { id: true, platform: true, handle: true, displayName: true, avatarColor: true, status: true },
      orderBy: [{ platform: "asc" }, { handle: "asc" }],
    }),
    db.post.findMany({ where: { workspaceId: workspace.id }, select: { baseCaption: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  let initial: ComposerInitial | undefined;
  if (postId) {
    const post = await db.post.findFirst({ where: { id: postId, workspaceId: workspace.id }, include: { variants: true } });
    if (!post) notFound();
    const ids: string[] = JSON.parse(post.mediaIds);
    const rows = await db.media.findMany({ where: { id: { in: ids } } });
    initial = {
      postId: post.id,
      baseCaption: post.baseCaption,
      media: ids
        .map((id) => rows.find((r) => r.id === id))
        .filter((m) => m != null)
        .map((m) => ({ ...m, type: m.type as ComposerMedia["type"] })),
      scheduledAt: post.scheduledAt?.toISOString() ?? null,
      timezone: post.timezone,
      status: post.status,
      variants: post.variants.map((v) => ({
        accountId: v.accountId,
        caption: v.caption,
        options: parseOptions(v.options),
        scheduledAt: v.scheduledAt?.toISOString() ?? null,
        status: v.status,
        externalUrl: v.externalUrl,
        error: v.error,
      })),
    };
  }

  // Hashtags this workspace uses most, offered as one-click inserts.
  const counts = new Map<string, number>();
  for (const p of recent) for (const tag of p.baseCaption.match(/#[\p{L}\p{N}_]+/gu) ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const suggestedHashtags = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);

  return (
    <>
      <PageHeader title={initial ? "Edit post" : "Create post"} description="Write once, then fine-tune and preview each network." />
      <Composer
        slug={slug}
        accounts={accounts.map((a) => ({ ...a, platform: a.platform as Platform }))}
        initial={initial}
        defaultDate={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined}
        suggestedHashtags={suggestedHashtags}
        canEdit={hasRole(role, "EDITOR")}
      />
    </>
  );
}
