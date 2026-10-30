import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { hasRole } from "@/lib/constants";
import { PageHeader } from "@/components/ui";
import { TeamManager } from "@/components/TeamManager";

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role, user } = await requireMember(slug);
  const members = await db.membership.findMany({
    where: { workspaceId: workspace.id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return (
    <>
      <PageHeader title="Team & settings" description={`People who can work on ${workspace.name}.`} />
      <TeamManager slug={slug} members={members} currentUserId={user.id} canManage={hasRole(role, "OWNER")} />
    </>
  );
}
