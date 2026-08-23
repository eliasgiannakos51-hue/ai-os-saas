import { getTranslations, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";
import { monthlyRecurringRevenue } from "@/lib/billing/monthly-revenue";
import { logApiError } from "@/lib/log-error";
import { TrendingUp, AlertTriangle } from "lucide-react";
import { formatNumber } from "@/lib/format-number";
import { sendMarginAlertEmail } from "@/lib/email/margin-alert";
import {
  aggregateMarginRows,
  aggregateCacheRows,
  summariseCacheReport,
  effectiveMargin,
  summariseMarginReport,
  ABSORBED_REFUSAL_REVENUE_LIMIT,
  MARGIN_REPORT_WINDOW_DAYS,
  MARGIN_TARGET,
  type MarginFeatureRow,
  type MarginLogRow,
  type MarginSummary,
  type CacheFeatureRow,
  type CacheSummary,
} from "@/lib/billing/margin-report";

/**
 * Trailing-30-day margin per feature, read from ai_cost_log.
 *
 * OWNER-ONLY, AND IT CHECKS THAT ITSELF.
 *
 * It used to rely entirely on the caller writing `{isAdmin && <MarginReport/>}`.
 * That was a real server-side gate — this is a Server Component, so an
 * un-rendered component sends nothing to the browser and there is no API
 * endpoint to curl. But the guarantee lived in the CALLER, one line away
 * from the data, and the failure mode is silent: render this anywhere
 * without remembering the gate and every customer's platform-wide spend
 * ships to that page. A component that reads with the service-role client
 * has to own its own access control.
 *
 * So the check is here, on the same lines as the query it protects. The
 * caller's gate stays as well — two independent checks, neither relying on
 * the other.
 */
export async function MarginReport() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Renders NOTHING for anyone else — not an error, not an empty panel,
  // not a "you don't have access" box. A non-owner should not learn that
  // this exists.
  if (!user || !isAdminEmail(user.email)) return null;

  let rows: MarginFeatureRow[] = [];
  let cacheRows: CacheFeatureRow[] = [];
  let revenue: number | null = null;
  let failed = false;

  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - MARGIN_REPORT_WINDOW_DAYS * 86_400_000).toISOString();

    const { data, error } = await admin
      .from("ai_cost_log")
      // metadata and credits_charged as well as the margin: a bypass row
      // stores achieved_margin = null BY DESIGN, and the owner's own
      // account IS a bypass account — so without these the whole table
      // read "—" beside real euros of spend.
      // The three token columns feed the prompt-cache panel. They have
      // been written by every settlement since the baseline schema and
      // were never read by anything — which is why a caching change could
      // not be checked against reality until now.
      .select(
        "feature, achieved_margin, real_cost_eur, credits_charged, metadata, input_tokens, cache_read_tokens, cache_write_tokens"
      )
      .gte("created_at", since)
      .limit(20000);

    if (error) throw error;

    const logRows = (data ?? []) as MarginLogRow[];
    rows = aggregateMarginRows(logRows);
    cacheRows = aggregateCacheRows(logRows);

    // THE DENOMINATOR THAT WAS MISSING. absorbedRefusals.shareOfRevenue
    // has read null since the day it was added, because there was no way
    // to ask what monthly revenue is — subscription_tier lives in
    // auth.users.raw_user_meta_data and nothing aggregated it. The
    // mrr_inputs() function does now (see the 20260823 migration), and
    // lib/billing/monthly-revenue.ts turns its counts into euros.
    //
    // AN INCOMPLETE FIGURE IS NOT PASSED. A revenue number missing the
    // enterprise tier is too SMALL, which makes every share computed
    // against it too BIG — and the first thing this share decides is
    // whether a business assumption has broken. Null with a stated
    // reason beats a confident wrong percentage.
    const { data: mrrRows, error: mrrError } = await admin.rpc("mrr_inputs", {});
    if (mrrError) throw mrrError;
    const rev = monthlyRecurringRevenue(
      ((mrrRows ?? []) as Record<string, unknown>[]).map((r) => ({
        tier: String(r.tier ?? ""),
        billingInterval: String(r.billing_interval ?? "month"),
        subscribers: Number(r.subscribers ?? 0),
        seats: Number(r.seats ?? 0),
      }))
    );
    revenue = rev.complete && rev.eur > 0 ? rev.eur : null;
  } catch (err) {
    logApiError("settings:MarginReport", err);
    failed = true;
  }

  const summary = summariseMarginReport(rows, { monthlyRevenueEur: revenue });

  // A shortfall that only exists on a page nobody has open is a shortfall
  // that keeps costing money. settleReservation alerts per settlement;
  // this alerts on the 30-day AVERAGE, which is a different signal — one
  // cheap action can settle above target while the feature's average sits
  // below it.
  for (const below of summary.belowTarget) {
    const row = rows.find((r) => r.feature === below.feature);
    void sendMarginAlertEmail({
      feature: below.feature,
      creditsCharged: row?.chargedCredits ?? 0,
      realCostUsd: 0,
      realCostEur: row?.totalCostEur ?? 0,
      achievedMargin: below.margin,
      targetMargin: MARGIN_TARGET,
      planSlug: null,
      effectiveCreditPriceEur: 0,
      reason: below.hypothetical
        ? `30-day PROJECTED average is ${below.margin.toFixed(2)}x (no charged actions for this feature — computed from wouldHaveChargedCredits)`
        : `30-day charged average is ${below.margin.toFixed(2)}x`,
    });
  }

  return (
    <MarginReportView rows={rows} summary={summary} cacheRows={cacheRows} failed={failed} />
  );
}

