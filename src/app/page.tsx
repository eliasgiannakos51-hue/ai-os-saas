import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DeletedAccountBanner } from "@/components/landing/deleted-account-banner";
import { GlowOrb } from "@/components/ui/glow-orb";
import { AppBackground } from "@/components/ui/app-background";
import { Logo } from "@/components/logo";

const TITLE = "Ionexa AI — Your business, organized with AI that actually helps.";
const DESCRIPTION =
  "Track ideas, finance, trading, research, decisions and more — all in one place, with an AI assistant that understands your data and helps you think it through.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    // siteName has to be repeated here: Next.js REPLACES the whole
    // openGraph object when a page declares one, it does not merge it
    // field-by-field with the root layout's. Without this line the
    // landing page — the one page a share sheet or a browser is most
    // likely to read — ships no og:site_name at all, which is part of
    // why the app was surfacing as the deployment host on mobile.
    siteName: "Ionexa AI",
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

export default async function Home() {
  const t = await getTranslations("landing");

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 text-center">
      {/* Same rotating wireframe globe used on /login and /signup (see
          auth-background.tsx) — the landing page previously only had
          GlowOrb's warm accent glow, which read as a different, less
          striking background than the auth pages right next to it.
          GlowOrb stays layered on top as a subtle color accent near the
          hero; the globe sits behind everything. */}
      <AppBackground />
      <GlowOrb className="left-1/2 top-0 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/3" />

      <div className="relative z-10">
        <DeletedAccountBanner />

        <div className="mb-6 flex items-center justify-center">
          <Logo className="h-16 w-auto" />
        </div>

        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          {t("hero")}
        </h1>
        <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-muted">
          {t("description")}
        </p>

        <div className="mt-10 flex w-full max-w-xs flex-col gap-3 sm:mx-auto sm:w-auto sm:flex-row">
          <Link
            href="/login"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border px-6 py-2.5 text-sm font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 sm:min-h-0"
          >
            {t("logIn")}
          </Link>
          <Link
            href="/signup"
            className="cta-amber inline-flex min-h-[44px] items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold text-black sm:min-h-0"
          >
            {t("signUp")}
          </Link>
        </div>

        <footer className="mt-16 flex flex-col items-center gap-2 border-t border-border pt-6 text-xs text-muted sm:flex-row sm:gap-4">
          <Link href="/pricing" className="transition-colors duration-150 hover:text-orange-400">
            {t("footer.pricing")}
          </Link>
          <span className="hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <Link href="/roadmap" className="transition-colors duration-150 hover:text-orange-400">
            {t("footer.roadmap")}
          </Link>
          <span className="hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <Link href="/terms" className="transition-colors duration-150 hover:text-orange-400">
            {t("footer.terms")}
          </Link>
          <span className="hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <Link href="/privacy" className="transition-colors duration-150 hover:text-orange-400">
            {t("footer.privacy")}
          </Link>
        </footer>
      </div>
    </main>
  );
}
