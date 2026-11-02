"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteBankPost } from "@/app/actions/bank";

export function BankActions({ slug, bankId, title }: { slug: string; bankId: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      <Link href={`/w/${slug}/compose?from=${bankId}`} className="btn-primary px-3 py-1.5 text-xs">
        Use
      </Link>
      <Link href={`/w/${slug}/compose?bank=${bankId}`} className="btn-secondary px-3 py-1.5 text-xs">
        Edit
      </Link>
      <button
        className="btn-danger ml-auto px-3 py-1.5 text-xs"
        disabled={pending}
        onClick={() =>
          confirm(`Delete "${title}" from the post bank? Posts already made from it aren't affected.`) &&
          start(async () => {
            await deleteBankPost(slug, bankId);
            router.refresh();
          })
        }
      >
        Delete
      </button>
    </div>
  );
}
