import { redirect } from "next/navigation";

export default async function WorkspaceIndex({ params }: { params: Promise<{ slug: string }> }) {
  redirect(`/w/${(await params).slug}/dashboard`);
}
