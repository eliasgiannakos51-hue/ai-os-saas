import Link from "next/link";
import type { ReactNode } from "react";

export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background px-4 py-12 font-mono text-foreground sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="text-sm tracking-widest text-amber-500 transition-colors hover:text-amber-400"
        >
          AI_OS //
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-xs text-muted">last updated: {updated}</p>

        <div className="mt-4 rounded border border-amber-900 bg-amber-950/20 px-4 py-3 text-xs leading-relaxed text-amber-200/80">
          This is placeholder text for early development, not reviewed legal
          copy. It will be replaced with the real thing before AI_OS is
          offered to real users.
        </div>

        <div className="mt-10 space-y-8">{children}</div>

        <div className="mt-12 border-t border-border pt-6">
          <Link
            href="/"
            className="text-xs text-amber-500 underline underline-offset-2"
          >
            ← back to AI_OS
          </Link>
        </div>
      </div>
    </main>
  );
}
