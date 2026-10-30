import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasRole } from "@/lib/constants";
import { saveFile } from "@/lib/storage";

const MAX_BYTES = 200 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const slug = String(form.get("slug") ?? "");
  const membership = await db.membership.findFirst({ where: { userId: user.id, workspace: { slug } }, include: { workspace: true } });
  if (!membership || !hasRole(membership.role, "EDITOR")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: `Unsupported file type ${file.type || "(unknown)"}` }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is larger than 200 MB" }, { status: 400 });

  // Dimensions and duration are measured in the browser before upload.
  const width = Math.max(0, Math.round(Number(form.get("width")) || 0));
  const height = Math.max(0, Math.round(Number(form.get("height")) || 0));
  const duration = form.get("duration") ? Number(form.get("duration")) : null;

  const name = `${randomBytes(12).toString("hex")}.${ext}`;
  const url = await saveFile(name, Buffer.from(await file.arrayBuffer()));
  const media = await db.media.create({
    data: {
      workspaceId: membership.workspaceId,
      fileName: file.name.slice(0, 200),
      url,
      type: file.type.startsWith("video/") ? "VIDEO" : "IMAGE",
      mimeType: file.type,
      width,
      height,
      duration,
      size: file.size,
    },
  });
  return NextResponse.json(media);
}
