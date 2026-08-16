import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { LifeBuoy, ArrowRight, Languages } from "lucide-react";
import { Logo } from "@/components/logo";
import { AppBackground } from "@/components/ui/app-background";
import { loadHelpArticles, type HelpArticle } from "@/lib/support/help-articles";

export const metadata: Metadata = {
  title: "Help Centre",
  description:
    "Answers to the questions people ask most about Ionexa AI — pricing, credits, websites, agents, privacy.",
};

// The Help Centre.
//
// Same articles the chat answers from, rendered as a page. That shared
// source is the point: a help page and a support bot that answer the same
// question differently is worse than having only one of them.
//
// WHAT CHANGED. The articles used to be a Greek array in
// lib/support/knowledge-base.ts, served to all ten locales — a Japanese
// reader opening this page got Greek. They now come from help_articles,
// one row per (slug, locale), English as the base, and a missing
// translation falls back to English WITH A VISIBLE MARKER rather than
// silently.
//
// PUBLIC, and deliberately not behind /dashboard. Half of these questions
// — what does it cost, what are credits, is my data safe, what is this —
// are asked BEFORE anyone signs up, and an answer you have to create an
// account to read is not an answer. The table's RLS policy allows anon
// reads of published rows for exactly this reason.
//
// NOT PER-USER. Nothing here varies by account — that is enforced
// upstream: a question containing any first-person marker never reaches a
// canned answer at all.
//
// NO NUMBERS. Not one article states a price, a credit cost or an
// allowance — those live in lib/billing/plans.ts and on /pricing, they
// change, and a stale number here is a quote a customer will hold us to.
// The seed generator refuses to emit an article containing a digit.

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
    <article
      id={article.slug}
      className="scroll-mt-24 rounded-2xl border border-border bg-panel/60 p-4"
    >
      <h3 className="text-sm font-semibold text-foreground">{article.title}</h3>

      {/* The reader is entitled to know they are reading a different
          language from the one they chose. lang= as well as the notice,
          so a screen reader switches voice instead of reading English
          words with Greek or Japanese phonetics. */}
      {article.isFallback && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-panel/80 px-2 py-1 text-[11px] text-muted/80">
          <Languages className="h-3 w-3 shrink-0" aria-hidden="true" />
          {fallbackNotice}
        </p>
      )}

      <p
        lang={article.isFallback ? article.locale : undefined}
        className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted"
      >
        {article.body}
      </p>

      {article.href && (
        <Link
          href={article.href}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-orange-400 transition-colors duration-150 hover:text-orange-300"
        >
          {goThere}
          <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
        </Link>
      )}
    </article>
  );
}

export default async function HelpPage() {
  const locale = await getLocale();
  const t = await getTranslations("help");
  const articles = await loadHelpArticles(locale);

  if (!articles || articles.length === 0) {
    // An empty page with a heading would read as "there is no help".
    // Saying the page could not load, and pointing at the two places that
    // still work, is the honest version.
    return (
      <div className="relative min-h-screen">
        <AppBackground />
        <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
          <Link href="/" className="inline-block">
            <Logo />
          </Link>
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground">
            {t("unavailableTitle")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{t("unavailableBody")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/dashboard/chat"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90"
            >
              {t("openChat")}
            </Link>
            <Link
              href="/pricing"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground"
            >
              {t("pricingLink")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Grouped in the order loadHelpArticles already sorted them, so a
  // category nobody remembered to rank still renders (at the end) rather
  // than being silently dropped — losing an answer is the worst failure
  // this page has.
  const grouped: Array<{ category: string; items: HelpArticle[] }> = [];
  for (const article of articles) {
    const last = grouped[grouped.length - 1];
    if (last && last.category === article.category) last.items.push(article);
    else grouped.push({ category: article.category, items: [article] });
  }

  const goThere = t("goThere");
  const fallbackNotice = t("fallbackNotice");
  const categoryTitle = (c: string) => {
    // A category the catalogue has no name for prints its own key rather
    // than throwing — an unnamed section still shows its answers.
    try {
      return t(`categories.${c}` as never);
    } catch {
      return c;
    }
  };

  return (
    <div className="relative min-h-screen">
      <AppBackground />
      <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <header className="mb-8">
          <Link href="/" className="inline-block">
            <Logo />
          </Link>
          <h1 className="mt-6 flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <LifeBuoy className="h-6 w-6 shrink-0 text-orange-400" aria-hidden="true" />
            {t("title")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{t("intro")}</p>
        </header>

        <nav aria-label={t("contents")} className="mb-8 flex flex-wrap gap-2">
          {grouped.map(({ category }) => (
            <a
              key={category}
              href={`#category-${category}`}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-colors duration-150 hover:border-orange-500/40 hover:text-foreground"
            >
              {categoryTitle(category)}
            </a>
          ))}
        </nav>

        <div className="space-y-10">
          {grouped.map(({ category, items }) => (
            <section key={category} id={`category-${category}`} className="scroll-mt-24 space-y-3">
              <h2 className="text-base font-semibold text-foreground">{categoryTitle(category)}</h2>
              {items.map((article) => (
                <Article
                  key={article.slug}
                  article={article}
                  goThere={goThere}
                  fallbackNotice={fallbackNotice}
                />
              ))}
            </section>
          ))}
        </div>

        <footer className="mt-12 rounded-2xl border border-border bg-panel/60 p-4">
          <h2 className="text-sm font-semibold text-foreground">{t("notFoundTitle")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{t("notFoundBody")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/dashboard/chat"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90"
            >
              {t("openChat")}
            </Link>
            <Link
              href="/pricing"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground"
            >
              {t("pricingLink")}
            </Link>
          </div>
          <p className="mt-3 text-[11px] text-muted/70">{t("answerCount", { count: articles.length })}</p>
        </footer>
      </div>
    </div>
  );
}
