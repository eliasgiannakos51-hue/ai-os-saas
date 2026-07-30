import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "404 Not Found",
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <p className="text-sm tracking-widest text-orange-500">Veron AI //</p>
      <h1 className="mt-2 text-6xl font-bold text-foreground sm:text-7xl">
        404
      </h1>
      <p className="mt-5 max-w-md text-sm leading-relaxed text-muted">
        this route doesn&apos;t exist — it may have been mistyped, moved, or
        never logged in the first place.
      </p>

      <Link
        href="/dashboard/overview"
        className="mt-10 inline-flex min-h-[44px] items-center justify-center rounded bg-orange-500 px-6 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] sm:min-h-0"
      >
        back to overview()
      </Link>
    </main>
  );
}
