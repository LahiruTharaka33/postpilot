import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

/** Local disk storage. Swap for S3 or similar by keeping the same two functions. */
const ROOT = path.join(process.cwd(), "uploads");

export async function saveFile(name: string, data: Buffer) {
  await mkdir(ROOT, { recursive: true });
  await writeFile(path.join(ROOT, name), data);
  return `/api/media/${name}`;
}

export async function readStoredFile(name: string) {
  if (!/^[\w-]+\.\w+$/.test(name)) return null;
  try {
    return await readFile(path.join(ROOT, name));
  } catch {
    return null;
  }
}
