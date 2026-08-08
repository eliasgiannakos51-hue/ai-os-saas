import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DeletedAccountBanner } from "@/components/landing/deleted-account-banner";
import { LandingDemo } from "@/components/landing/landing-demo";
import { GlowOrb } from "@/components/ui/glow-orb";
import { AppBackground } from "@/components/ui/app-background";
import { Logo } from "@/components/logo";

const TITLE = "Ionexa AI — Say what you want. Ionexa does it.";
const DESCRIPTION =
  "Ask for a website, a plan or an agent in plain words, and get the finished thing. One place instead of fourteen tabs.";

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

// WHAT THIS PAGE USED TO DO WRONG, and why every rule below exists.
//
// A tester read the old page and came away thinking Ionexa was "several
// LLMs in one place, cheaper". Not an unfair reading: the page was a
// centred logo, one abstract line, a paragraph listing nine nouns, and two
// buttons. Nothing on it showed the product doing anything, so the only
// mental model available to a visitor was the one they already had.
//
// So: the demo runs before anything is explained, every claim that can be
// shown is a picture of the real product instead of a sentence about it,
// the problem comes before the solution with a number and a source
// attached, and there is exactly ONE thing to click. No feature list, no
// "AI Operating System", no paragraph anywhere on the page.
//
// AND THE LAYOUT DOES NOT MOVE. The old hero was a shrink-to-fit flex item
// centred in the viewport, so its width was its own <h1>'s text width —
// which changes the instant the webfont swaps in. Measured on the shipped
// build: the whole block jumped 14px sideways ~880ms into the load. Here
// every section is `w-full` inside a fixed `max-w-*`, so no box anywhere
// is sized by the text inside it, every <img> carries its real
// width/height, and globals.css's "Inter Fallback" makes the pre-swap text
// occupy the same space as the post-swap text. Asserted at both viewport
// widths by scripts/tests/landing-stability.prodtest.mjs.

const SHOTS = [
  { key: "website", src: "/landing/website.webp", width: 720, height: 713 },
  { key: "agent", src: "/landing/agent.webp", width: 520, height: 605 },
  { key: "mission", src: "/landing/mission.webp", width: 720, height: 766 },
] as const;

const USE_CASES = ["founders", "businesses", "creators"] as const;

