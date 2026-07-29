import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 font-mono text-center">
      <p className="text-sm tracking-widest text-amber-500">AI_OS //</p>
      <h1 className="mt-2 text-6xl font-bold text-foreground sm:text-7xl">
        404
      </h1>
      <p className="mt-5 max-w-md text-sm leading-relaxed text-muted">
        this route doesn&apos;t exist — it may have been mistyped, moved, or
        never logged in the first place.
      </p>

      <Link
        href="/dashboard/overview"
        className="mt-10 inline-flex min-h-[44px] items-center justify-center rounded bg-amber-500 px-6 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 sm:min-h-0"
      >
        back to overview()
      </Link>
    </main>
  );
}
