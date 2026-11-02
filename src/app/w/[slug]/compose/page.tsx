import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { hasRole } from "@/lib/constants";
import { parseOptions, type Platform, type PlatformOptions } from "@/lib/platforms";
import { PageHeader } from "@/components/ui";
import { Composer, type BankSource, type ComposerInitial } from "@/components/composer/Composer";
import type { ComposerMedia } from "@/components/composer/MediaUploader";

/** Media rows in the given order, limited to this workspace. */
async function loadMedia(workspaceId: string, idsJson: string): Promise<ComposerMedia[]> {
  const ids: string[] = JSON.parse(idsJson);
  const rows = await db.media.findMany({ where: { workspaceId, id: { in: ids } } });
  return ids
    .map((id) => rows.find((r) => r.id === id))
    .filter((m) => m != null)
    .map((m) => ({ ...m, type: m.type as ComposerMedia["type"] }));
}

async function loadBankSource(workspaceId: string, bankId: string): Promise<BankSource> {
  const item = await db.bankPost.findFirst({ where: { id: bankId, workspaceId } });
  if (!item) notFound();
  return {
    bankId: item.id,
    title: item.title,
    baseCaption: item.baseCaption,
    media: await loadMedia(workspaceId, item.mediaIds),
    accountIds: JSON.parse(item.accountIds),
    custom: JSON.parse(item.custom) as Partial<Record<Platform, { caption: string | null; options: PlatformOptions }>>,
  };
}

export default async function ComposePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  /** post: edit a post. bank: edit a post bank item ("new" for a new one). from: start a post from a bank item. */
  searchParams: Promise<{ post?: string; date?: string; bank?: string; from?: string }>;
}) {
  const { slug } = await params;
  const { post: postId, date, bank, from } = await searchParams;
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
    initial = {
      postId: post.id,
      baseCaption: post.baseCaption,
      media: await loadMedia(workspace.id, post.mediaIds),
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

  const bankMode = !postId && !!bank;
  const sourceId = postId ? undefined : bankMode ? (bank === "new" ? undefined : bank) : from;
  const source = sourceId ? await loadBankSource(workspace.id, sourceId) : undefined;

  // Hashtags this workspace uses most, offered as one-click inserts.
  const counts = new Map<string, number>();
  for (const p of recent) for (const tag of p.baseCaption.match(/#[\p{L}\p{N}_]+/gu) ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const suggestedHashtags = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);

  const title = bankMode ? (source ? "Edit post bank item" : "New post bank item") : initial ? "Edit post" : "Create post";
  const description = bankMode
    ? "Save a post to reuse whenever you like. Nothing is scheduled."
    : "Write once, then fine-tune and preview each network.";

  return (
    <>
      <PageHeader title={title} description={description} />
      <Composer
        // A fresh composer for each item, so switching between them doesn't keep old content.
        key={postId ?? bank ?? from ?? "new"}
        slug={slug}
        accounts={accounts.map((a) => ({ ...a, platform: a.platform as Platform }))}
        initial={initial}
        bankMode={bankMode}
        source={source}
        defaultDate={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined}
        suggestedHashtags={suggestedHashtags}
        canEdit={hasRole(role, "EDITOR")}
      />
    </>
  );
}
