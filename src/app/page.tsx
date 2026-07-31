import Link from "next/link";
import type { Metadata } from "next";
import { DeletedAccountBanner } from "@/components/landing/deleted-account-banner";
import { GlowOrb } from "@/components/ui/glow-orb";
import { Logo } from "@/components/logo";

const TITLE = "Veron AI — One platform. Every AI capability.";
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
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 text-center">
      <GlowOrb className="left-1/2 top-0 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/3" />

      <div className="relative">
        <DeletedAccountBanner />

        <div className="mb-6 flex items-center justify-center">
          <Logo className="h-16 w-auto" />
        </div>

        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          One platform. Every AI capability.
        </h1>
        <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-muted">
          Create anything with AI. From ideas and research to trading,
          finance, product planning and business decisions — organized in
          one intelligent workspace.
        </p>

        <div className="mt-10 flex w-full max-w-xs flex-col gap-3 sm:mx-auto sm:w-auto sm:flex-row">
          <Link
            href="/login"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border px-6 py-2.5 text-sm font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 sm:min-h-0"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_20px_rgba(249,115,22,0.4)] sm:min-h-0"
          >
            Sign Up
          </Link>
        </div>

        <footer className="mt-16 flex flex-col items-center gap-2 border-t border-border pt-6 text-xs text-muted sm:flex-row sm:gap-4">
          <Link href="/pricing" className="transition-colors duration-150 hover:text-orange-400">
            Pricing
          </Link>
          <span className="hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <Link href="/roadmap" className="transition-colors duration-150 hover:text-orange-400">
            Roadmap
          </Link>
          <span className="hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <Link href="/terms" className="transition-colors duration-150 hover:text-orange-400">
            Terms of Service
          </Link>
          <span className="hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <Link href="/privacy" className="transition-colors duration-150 hover:text-orange-400">
            Privacy Policy
          </Link>
        </footer>
      </div>
    </main>
  );
}
