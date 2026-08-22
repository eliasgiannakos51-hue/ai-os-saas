"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatNumber } from "@/lib/format-number";
import type { Bucket, TradingStats, EquityPoint, AfterLossPattern } from "@/lib/trading/stats";

/**
 * THE NUMBERS, AND THE ABSENCES.
 *
 * Every figure here can be null, and a null is rendered as a SENTENCE
 * explaining why rather than as a dash. "Not enough trades yet (5
 * needed)" tells somebody what to do; "—" tells them the product is
 * broken. That distinction is most of what makes a statistics screen
 * trustworthy on a small sample, which is every trader's first month.
 *
 * NOTHING HERE IS FORWARD-LOOKING. There is no projection, no target, no
 * "at this rate you would". Every number describes trades that have
 * already happened.
 */

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | null;
  hint?: string;
  tone?: "good" | "bad";
}) {
  const t = useTranslations("dashboard.trading");
  return (
    <div className="rounded-xl border border-border bg-panel px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      {value === null ? (
        <p className="mt-0.5 text-[11px] leading-snug text-muted">{hint ?? t("stats.notEnough")}</p>
      ) : (
        <p
          className={`mt-0.5 text-lg font-semibold tabular-nums ${
            tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : "text-foreground"
          }`}
        >
          {value}
        </p>
      )}
    </div>
  );
}

export function JournalStats({
  stats,
  byInstrument,
  bySession,
  curve,
  pattern,
  currency,
}: {
  stats: TradingStats;
  byInstrument: Bucket[];
  bySession: Bucket[];
  curve: EquityPoint[];
  pattern: AfterLossPattern;
  currency: string;
}) {
  const t = useTranslations("dashboard.trading");
  const locale = useLocale();
  const money = (v: number | null) =>
    v === null ? null : `${formatNumber(Math.round(v * 100) / 100, locale)} ${currency}`;
  const percent = (v: number | null) =>
    v === null ? null : `${formatNumber(Math.round(v * 10) / 10, locale)}%`;

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Figure label={t("stats.trades")} value={formatNumber(stats.counted, locale)} />
        <Figure label={t("stats.winRate")} value={percent(stats.winRatePercent)} />
        <Figure
          label={t("stats.netPnl")}
          value={money(stats.netPnl)}
          tone={stats.netPnl > 0 ? "good" : stats.netPnl < 0 ? "bad" : undefined}
        />
        <Figure label={t("stats.profitFactor")}
          value={stats.profitFactor === null ? null : formatNumber(Math.round(stats.profitFactor * 100) / 100, locale)}
          hint={t("stats.noLosses")} />
        <Figure label={t("stats.avgWin")} value={money(stats.avgWin)} />
        <Figure label={t("stats.avgLoss")} value={money(stats.avgLoss)} />
        <Figure
          label={t("stats.maxDrawdown")}
          value={
            stats.maxDrawdownPercent !== null
              ? `${money(stats.maxDrawdown)} (${percent(stats.maxDrawdownPercent)})`
              : money(stats.maxDrawdown)
          }
        />
        <Figure
          label={t("stats.avgDuration")}
          value={stats.avgDurationSeconds === null ? null : formatDuration(stats.avgDurationSeconds, locale)}
        />
      </section>

      {/* WHETHER THESE FIGURES INCLUDE COSTS, said out loud. A profit
          factor before commission and one after are different numbers,
          and a trader comparing ours with their broker's needs to know
          which they are looking at. */}
      <p className="text-[11px] text-muted">
        {stats.netOfCommission ? t("stats.afterCosts") : t("stats.beforeCosts")}
        {stats.unscoreable > 0 && ` · ${t("stats.unscoreable", { count: stats.unscoreable })}`}
      </p>

      {curve.length > 1 && <EquityCurve points={curve} />}

      {/* THE PATTERN. An observation with its baseline beside it — a win
          rate after a loss means nothing without the ordinary one. */}
      <section className="rounded-2xl border border-border bg-panel/60 p-4">
        <h3 className="text-xs font-semibold text-foreground">{t("pattern.title")}</h3>
        {pattern.afterLossWinRatePercent === null || pattern.baselineWinRatePercent === null ? (
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{t("pattern.notEnough")}</p>
        ) : (
          <>
            <p className="mt-1.5 text-sm text-foreground">
              {t("pattern.comparison", {
                after: formatNumber(Math.round(pattern.afterLossWinRatePercent), locale),
                afterCount: pattern.afterLoss,
                baseline: formatNumber(Math.round(pattern.baselineWinRatePercent), locale),
                baselineCount: pattern.baseline,
              })}
            </p>
            {/* NO INTERPRETATION. Not "you are revenge trading", not
                "wait 30 minutes" — the first is a claim about somebody's
                mind and the second is advice. */}
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{t("pattern.observationOnly")}</p>
          </>
        )}
      </section>

      <BucketTable title={t("byInstrument")} buckets={byInstrument} locale={locale} />
      <BucketTable title={t("bySession")} buckets={bySession} locale={locale} translateKey />
    </div>
  );
}

