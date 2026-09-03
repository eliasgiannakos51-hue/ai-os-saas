"use client";

import { useTranslations } from "next-intl";
import type { Metric } from "@/lib/billing/metrics";

// THE THREE KINDS OF TRUTH, RENDERED DIFFERENTLY.
//
// A financial dashboard's failure mode is not being wrong — it is being
// CONFIDENT. Every figure looks the same: same font, same box, same
// authority. So a metric that could not be computed does not get a number
// and a caveat underneath it; it gets NO NUMBER AT ALL, in muted text,
// saying what it needs. There is nothing on this card that a tired person
// at 1am could read as a figure when it is not one.

const UNIT_SUFFIX: Record<string, string> = { percent: "%", months: " mo" };

function format(metric: Extract<Metric, { state: "computed" }>): string {
  const { value, unit } = metric;
  if (unit === "eur") {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `€${(value / 1_000_000).toFixed(2)}M`;
    if (abs >= 10_000) return `€${Math.round(value).toLocaleString("en-GB")}`;
    return `€${value.toFixed(2)}`;
  }
  return `${value.toFixed(unit === "score" ? 0 : 1)}${UNIT_SUFFIX[unit] ?? ""}`;
}

export function MetricCard({ metric }: { metric: Metric }) {
  const t = useTranslations("finance");

  return (
    <div className="rounded-2xl border border-border bg-panel p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted">{t(`metrics.${metric.key}`)}</p>

      {metric.state === "computed" ? (
        <>
          <p className="mt-1 text-2xl font-semibold text-foreground">{format(metric)}</p>
          {metric.note ? <p className="mt-1 text-[11px] text-amber-400">{metric.note}</p> : null}
        </>
      ) : metric.state === "needs_input" ? (
        <>
          {/* AN EM DASH, NOT A ZERO. A zero here is a claim. */}
          <p className="mt-1 text-2xl font-semibold text-muted">—</p>
          <p className="mt-1 text-[11px] text-muted">
            {t("needsInput", { fields: metric.missing.map((m) => t(`inputs.${m}`)).join(", ") })}
          </p>
        </>
      ) : metric.state === "needs_history" ? (
        <>
          <p className="mt-1 text-2xl font-semibold text-muted">—</p>
          <p className="mt-1 text-[11px] text-muted">
            {t("needsHistory", { have: metric.haveMonths, need: metric.needMonths })}
          </p>
        </>
      ) : metric.state === "needs_history_days" ? (
        <>
          <p className="mt-1 text-2xl font-semibold text-muted">—</p>
          {/* Days, because the thing waited for is the daily snapshot
              series — see the ruleOf40 note in lib/billing/metrics.ts. */}
          <p className="mt-1 text-[11px] text-muted">
            {t("needsHistoryDays", { have: metric.haveDays, need: metric.needDays })}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold text-muted">—</p>
          <p className="mt-1 text-[11px] text-muted">{metric.why}</p>
        </>
      )}
    </div>
  );
}
