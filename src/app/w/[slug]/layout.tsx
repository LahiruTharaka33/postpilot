import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, role } = await requireMember(slug);
  const memberships = await db.membership.findMany({
    where: { userId: user.id },
    include: { workspace: { select: { slug: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return (
    <div className="min-h-screen">
      <Sidebar slug={slug} workspaces={memberships.map((m) => m.workspace)} user={user} role={role} />
      <main className="px-4 py-6 sm:px-6 lg:ml-64 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
