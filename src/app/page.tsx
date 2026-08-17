import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DeletedAccountBanner } from "@/components/landing/deleted-account-banner";
import { GlowOrb } from "@/components/ui/glow-orb";
import { AppBackground } from "@/components/ui/app-background";
import { Logo } from "@/components/logo";

// The landing page's title and description are the SAME sentences the
// page itself renders (landing.hero / landing.description) rather than a
// second English copy of them kept in this file. That copy was how a
// Greek visitor could read a Greek hero under a tab that said "Your
// business, organized with AI that actually helps." — and how the share
// card said it too.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing");
  const title = `Ionexa AI — ${t("hero")}`;
  const description = t("description");

  return {
    title: { absolute: title },
    description,
    openGraph: {
      // siteName has to be repeated here: Next.js REPLACES the whole
      // openGraph object when a page declares one, it does not merge it
      // field-by-field with the root layout's. Without this line the
      // landing page — the one page a share sheet or a browser is most
      // likely to read — ships no og:site_name at all, which is part of
      // why the app was surfacing as the deployment host on mobile.
      siteName: "Ionexa AI",
      title,
      description,
      type: "website",
      url: "/",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

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

        {/* CENTRED AT EVERY WIDTH, and it was centred at none.
            `sm:mx-auto` meant that below 640px a `w-full max-w-xs` block —
            320px wide — was never centred: it sat at the container's left
            padding with the remainder on the right. Measured at 375px:
            16px on the left, 39px on the right. At 414px: 16 and 78.
            From `sm` up it was wrong for the opposite reason. The parent
            (`relative z-10`) has no width, so `sm:w-auto` on a flex
            container inside a block resolves to the full parent width —
            `mx-auto` then has nothing to centre, and the row's default
            `justify-start` pinned both buttons to the left edge of the
            <h1>. Measured at 1280px: 480px on the left, 596px on the
            right, on a pair only 204px wide.
            So: `mx-auto` unconditionally for the narrow case, and
            `justify-center` for the wide one. Held by
            scripts/tests/landing-alignment.prodtest.mjs at five widths. */}
        <div className="mx-auto mt-10 flex w-full max-w-xs flex-col justify-center gap-3 sm:max-w-none sm:flex-row">
          <Link
            href="/login"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border px-6 py-2.5 text-sm font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400"
          >
            {t("logIn")}
          </Link>
          <Link
            href="/signup"
            className="cta-amber inline-flex min-h-[44px] items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold text-black"
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
          <span className="hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <Link href="/cookies" className="transition-colors duration-150 hover:text-orange-400">
            {t("footer.cookies")}
          </Link>
        </footer>
      </div>
    </main>
  );
}
