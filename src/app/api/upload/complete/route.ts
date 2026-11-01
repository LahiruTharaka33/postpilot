import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { MAX_UPLOAD_BYTES, UPLOAD_EXTENSIONS, mediaKind } from "@/lib/media-types";
import { deleteObject, headObject, publicUrl, r2Config, workspacePrefix } from "@/lib/r2";
import { uploadWorkspace } from "@/lib/uploads";

const schema = z.object({
  slug: z.string(),
  key: z.string(),
  fileName: z.string(),
  width: z.number().min(0),
  height: z.number().min(0),
  duration: z.number().min(0).nullable(),
});

/** Step 2 of a direct upload: checks the file arrived as promised and records it. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { slug, key, fileName, width, height, duration } = parsed.data;

  const workspaceId = await uploadWorkspace(slug);
  if (!workspaceId) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const config = r2Config();
  if (!config) return NextResponse.json({ error: "File storage isn't set up" }, { status: 503 });
  // A workspace can only claim files under its own prefix.
  if (!key.startsWith(workspacePrefix(config, workspaceId))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const object = await headObject(config, key).catch(() => null);
  if (!object) return NextResponse.json({ error: "The upload didn't arrive" }, { status: 400 });
  if (object.size > MAX_UPLOAD_BYTES || !UPLOAD_EXTENSIONS[object.contentType]) {
    await deleteObject(config, key).catch((e) => console.error("[upload] could not delete rejected file", key, e));
    return NextResponse.json({ error: "That file isn't allowed" }, { status: 400 });
  }

  const media = await db.media.create({
    data: {
      workspaceId,
      fileName: fileName.slice(0, 200),
      url: publicUrl(config, key),
      type: mediaKind(object.contentType),
      mimeType: object.contentType,
      // Dimensions and duration are measured in the browser before upload.
      width: Math.round(width),
      height: Math.round(height),
      duration,
      size: object.size,
    },
  });
  return NextResponse.json(media);
}
