import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_UPLOAD_BYTES, UPLOAD_EXTENSIONS } from "@/lib/media-types";
import { presignUpload, r2Config, workspacePrefix } from "@/lib/r2";
import { uploadWorkspace } from "@/lib/uploads";

const schema = z.object({ slug: z.string(), type: z.string(), size: z.number().int().positive() });

/** Step 1 of a direct upload: returns a URL the browser sends the file to, so it never passes through this server. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { slug, type, size } = parsed.data;

  const workspaceId = await uploadWorkspace(slug);
  if (!workspaceId) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const ext = UPLOAD_EXTENSIONS[type];
  if (!ext) return NextResponse.json({ error: `Unsupported file type ${type || "(unknown)"}` }, { status: 400 });
  if (size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "File is larger than 200 MB" }, { status: 400 });

  const config = r2Config();
  if (!config) {
    // A server's own disk doesn't survive restarts, so production must have R2.
    if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "File storage isn't set up" }, { status: 503 });
    return NextResponse.json({ mode: "server" });
  }
  const key = `${workspacePrefix(config, workspaceId)}${randomBytes(16).toString("hex")}.${ext}`;
  return NextResponse.json({ mode: "direct", key, url: await presignUpload(config, key, type, size) });
}
