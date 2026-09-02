import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

/**
 * THE HEADING WAS THE KEY, ON EVERY LEGAL PAGE, IN EVERY LANGUAGE.
 *
 * This component took `title: string` and rendered `{title}`. Its three
 * callers passed "terms_of_service", "privacy_policy", "cookie_policy" —
 * and production served, verbatim:
 *
 *     <h1 class="mt-4 text-2xl font-bold ...">privacy_policy</h1>
 *
 * Measured, not inferred: curl against the deployment on 2026-09-02.
 * Every one of the three has been doing it since the pages were written,
 * and it survived because the METADATA was correct — generateMetadata()
 * goes through pageTitleAndDescription("landing.footer.privacy", …), so
 * the browser tab said "Privacy — Ionexa AI" while the page itself said
 * privacy_policy. Anybody checking the tab saw a translated title.
 *
 * So the prop is now a KEY and this component resolves it. The keys that
 * already name these pages are the footer's own (landing.footer.*), which
 * is the same choice lib/page-title.ts made and for the same reason: the
 * link you clicked and the heading you land on cannot then drift apart.
 *
 * ------------------------------------------------------------------
 * THE BANNER IS NOT UNIVERSAL, AND THAT MATTERS LEGALLY
 * ------------------------------------------------------------------
 *
 * "This is placeholder text for early development, not reviewed legal
 * copy" is true of the terms, the privacy policy, the cookie policy and
 * the acceptable-use policy. It is NOT true of /ai-transparency, and
 * putting it there would be worse than putting nothing there.
 *
 * That page is not draft contractual prose. It is a factual description
 * of which models run and what they are given, published because Article
 * 50 of the EU AI Act requires it. A disclosure that opens by disclaiming
 * itself as unreviewed placeholder is not a disclosure — it invites the
 * reader to discount the one thing they are supposed to be able to rely
 * on. So `notice` selects, and `factual` says what is actually true of
 * that page: it was checked against the code, on the date above.
 */
export async function LegalLayout({
  titleKey,
  updated,
  notice = "draft",
  children,
}: {
  /** A full dotted catalogue path, e.g. "landing.footer.privacy". */
  titleKey: string;
  updated: string;
  notice?: "draft" | "factual";
  children: ReactNode;
}) {
  const t = await getTranslations();

  return (
    <main className="min-h-screen bg-background px-4 py-12 text-foreground sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="text-sm tracking-widest text-orange-500 transition-colors hover:text-orange-400"
        >
          Ionexa AI
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">
          {t(titleKey)}
        </h1>
        <p className="mt-2 text-xs text-muted">
          {t("legal.lastUpdated", { date: updated })}
        </p>

        {notice === "draft" ? (
          <div className="mt-4 rounded border border-orange-900 bg-orange-950/20 px-4 py-3 text-xs leading-relaxed text-orange-200/80">
            {t("legal.draftNotice")}
          </div>
        ) : (
          <div className="mt-4 rounded border border-border bg-input px-4 py-3 text-xs leading-relaxed text-muted">
            {t("legal.factualNotice")}
          </div>
        )}

        <div className="mt-10 space-y-8">{children}</div>

        <div className="mt-12 border-t border-border pt-6">
          <Link
            href="/"
            className="text-xs tracking-wide text-orange-500 underline underline-offset-2"
          >
            {t("legal.backHome")}
          </Link>
        </div>
      </div>
    </main>
  );
}
