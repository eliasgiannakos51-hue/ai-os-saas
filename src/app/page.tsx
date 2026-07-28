import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI_OS — your personal AI operating system",
  description:
    "Log ideas, track metrics, and run every part of your business from one dark, terminal-styled dashboard.",
};

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 font-mono text-center">
      <p className="text-sm tracking-widest text-amber-500">AI_OS //</p>
      <h1 className="mt-2 text-4xl font-bold text-foreground sm:text-5xl">
        AI_OS
      </h1>
      <p className="mt-5 max-w-md text-sm leading-relaxed text-muted">
        your personal AI operating system — ideas, metrics, and every part of
        your business, run from one dark terminal-styled dashboard.
      </p>

      <div className="mt-10 flex w-full max-w-xs flex-col gap-3 sm:w-auto sm:flex-row">
        <Link
          href="/login"
          className="inline-flex min-h-[44px] items-center justify-center rounded border border-border px-6 py-2 text-sm text-foreground transition-colors hover:border-amber-500 hover:text-amber-400 sm:min-h-0"
        >
          login()
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-[44px] items-center justify-center rounded bg-amber-500 px-6 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 sm:min-h-0"
        >
          sign_up()
        </Link>
      </div>
    </main>
  );
}