function BucketTable({
  title,
  buckets,
  locale,
  translateKey,
}: {
  title: string;
  buckets: Bucket[];
  locale: string;
  translateKey?: boolean;
}) {
  const t = useTranslations("dashboard.trading");
  if (buckets.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold text-foreground">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-muted">
              <th className="py-1 pr-3 font-medium">{t("table.key")}</th>
              <th className="py-1 pr-3 font-medium">{t("stats.trades")}</th>
              <th className="py-1 pr-3 font-medium">{t("stats.winRate")}</th>
              <th className="py-1 font-medium">{t("stats.netPnl")}</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.key} className="border-t border-border">
                <td className="py-1.5 pr-3 text-foreground">
                  {translateKey ? t(`sessions.${bucket.key}`) : bucket.key}
                </td>
                <td className="py-1.5 pr-3 tabular-nums text-muted">
                  {formatNumber(bucket.stats.counted, locale)}
                </td>
                <td className="py-1.5 pr-3 tabular-nums text-muted">
                  {bucket.stats.winRatePercent === null
                    ? t("stats.notEnoughShort")
                    : `${formatNumber(Math.round(bucket.stats.winRatePercent), locale)}%`}
                </td>
                <td
                  className={`py-1.5 tabular-nums ${
                    bucket.stats.netPnl > 0 ? "text-emerald-400" : bucket.stats.netPnl < 0 ? "text-red-400" : "text-muted"
                  }`}
                >
                  {formatNumber(Math.round(bucket.stats.netPnl * 100) / 100, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * The equity curve, as an inline SVG polyline.
 *
 * NO CHART LIBRARY, on purpose: this is one line with no axes to
 * configure, and a charting dependency for it would be a bundle cost on
 * every page that imports this one. The y-axis is scaled to the data's
 * own range and the two ends are labelled, so the shape is readable
 * without gridlines.
 */
function EquityCurve({ points }: { points: EquityPoint[] }) {
  const t = useTranslations("dashboard.trading");
  const values = points.map((p) => p.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 600;
  const height = 120;
  const step = width / Math.max(1, points.length - 1);
  const path = points
    .map((p, i) => `${(i * step).toFixed(1)},${(height - ((p.equity - min) / span) * height).toFixed(1)}`)
    .join(" ");
  const up = values[values.length - 1] >= values[0];

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold text-foreground">{t("equity.title")}</h3>
      <div className="overflow-x-auto rounded-xl border border-border bg-panel p-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-28 w-full"
          role="img"
          aria-label={t("equity.title")}
        >
          <polyline
            points={path}
            fill="none"
            stroke={up ? "rgb(52 211 153)" : "rgb(248 113 113)"}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </section>
  );
}

function formatDuration(seconds: number, locale: string): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${formatNumber(minutes, locale)}m`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  if (hours < 48) return `${formatNumber(hours, locale)}h`;
  return `${formatNumber(Math.round(hours / 24), locale)}d`;
}
