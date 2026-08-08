import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = {
  title: "Offline",
  description: "You are offline.",
};

// The last-resort page the service worker serves when a navigation fails
// and nothing for that URL is cached (see public/sw.js).
//
// Deliberately static and dependency-free: it has to render from cache
// with no network, no session and no data fetch, so it cannot use
// translations loaded at request time or any server component that reads
// Supabase. Plain English for the same reason — the locale it would need
// lives behind a request this page exists precisely because it failed.
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/10 text-orange-400">
          <WifiOff className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
        <p className="mt-3 text-sm text-muted">
          Ionexa needs a connection to load new data. Pages you already opened
          are still available from this device&apos;s cache — and anything you
          were working on is safe on the server.
        </p>
        <Link
          href="/dashboard/overview"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-400"
        >
          Try again
        </Link>
      </div>
    </main>
  );
}
