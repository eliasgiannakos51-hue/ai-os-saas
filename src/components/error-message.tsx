"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCw } from "lucide-react";

export function ErrorMessage({ message }: { message: string }) {
  const router = useRouter();

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-900/60 bg-red-500/5 px-4 py-3 text-xs text-red-400">
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" /> {message}
      </span>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-red-900/60 px-3 text-[11px] text-red-300 transition-colors duration-150 hover:border-red-500 hover:text-red-100 sm:min-h-0 sm:py-1"
      >
        <RotateCw className="h-4 w-4" /> Retry
      </button>
    </div>
  );
}
