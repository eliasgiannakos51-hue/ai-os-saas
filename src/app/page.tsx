import Link from "next/link";
import type { Metadata } from "next";
import { DeletedAccountBanner } from "@/components/landing/deleted-account-banner";

const TITLE = "Nexa AI — One platform. Every AI capability.";
const DESCRIPTION =
  "Create anything with AI. From ideas and research to trading, finance, product planning and business decisions — organized in one intelligent workspace.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 font-mono text-center">
      <DeletedAccountBanner />
      <p className="text-sm tracking-widest text-amber-500">Nexa AI //</p>
      <h1 className="mt-2 text-4xl font-bold text-foreground sm:text-5xl">
        One platform. Every AI capability.
      </h1>
      <p className="mt-5 max-w-md text-sm leading-relaxed text-muted">
        Create anything with AI. From ideas and research to trading, finance,
        product planning and business decisions — organized in one
        intelligent workspace.
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
          className="inline-flex min-h-[44px] items-center justify-center rounded bg-amber-500 px-6 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(245,158,11,0.35)] sm:min-h-0"
        >
          sign_up()
        </Link>
      </div>

      <footer className="mt-16 flex flex-col items-center gap-2 border-t border-border pt-6 text-xs text-muted sm:flex-row sm:gap-4">
        <Link
          href="/pricing"
          className="transition-colors hover:text-amber-400"
        >
          pricing
        </Link>
        <span className="hidden sm:inline" aria-hidden="true">
          ·
        </span>
        <Link
          href="/terms"
          className="transition-colors hover:text-amber-400"
        >
          terms_of_service
        </Link>
        <span className="hidden sm:inline" aria-hidden="true">
          ·
        </span>
        <Link
          href="/privacy"
          className="transition-colors hover:text-amber-400"
        >
          privacy_policy
        </Link>
      </footer>
    </main>
  );
}
