"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deletePost, duplicatePost, retryPost, unschedulePost } from "@/app/actions/posts";

export function PostActions({ slug, postId, status }: { slug: string; postId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });
  const editable = ["DRAFT", "SCHEDULED", "FAILED"].includes(status);

  return (
    <div className="flex flex-wrap gap-1.5">
      {["FAILED", "PARTIAL"].includes(status) && (
        <button className="btn-primary px-2.5 py-1 text-xs" disabled={pending} onClick={() => run(() => retryPost(slug, postId))}>
          Retry
        </button>
      )}
      {editable && <Link href={`/w/${slug}/compose?post=${postId}`} className="btn-secondary px-2.5 py-1 text-xs">Edit</Link>}
      {status === "SCHEDULED" && (
        <button className="btn-secondary px-2.5 py-1 text-xs" disabled={pending} onClick={() => run(() => unschedulePost(slug, postId))}>
          Unschedule
        </button>
      )}
      <button
        className="btn-secondary px-2.5 py-1 text-xs"
        disabled={pending}
        onClick={() => start(async () => { const id = await duplicatePost(slug, postId); router.push(`/w/${slug}/compose?post=${id}`); })}
      >
        Duplicate
      </button>
      <button
        className="btn-danger px-2.5 py-1 text-xs"
        disabled={pending || status === "PUBLISHING"}
        onClick={() => confirm("Delete this post? This can't be undone.") && run(() => deletePost(slug, postId))}
      >
        Delete
      </button>
    </div>
  );
}
