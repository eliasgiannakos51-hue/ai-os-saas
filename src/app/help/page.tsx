import type { Metadata } from "next";
import { pageTitleAndDescription } from "@/lib/page-title";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LifeBuoy, ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { AppBackground } from "@/components/ui/app-background";
import { articlesByCategory } from "@/lib/support/knowledge-base";
import { loadHelpArticles, type HelpArticle } from "@/lib/support/help-articles";
import { getLocale } from "next-intl/server";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleAndDescription("sidebar.items.help", "pageTitle.helpDescription");
}

// The Help Centre.
//
// Same 27 articles the chat answers from (lib/support/knowledge-base.ts),
// rendered as a page. That shared source is the point: a help page and a
// support bot that answer the same question differently is worse than
// having only one of them, and it is what happens the moment the two are
// maintained separately.
//
// PUBLIC, and deliberately not behind /dashboard. Half of these questions
// — what does it cost, what are credits, is my data safe, what is this —
// are asked BEFORE anyone signs up, and an answer you have to create an
// account to read is not an answer.
//
// NOT PER-USER. Nothing here varies by account — that is enforced
// upstream: a question containing any first-person marker never reaches a
// canned answer at all.
//
// This used to say the page was therefore STATIC, prerendered once at
// build time. It is not, and never was: `next build` lists /help as ƒ
// (Dynamic), like every other route in this app, because the root layout
// resolves the locale from a cookie and reading a cookie opts the whole
// route out of static rendering. The claim mattered because it was the
// stated reason not to await anything here.
//
// NO NUMBERS. Not one article states a price, a credit cost or an
// allowance — those live in lib/billing/plans.ts and on /pricing, they
// change, and a stale number here is a quote a customer will hold us to.
// Every money question links out instead. The knowledge base's own test
// enforces this with a digit scan.

// Category order — most-asked first, not alphabetical. Someone opening
// this page is far more likely to be here about money than about
// integrations.
const CATEGORY_ORDER = [
  "getting-started",
  "billing",
  "credits",
  "websites",
  "agents",
  "missions",
  "chat",
  "files",
  "integrations",
  "account",
  "privacy",
] as const;

// CATEGORY_TITLES used to be right here, hardcoded in Greek. Nothing in
// the repo could see it: check-i18n.js reads messages/*.json and these
// were never there, and the bare-text scanner skips any string with no
// Latin letters — which is every Greek one. They are in the catalogue
// now, under helpCentre.categories, in all ten locales.


function Article({
  article,
  goThere,
  fallbackNotice,
}: {
  article: HelpArticle;
  goThere: string;
  fallbackNotice: string;
}) {
  return (
    // id, so every answer has its own link. Support replies point at a
    // specific answer, not at "the help page, scroll down".
    <article id={article.slug} className="scroll-mt-24 rounded-2xl border border-border bg-panel/60 p-4">
      {/* THE FALLBACK IS SAID OUT LOUD. A reader who asked for Spanish and
          got English is told so, and the text carries lang="en" so a screen
          reader switches voice rather than reading English words with
          Spanish phonetics. Serving another language silently is precisely
          how the original bug — a Greek-only Help Centre shown to ten
          locales — survived: it looked like content, not like a gap. */}
      {article.isFallback && (
        <p className="mb-2 inline-flex rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted/80">
          {fallbackNotice}
        </p>
      )}
      <div lang={article.locale}>
        <h3 className="text-sm font-semibold text-foreground">{article.title}</h3>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{article.body}</p>
      </div>
      {article.href && (
        <Link
          href={article.href}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-orange-400 transition-colors duration-150 hover:text-orange-300"
        >
          {goThere}
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      )}
    </article>
  );
}

export default async function HelpPage() {
  // The ARTICLES on this page are Greek-only (see the knowledge base) —
  // but the landmark label is navigation chrome, not content, and a
  // screen reader announcing a Greek landmark to a French user helps
  // nobody. Awaiting a translation costs nothing here: every route in
  // this app is already server-rendered on demand, because the root
  // layout resolves the locale from a cookie.
  const tCommon = await getTranslations("common");
  const t = await getTranslations("helpCentre");
  const locale = await getLocale();
  // Read in the reader's language, English filling any gap. An empty
  // result (no database reachable, or the seed not run) renders the page
  // with no articles rather than throwing — a Help Centre that 500s is
  // worse than one that is briefly empty.
  const articles = await loadHelpArticles(locale);
  const byCategory = articlesByCategory(articles);
  // Driven off the real categories rather than the hardcoded list, so an
  // article in a category nobody remembered to order still renders —
  // silently dropping an answer would be the worst failure this page has.
  const ordered = [
    ...CATEGORY_ORDER.filter((c) => byCategory.has(c)),
    ...[...byCategory.keys()].filter((c) => !CATEGORY_ORDER.includes(c as (typeof CATEGORY_ORDER)[number])),
  ];

  return (
    <div className="relative min-h-screen">
      <AppBackground />
      <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <header className="mb-8">
          <Link href="/" className="inline-block">
            <Logo />
          </Link>
          <h1 className="mt-6 flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <LifeBuoy className="h-6 w-6 text-orange-400" aria-hidden="true" />
            {t("title")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {t("intro")}
          </p>
        </header>

        {/* A contents list, because 27 answers is more than a page you can
            scan. Anchors match the article ids. */}
        <nav aria-label={tCommon("categories")} className="mb-8 flex flex-wrap gap-2">
          {ordered.map((category) => (
            <a
              key={category}
              href={`#category-${category}`}
              className="inline-flex min-h-[44px] items-center rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-colors duration-150 hover:border-orange-500/40 hover:text-foreground"
            >
              {t.has(`categories.${category}`) ? t(`categories.${category}`) : category}
            </a>
          ))}
        </nav>

        <div className="space-y-10">
          {ordered.map((category) => (
            <section key={category} id={`category-${category}`} className="scroll-mt-24 space-y-3">
              <h2 className="text-base font-semibold text-foreground">
                {t.has(`categories.${category}`) ? t(`categories.${category}`) : category}
              </h2>
              {(byCategory.get(category) ?? []).map((article) => (
                <Article
                  key={article.slug}
                  article={article}
                  goThere={t("goThere")}
                  fallbackNotice={t("shownInEnglish")}
                />
              ))}
            </section>
          ))}
        </div>

        <footer className="mt-12 rounded-2xl border border-border bg-panel/60 p-4">
          <h2 className="text-sm font-semibold text-foreground">{t("notFoundTitle")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {t("notFoundBody")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/dashboard/chat"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90"
            >
              {t("openChat")}
            </Link>
            <Link
              href="/pricing"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground"
            >
              {t("pricingLink")}
            </Link>
          </div>
          <p className="mt-3 text-[11px] text-muted/70">
            {t("answerCount", { count: articles.length })}
          </p>
        </footer>
      </div>
    </div>
  );
}
