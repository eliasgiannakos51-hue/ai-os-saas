import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Bot, CheckCircle2, Circle, Globe, ListChecks, Mail } from "lucide-react";
import { DeletedAccountBanner } from "@/components/landing/deleted-account-banner";
import { DemoWidget } from "@/components/landing/demo-widget";
import { GlowOrb } from "@/components/ui/glow-orb";
import { AppBackground } from "@/components/ui/app-background";
import { Logo } from "@/components/logo";

const TITLE = "Ionexa AI — Tell it what you need. It builds it.";
const DESCRIPTION =
  "Type what you want — a website, a research report, a plan — and watch it get built, published and delivered. Try it on the page, no signup.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    // siteName has to be repeated here: Next.js REPLACES the whole
    // openGraph object when a page declares one, it does not merge it
    // field-by-field with the root layout's.
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

/**
 * The landing page, rebuilt around one design rule: SHOW, don't
 * describe. A real tester read the old feature-list page as "many LLMs
 * in one, cheaper" — a category error the page invited by talking about
 * capabilities instead of outcomes. So:
 *
 *   - The hero is an eight-word claim plus a WORKING demo. A visitor
 *     types what they want and sees a real AI-generated preview before
 *     any signup (api/demo/preview: FAST tier, 5/hr per IP).
 *   - The problem comes before the solution, with numbers.
 *   - Three "product moment" panels each show ONE real user action —
 *     an agent delivering its morning report, a site going live at a
 *     real URL, a goal broken into steps — as stylised product UI
 *     built from the app's own design system, not prose.
 *   - ONE call to action, straight to email+password (?plan=free skips
 *     the plan screen; nothing is asked before the user has seen value).
 *     "Log in" survives only as a quiet top-right text link.
 */
export default async function Home() {
  const t = await getTranslations("landing");
  const v = await getTranslations("landing.v2");

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <AppBackground />
      <GlowOrb className="left-1/2 top-0 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/3" />

      <div className="relative z-10 mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        {/* Top bar: logo + the ONLY secondary link. */}
        <header className="flex items-center justify-between py-5">
          <Logo className="h-9 w-auto" />
          <Link
            href="/login"
            className="text-sm text-muted transition-colors duration-150 hover:text-orange-400"
          >
            {t("logIn")}
          </Link>
        </header>

        <DeletedAccountBanner />

        {/* Hero + live demo */}
        <section className="pt-10 text-center sm:pt-16">
          <h1 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {v("headline")}
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted">{v("subline")}</p>
          <div className="mt-8">
            <DemoWidget />
          </div>
        </section>

        {/* The problem, before the solution — with numbers. */}
        <section className="mt-20 rounded-2xl border border-border bg-panel/50 p-6 text-center">
          <p className="text-base font-semibold text-foreground">{v("problem.line1")}</p>
          <p className="mt-1 text-sm text-muted">{v("problem.line2")}</p>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-foreground/85">
            {v("problem.solution")}
          </p>
        </section>

        {/* Three product moments. Each panel is ONE real user action,
            drawn as product UI in the app's own design system. */}
        <section className="mt-16 space-y-10">
          {/* Moment 1: an agent runs and the report lands in your inbox */}
          <div className="grid items-center gap-6 sm:grid-cols-2">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{v("moments.agent.title")}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{v("moments.agent.caption")}</p>
            </div>
            <div className="rounded-2xl border border-border bg-panel/70 p-4" aria-hidden="true">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Bot className="h-4 w-4 text-orange-400" />
                <span className="font-medium">{v("moments.agent.name")}</span>
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 px-2 py-0.5 text-[10px] text-emerald-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  {v("moments.agent.status")}
                </span>
              </div>
              <div className="mt-3 rounded-xl border border-border bg-input p-3 text-xs text-foreground/85">
                <div className="flex items-center gap-2 text-muted">
                  <Mail className="h-3.5 w-3.5" />
                  {v("moments.agent.inboxLine")}
                </div>
                <p className="mt-2 leading-relaxed">{v("moments.agent.reportLine")}</p>
              </div>
            </div>
          </div>

          {/* Moment 2: a website goes live at a real URL */}
          <div className="grid items-center gap-6 sm:grid-cols-2">
            <div className="order-1 sm:order-2">
              <h2 className="text-lg font-semibold text-foreground">{v("moments.website.title")}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{v("moments.website.caption")}</p>
            </div>
            <div className="order-2 rounded-2xl border border-border bg-panel/70 p-4 sm:order-1" aria-hidden="true">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-1.5 text-xs text-muted">
                <Globe className="h-3.5 w-3.5" />
                <span className="truncate">maria-bakery.ionexa.site</span>
                <span className="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  {v("moments.website.live")}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="h-16 rounded-lg bg-gradient-to-r from-orange-500/25 to-amber-400/15" />
                <div className="grid grid-cols-3 gap-2">
                  <div className="h-8 rounded-md bg-input" />
                  <div className="h-8 rounded-md bg-input" />
                  <div className="h-8 rounded-md bg-input" />
                </div>
              </div>
            </div>
          </div>

          {/* Moment 3: a goal becomes steps */}
          <div className="grid items-center gap-6 sm:grid-cols-2">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{v("moments.mission.title")}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{v("moments.mission.caption")}</p>
            </div>
            <div className="rounded-2xl border border-border bg-panel/70 p-4" aria-hidden="true">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ListChecks className="h-4 w-4 text-orange-400" />
                {v("moments.mission.goal")}
              </div>
              <ul className="mt-3 space-y-2 text-xs">
                {([1, 2, 3, 4] as const).map((i) => {
                  const done = i <= 2;
                  return (
                    <li key={i} className="flex items-center gap-2">
                      {done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 shrink-0 text-muted" />
                      )}
                      <span className={done ? "text-muted line-through" : "text-foreground/85"}>
                        {v(`moments.mission.step${i}`)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* The one CTA. */}
        <section className="mt-20 text-center">
          <h2 className="text-2xl font-bold text-foreground">{v("cta.title")}</h2>
          <Link
            href="/signup?plan=free"
            className="cta-amber mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl px-8 text-sm font-semibold text-black"
          >
            {v("cta.button")}
          </Link>
          <p className="mt-3 text-[11px] text-muted">{v("cta.note")}</p>
        </section>

        <footer className="mt-16 flex flex-col items-center gap-2 border-t border-border pt-6 text-xs text-muted sm:flex-row sm:justify-center sm:gap-4">
          <Link href="/pricing" className="transition-colors duration-150 hover:text-orange-400">
            {t("footer.pricing")}
          </Link>
          <span className="hidden sm:inline" aria-hidden="true">·</span>
          <Link href="/roadmap" className="transition-colors duration-150 hover:text-orange-400">
            {t("footer.roadmap")}
          </Link>
          <span className="hidden sm:inline" aria-hidden="true">·</span>
          <Link href="/terms" className="transition-colors duration-150 hover:text-orange-400">
            {t("footer.terms")}
          </Link>
          <span className="hidden sm:inline" aria-hidden="true">·</span>
          <Link href="/privacy" className="transition-colors duration-150 hover:text-orange-400">
            {t("footer.privacy")}
          </Link>
          <span className="hidden sm:inline" aria-hidden="true">·</span>
          <Link href="/contact" className="transition-colors duration-150 hover:text-orange-400">
            {t("footer.contact")}
          </Link>
        </footer>
      </div>
    </main>
  );
}
