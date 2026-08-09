import { getTranslations, getLocale } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { TrendingUp } from "lucide-react";
import { formatNumber } from "@/lib/format-number";
import {
  aggregateMarginRows,
  MARGIN_REPORT_WINDOW_DAYS,
  MARGIN_TARGET,
  type MarginFeatureRow,
  type MarginLogRow,
} from "@/lib/billing/margin-report";

/**
 * Trailing-30-day achieved margin per feature, read from ai_cost_log.
 *
 * Owner-only, and enforced by the CALLER passing isAdmin — this component
 * reads with the service-role client because the question is "what is the
 * margin across the whole platform", not "what did this one account
 * spend". Rendering it for a normal user would leak other customers'
 * spend, so it must never be mounted without that check.
 *
 * Averages the STORED achieved_margin rather than recomputing it: the
 * multiplier configured at the time of each action is what that action was
 * actually priced at, and a later change to CREDIT_MARGIN_MULTIPLIER must
 * not silently rewrite history.
 */
export async function MarginReport() {
  let rows: MarginFeatureRow[] = [];
  let failed = false;

  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - MARGIN_REPORT_WINDOW_DAYS * 86_400_000).toISOString();

    const { data, error } = await admin
      .from("ai_cost_log")
      // metadata too: a bypass row stores achieved_margin = null by
      // design, and the owner's own account IS a bypass account — so
      // without it every row in this table read "—". See
      // hypotheticalMargin in lib/billing/margin-report.ts.
      .select("feature, achieved_margin, real_cost_eur, metadata")
      .gte("created_at", since)
      .limit(20000);

    if (error) throw error;

    rows = aggregateMarginRows((data ?? []) as MarginLogRow[]);
  } catch (err) {
    logApiError("settings:MarginReport", err);
    failed = true;
  }

  return <MarginReportView rows={rows} failed={failed} />;
}

/**
 * Presentation half, split out so the table can be rendered from fixtures
 * without a database — the data path and the markup fail in different ways
 * and are worth being able to exercise separately.
 */
export async function MarginReportView({
  rows,
  failed,
}: {
  rows: MarginFeatureRow[];
  failed: boolean;
}) {
  const t = await getTranslations("settings.marginReport");
  const locale = await getLocale();

  return (
    <section id="margin-report" className="mb-6 rounded-2xl border border-border bg-panel p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <TrendingUp className="h-4 w-4 text-orange-400" aria-hidden="true" />
        {t("title")}
        <span className="rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-400">
          {t("ownerOnly")}
        </span>
      </h2>
      <p className="mt-2 text-xs text-muted">{t("description", { days: MARGIN_REPORT_WINDOW_DAYS })}</p>

      {failed ? (
        <p className="mt-4 text-xs text-red-400">{t("unavailable")}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-xs text-muted">{t("empty")}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="pb-2 pr-3 font-medium">{t("colFeature")}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t("colCalls")}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t("colMargin")}</th>
                <th className="pb-2 text-right font-medium">{t("colCost")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-3 text-foreground">{row.feature}</td>
                  <td className="py-2 pr-3 text-right text-muted">{formatNumber(row.calls, locale)}</td>
                  <td className="py-2 pr-3 text-right">
                    {row.averageMargin === null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span
                        className={
                          // Below target is the number worth spotting at a
                          // glance; that is the entire reason this table
                          // exists rather than a single aggregate figure.
                          row.averageMargin < MARGIN_TARGET
                            ? "font-semibold text-red-400"
                            : "text-emerald-400"
                        }
                      >
                        {row.averageMargin.toFixed(2)}x
                        {/* A margin computed from a charge nobody paid is
                            a different claim from one computed on real
                            revenue, and the table has to say which. */}
                        {row.hypotheticalCalls > 0 && (
                          <span
                            className="ml-1 font-normal text-muted"
                            title={t("hypotheticalHint")}
                          >
                            *
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right text-muted">€{row.totalCostEur.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* The footnote is not decoration: without it a reader would take
          every number in the column as achieved revenue, and on an
          owner's own account most of them are not. */}
      {rows.some((r) => r.hypotheticalCalls > 0) && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted">{t("hypotheticalNote")}</p>
      )}
    </section>
  );
}
