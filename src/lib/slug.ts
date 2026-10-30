import { db } from "./db";

export function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .slice(0, 40) || "workspace"
  );
}

export async function uniqueSlug(name: string) {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; await db.workspace.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  return slug;
}
