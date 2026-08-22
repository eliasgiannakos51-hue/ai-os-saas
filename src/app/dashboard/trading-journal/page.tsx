import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { pageTitle } from "@/lib/page-title";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { TradingDisclaimer } from "@/components/trading/trading-disclaimer";
import { JournalStats } from "@/components/trading/journal-stats";
import { RuleEditor } from "@/components/trading/rule-editor";
import { loadJournal } from "@/lib/trading/load";
import { computeStats, equityCurve, statsByInstrument, statsBySession, afterLossPattern } from "@/lib/trading/stats";
import { evaluate, summarise } from "@/lib/trading/guardian";
import { TRADING_WORKFLOW_ICON } from "@/lib/module-icons";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("dashboard.trading.title");
}

export const dynamic = "force-dynamic";

/**
 * THE TRADING JOURNAL AND THE STRATEGY GUARDIAN (V4 #14).
 *
 * EVERYTHING ON THIS PAGE IS ARITHMETIC over trades the user recorded and
 * rules the user wrote. No model is called to produce any number here,
 * which is what makes "you broke this rule 8 times" checkable one trade
 * at a time.
 *
 * THE GUARDIAN RUNS ON EVERY LOAD rather than reading rule_violations.
 * Evaluation is deterministic and cheap (it is a loop over at most 2,000
 * trades), and computing it live means a rule edited a moment ago is
 * reflected immediately instead of after a background job somebody has to
 * remember to trigger. The table exists for history and for reports over
 * a window; the screen does not depend on it being fresh.
 *
 * THE DISCLAIMER IS MOUNTED FIRST and is not dismissible — rule 5, and
 * scripts/tests/trading-journal.test.mjs fails the build if a surface
 * reading this data omits it.
 */
export default async function TradingJournalPage({
  searchParams,
}: {
  searchParams: { account?: string };
}) {
  const t = await getTranslations("dashboard.trading");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const accountId = searchParams.account ?? null;
  const { trades, rules, accounts } = await loadJournal(supabase, { accountId });

  const account = accounts.find((a) => a.id === accountId) ?? null;
  const startingBalance = account?.startingBalance ?? null;
  const currency = account?.currency ?? "EUR";

  const stats = computeStats(trades, startingBalance);
  const curve = equityCurve(trades, startingBalance);
  const guardian = evaluate(trades, rules, { startingBalance });
  const violations = summarise(guardian.violations);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <PageHeader icon={TRADING_WORKFLOW_ICON} title={t("title")} description={t("subtitle")} />

      {/* RULE 5. First thing on the page, before a single number. */}
      <TradingDisclaimer variant="block" />

      {accounts.length > 0 && (
        <nav className="mb-5 flex flex-wrap gap-2 text-xs" aria-label={t("accounts.title")}>
          <Link
            href="/dashboard/trading-journal"
            className={`inline-flex min-h-[36px] items-center rounded-full border px-3 py-1.5 transition-colors ${
              accountId === null
                ? "border-orange-500/60 bg-orange-500/10 text-orange-400"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {t("accounts.all")}
          </Link>
          {accounts.map((a) => (
            <Link
              key={a.id}
              href={`/dashboard/trading-journal?account=${encodeURIComponent(a.id)}`}
              className={`inline-flex min-h-[36px] items-center rounded-full border px-3 py-1.5 transition-colors ${
                accountId === a.id
                  ? "border-orange-500/60 bg-orange-500/10 text-orange-400"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {a.name}
            </Link>
          ))}
        </nav>
      )}

      {trades.length === 0 ? (
        <p className="rounded-2xl border border-border bg-panel/60 p-5 text-sm text-muted">
          {t("empty")}{" "}
          <Link href="/dashboard/trading" className="text-orange-400 underline">
            {t("emptyCta")}
          </Link>
        </p>
      ) : (
        <div className="space-y-6">
          <JournalStats
            stats={stats}
            byInstrument={statsByInstrument(trades)}
            bySession={statsBySession(trades)}
            curve={curve}
            pattern={afterLossPattern(trades)}
            currency={currency}
          />

          <RuleEditor
            rules={rules.map((r) => ({
              id: r.id,
              originalText: r.originalText,
              kind: r.params.kind,
              isActive: r.isActive,
            }))}
            violations={violations}
            accountId={accountId}
          />

          {/* WHAT COULD NOT BE CHECKED, said out loud. A rule that
              silently skipped half the trades would report a clean record
              somebody had not earned. */}
          {guardian.uncheckable.length > 0 && (
            <p className="text-[11px] leading-relaxed text-muted">
              {t("violations.uncheckable", { count: guardian.uncheckable.length })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