/** A number that might not exist, rendered so a missing one is never
 *  mistaken for zero. */
function Margin({ value, projected = false }: { value: number | null; projected?: boolean }) {
  if (value === null) return <span className="text-muted">—</span>;
  return (
    <span
      className={value < MARGIN_TARGET ? "font-semibold text-red-400" : "text-emerald-400"}
    >
      {value.toFixed(2)}x{projected && <span className="ml-0.5 font-normal text-muted">*</span>}
    </span>
  );
}

function SummaryTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-input p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-muted/80">{hint}</p>}
    </div>
  );
}

/**
 * Presentation half, split out so the table can be rendered from fixtures
 * without a database — the data path and the markup fail in different ways
 * and are worth being able to exercise separately.
 */
export async function MarginReportView({
  rows,
  summary,
  cacheRows = [],
  failed,
}: {
  rows: MarginFeatureRow[];
  summary: MarginSummary;
  /** Defaulted so existing fixture renders of this view keep working —
   *  the cache panel simply does not appear when nothing is passed. */
  cacheRows?: CacheFeatureRow[];
  failed: boolean;
}) {
  const t = await getTranslations("settings.marginReport");
  const locale = await getLocale();
  const cacheSummary: CacheSummary = summariseCacheReport(cacheRows);

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
        <>
          {/* THE SUMMARY. Four numbers that answer "is this viable", above
              a table that answers "where is the problem". Without them the
              only way to know total spend was to add up a column by eye. */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryTile label={t("sumCost")} value={`€${summary.totalCostEur.toFixed(4)}`} />
            <SummaryTile
              label={t("sumCredits")}
              value={formatNumber(summary.totalChargedCredits + summary.totalWouldBeCredits, locale)}
              hint={
                summary.totalWouldBeCredits > 0
                  ? t("sumCreditsHint", {
                      charged: formatNumber(summary.totalChargedCredits, locale),
                      wouldBe: formatNumber(summary.totalWouldBeCredits, locale),
                    })
                  : undefined
              }
            />
            <SummaryTile
              label={t("sumMargin")}
              value={summary.overallMargin === null ? "—" : `${summary.overallMargin.toFixed(2)}x`}
              hint={t("sumMarginHint")}
            />
            <SummaryTile
              label={t("sumTop")}
              value={summary.topFeature ? summary.topFeature.feature : "—"}
              hint={
                summary.topFeature
                  ? t("sumTopHint", { percent: (summary.topFeature.share * 100).toFixed(0) })
                  : undefined
              }
            />
          </div>

          {/* "—" everywhere with no explanation was the original complaint.
              When nothing charged, say so in words rather than leaving a
              column of dashes to be interpreted. */}
          {summary.projectionOnly && (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/[0.05] px-3 py-2 text-[11px] leading-relaxed text-orange-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              {t("projectionOnly")}
            </p>
          )}

          {/* ABSORBED REFUSALS, on their own line rather than buried in the
              table. A refused agent run charges nothing and costs us the
              tokens it burned before refusing; that is a deliberate
              absorption, not a pricing fault, and reading it as one row
              among twenty is how a deliberate cost turns into an
              unexamined one. */}
          {summary.absorbedRefusals && (
            <p
              className={`mt-3 flex items-start gap-1.5 rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
                summary.absorbedRefusals.overBudget
                  ? "border-red-800 bg-red-950/30 text-red-300"
                  : "border-border bg-panel/60 text-muted"
              }`}
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              <span>
                {t("absorbedRefusals", {
                  calls: summary.absorbedRefusals.calls,
                  cost: summary.absorbedRefusals.costEur.toFixed(2),
                })}{" "}
                {summary.absorbedRefusals.shareOfRevenue === null
                  ? t("absorbedRefusalsShareUnknown")
                  : t("absorbedRefusalsShare", {
                      share: (summary.absorbedRefusals.shareOfRevenue * 100).toFixed(2),
                      limit: (ABSORBED_REFUSAL_REVENUE_LIMIT * 100).toFixed(0),
                    })}
              </span>
            </p>
          )}

          {summary.belowTarget.length > 0 && (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-red-800 bg-red-950/30 px-3 py-2 text-[11px] leading-relaxed text-red-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              {t("belowTargetAlert", {
                count: summary.belowTarget.length,
                features: summary.belowTarget.map((b) => b.feature).join(", "),
                target: MARGIN_TARGET,
              })}
            </p>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="pb-2 pr-3 font-medium">{t("colFeature")}</th>
                  <th className="pb-2 pr-3 text-right font-medium">{t("colCalls")}</th>
                  <th className="pb-2 pr-3 text-right font-medium">{t("colCharged")}</th>
                  <th className="pb-2 pr-3 text-right font-medium">{t("colBypass")}</th>
                  <th className="pb-2 pr-3 text-right font-medium">{t("colMarginCharged")}</th>
                  <th className="pb-2 pr-3 text-right font-medium">{t("colMarginWouldBe")}</th>
                  <th className="pb-2 text-right font-medium">{t("colCost")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const { margin, hypothetical } = effectiveMargin(row);
                  const flagged = margin !== null && margin < MARGIN_TARGET;
                  return (
                    <tr
                      key={row.feature}
                      className={`border-b border-border/50 last:border-0 ${flagged ? "bg-red-950/20" : ""}`}
                    >
                      <td className="py-2 pr-3 text-foreground">{row.feature}</td>
                      <td className="py-2 pr-3 text-right text-muted">{formatNumber(row.calls, locale)}</td>
                      <td className="py-2 pr-3 text-right text-muted">{formatNumber(row.chargedCalls, locale)}</td>
                      <td className="py-2 pr-3 text-right text-muted">{formatNumber(row.bypassCalls, locale)}</td>
                      <td className="py-2 pr-3 text-right">
                        <Margin value={row.chargedMargin} />
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <Margin value={row.wouldBeMargin} projected />
                      </td>
                      <td className="py-2 text-right text-muted">€{row.totalCostEur.toFixed(4)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Not decoration: without it a reader takes every number in the
              would-be column as achieved revenue. */}
          {rows.some((r) => r.wouldBeMargin !== null) && (
            <p className="mt-3 text-[11px] leading-relaxed text-muted">{t("hypotheticalNote")}</p>
          )}

          {/* THE PROMPT CACHE PANEL.
              Caching is the one optimisation whose success and failure look
              identical from the outside: Anthropic does not error on a
              prefix too short to cache, or on a breakpoint sitting on
              content that changes every request. It just returns zeros. So
              the only honest way to claim caching works is to show the
              measured share of prompt tokens that came back from cache. */}
          <div className="mt-6 border-t border-border pt-4">
            <h3 className="text-xs font-semibold text-foreground">{t("cacheTitle")}</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{t("cacheDescription")}</p>

            {cacheSummary.hitRate === null ? (
              <p className="mt-3 text-xs text-muted">{t("cacheEmpty")}</p>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <SummaryTile
                    label={t("cacheHitRate")}
                    value={`${(cacheSummary.hitRate * 100).toFixed(1)}%`}
                  />
                  <SummaryTile
                    label={t("cacheColRead")}
                    value={formatNumber(cacheSummary.cacheReadTokens, locale)}
                  />
                  <SummaryTile
                    label={t("cacheColWrite")}
                    value={formatNumber(cacheSummary.cacheWriteTokens, locale)}
                  />
                  <SummaryTile
                    label={t("cacheColInput")}
                    value={formatNumber(cacheSummary.inputTokens, locale)}
                  />
                </div>

                {/* Writing without reading is WORSE than not caching: the
                    1.25x write premium is paid on every call and nothing is
                    ever served back. Named features, so the fix has an
                    address. */}
                {cacheSummary.miscached.length > 0 && (
                  <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-red-800 bg-red-950/30 px-3 py-2 text-[11px] leading-relaxed text-red-300">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    {t("cacheMiscachedAlert", { features: cacheSummary.miscached.join(", ") })}
                  </p>
                )}

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted">
                        <th className="pb-2 font-medium">{t("colFeature")}</th>
                        <th className="pb-2 pr-3 text-right font-medium">{t("cacheHitRate")}</th>
                        <th className="pb-2 pr-3 text-right font-medium">{t("cacheColRead")}</th>
                        <th className="pb-2 pr-3 text-right font-medium">{t("cacheColWrite")}</th>
                        <th className="pb-2 text-right font-medium">{t("cacheColInput")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cacheRows.map((row) => (
                        <tr
                          key={row.feature}
                          className={`border-b border-border/50 last:border-0 ${row.writingWithoutReading ? "bg-red-950/20" : ""}`}
                        >
                          <td className="py-2 pr-3 text-foreground">{row.feature}</td>
                          <td className="py-2 pr-3 text-right">
                            {row.hitRate === null ? (
                              <span className="text-muted">—</span>
                            ) : (
                              <span className={row.hitRate > 0 ? "text-emerald-400" : "text-muted"}>
                                {(row.hitRate * 100).toFixed(1)}%
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right text-muted">
                            {formatNumber(row.cacheReadTokens, locale)}
                          </td>
                          <td className="py-2 pr-3 text-right text-muted">
                            {formatNumber(row.cacheWriteTokens, locale)}
                          </td>
                          <td className="py-2 text-right text-muted">
                            {formatNumber(row.inputTokens, locale)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
