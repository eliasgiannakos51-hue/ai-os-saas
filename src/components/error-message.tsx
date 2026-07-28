"use client";

import { useRouter } from "next/navigation";

export function ErrorMessage({ message }: { message: string }) {
  const router = useRouter();

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
      <span>error: {message}</span>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded border border-red-800 px-3 text-[11px] text-red-300 transition-colors hover:border-red-500 hover:text-red-100 sm:min-h-0 sm:py-1"
      >
        retry()
      </button>
    </div>
  );
}
