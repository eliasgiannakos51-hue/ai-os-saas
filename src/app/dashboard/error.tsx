"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 font-mono">
      <div className="w-full max-w-md rounded-md border border-red-900 bg-red-950/20 p-6 text-center">
        <p className="text-xs tracking-widest text-amber-500">AI_OS //</p>
        <h1 className="mt-2 text-lg font-bold text-foreground">
          something went wrong
        </h1>
        <p className="mt-2 break-words text-sm text-red-400">
          {error.message || "unexpected error"}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90"
        >
          retry()
        </button>
      </div>
    </main>
  );
}