export default async function Home() {
  const t = await getTranslations("landing");

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-background">
      <AppBackground />

      {/* pr-28 clears GlobalControls, which is fixed at the top right of
          every public page (language + theme). Without it the log-in link
          sits underneath them at narrow widths. */}
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 pr-28 sm:px-6 sm:pr-32">
        <Logo className="h-10 w-auto" />
        <Link
          href="/login"
          className="text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground sm:text-sm"
        >
          {t("logIn")}
        </Link>
      </header>

      {/* ---------------------------------------------------------------
          Hero — headline, then the demo, then the one CTA.
          --------------------------------------------------------------- */}
      <section className="relative z-10 px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
        <GlowOrb className="left-1/2 top-0 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2" />
        <div className="relative mx-auto w-full max-w-3xl text-center">
          <DeletedAccountBanner />

          <h1 className="mx-auto w-full text-balance text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
            {t("hero")}
          </h1>
          <p className="mx-auto mt-4 w-full text-sm text-muted sm:text-base">{t("heroSub")}</p>

          <div className="mt-8">
            <LandingDemo />
          </div>

          {/* w-full inside a fixed max-width, never `w-auto`: a button
              that shrink-wraps its own label is sized by text metrics, so
              it moved 1px sideways the moment the webfont swapped in — the
              same defect as the old hero, three orders of magnitude
              smaller. Pinned so the CTA lands on the same pixel in every
              locale and in both font states. */}
          <div className="mt-8">
            <Link
              href="/signup"
              className="cta-amber mx-auto inline-flex min-h-[48px] w-full items-center justify-center rounded-xl px-8 py-3 text-base font-semibold text-black sm:max-w-[20rem]"
            >
              {t("cta")}
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          The problem, with a number and where the number came from.
          --------------------------------------------------------------- */}
      <section className="relative z-10 border-y border-border bg-panel/40 px-4 py-16 sm:px-6">
        <div className="mx-auto w-full max-w-3xl text-center">
          <h2 className="mx-auto w-full text-balance text-2xl font-bold leading-snug tracking-tight text-foreground sm:text-3xl">
            {t("problem.title")}
          </h2>

          <dl className="mx-auto mt-8 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
            {(["one", "two"] as const).map((n) => (
              <div key={n} className="rounded-2xl border border-border bg-panel p-5 text-left">
                <dt className="text-3xl font-bold tabular-nums text-orange-400 sm:text-4xl">
                  {t(`problem.stat${n === "one" ? "One" : "Two"}Value`)}
                </dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted">
                  {t(`problem.stat${n === "one" ? "One" : "Two"}Label`)}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 text-[11px] text-muted">{t("problem.source")}</p>

          <p className="mx-auto mt-10 w-full text-balance text-lg font-medium leading-relaxed text-foreground sm:text-xl">
            {t("problem.answer")}
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Proof — one picture of the real product, one sentence, each.
          --------------------------------------------------------------- */}
      <section className="relative z-10 px-4 py-16 sm:px-6">
        <div className="mx-auto w-full max-w-4xl space-y-16">
          {SHOTS.map((shot) => (
            <figure key={shot.key} className="w-full">
              <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-panel">
                {/* Plain <img> with the real intrinsic size, not next/image:
                    these are fixed, already-optimised WebP assets, and the
                    width/height pair is what lets the browser reserve the
                    box before a byte of image arrives. An image without
                    them is the classic second half of a jumping page. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={shot.src}
                  alt={t(`proof.${shot.key}.alt`)}
                  width={shot.width}
                  height={shot.height}
                  loading="lazy"
                  decoding="async"
                  className="h-auto w-full"
                />
                <span className="absolute right-3 top-3 rounded-full border border-border bg-background/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted backdrop-blur-sm">
                  {t("proof.exampleTag")}
                </span>
              </div>
              <figcaption className="mx-auto mt-5 w-full max-w-xl text-balance text-center text-base font-medium leading-relaxed text-foreground sm:text-lg">
                {t(`proof.${shot.key}.sentence`)}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Who it is for — so a visitor can point at their own row.
          --------------------------------------------------------------- */}
      <section className="relative z-10 border-t border-border px-4 py-16 sm:px-6">
        <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
          {USE_CASES.map((who) => (
            <div key={who} className="rounded-2xl border border-border bg-panel p-6">
              <h3 className="text-sm font-semibold text-orange-400">{t(`useCases.${who}.title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{t(`useCases.${who}.line`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------
          The same one CTA again, and nothing else.
          --------------------------------------------------------------- */}
      <section className="relative z-10 px-4 pb-20 pt-4 sm:px-6">
        <div className="mx-auto w-full max-w-3xl text-center">
          <p className="mx-auto w-full text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t("finalLine")}
          </p>
          <Link
            href="/signup"
            className="cta-amber mx-auto mt-7 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl px-8 py-3 text-base font-semibold text-black sm:max-w-[20rem]"
          >
            {t("cta")}
          </Link>
        </div>
      </section>

      {/* pb-24 keeps the footer clear of the cookie banner, which is fixed
          to the bottom of the viewport on every public page and used to sit
          straight over these links on a phone. */}
      <footer className="relative z-10 border-t border-border px-4 pb-24 pt-8 sm:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 text-xs text-muted sm:flex-row sm:justify-center sm:gap-5">
          <Link href="/pricing" className="transition-colors duration-150 hover:text-orange-400">
            {t("footer.pricing")}
          </Link>
          <Link href="/terms" className="transition-colors duration-150 hover:text-orange-400">
            {t("footer.terms")}
          </Link>
          <Link href="/privacy" className="transition-colors duration-150 hover:text-orange-400">
            {t("footer.privacy")}
          </Link>
        </div>
      </footer>
    </main>
  );
}
