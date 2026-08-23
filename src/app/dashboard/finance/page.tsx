import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LineChart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";
import { pageTitle } from "@/lib/page-title";
import { PageHeader } from "@/components/dashboard/page-header";
import { MetricCard } from "@/components/finance/metric-card";
import { BusinessInputsForm } from "@/components/finance/business-inputs-form";
import { TrendChart } from "@/components/finance/trend-chart";
import { computeMetrics, trendChangePercent } from "@/lib/billing/metrics";
import { loadMetricInputs, loadTrend, monthKey } from "@/lib/billing/revenue-history";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.finance");
}

/**
 * THE FINANCIAL DASHBOARD (V4 #26). OWNER-ONLY.
 *
 * A NOT-FOUND, NOT A "you are not allowed". A 403 tells a stranger the
 * page exists and is worth coming back for; a 404 tells them nothing. The
 * same choice the margin report already makes.
 *
 * EVERY FIGURE CARRIES ITS PROVENANCE. computeMetrics returns one of four
 * states per metric, and MetricCard renders three of them WITHOUT A
 * NUMBER — because the failure mode of a dashboard is not being wrong, it
 * is being confident. A CAC computed from a marketing spend nobody
 * entered would be infinitely good and a lie.
 */
export default async function FinancePage() {
  const t = await getTranslations("finance");
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) notFound();

  const month = monthKey(new Date());

  const [inputs, trend30, trend90, existing] = await Promise.all([
    loadMetricInputs(),
    loadTrend(30),
    loadTrend(90),
    createAdminClient()
      .from("business_inputs")
      .select("marketing_spend_eur, fixed_costs_eur, cash_balance_eur")
      .eq("month", month)
      .maybeSingle(),
  ]);

  const metrics = computeMetrics(inputs);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <PageHeader icon={LineChart} title={t("title")} description={t("description")} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} />
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <TrendChart
          title={t("trends.mrr30")}
          points={trend30.mrr}
          changePercent={trendChangePercent(trend30.mrr)}
        />
        <TrendChart
          title={t("trends.mrr90")}
          points={trend90.mrr}
          changePercent={trendChangePercent(trend90.mrr)}
        />
        <TrendChart
          title={t("trends.aiCost30")}
          points={trend30.aiCost}
          changePercent={trendChangePercent(trend30.aiCost)}
        />
        <TrendChart
          title={t("trends.subscribers90")}
          points={trend90.subscribers}
          changePercent={trendChangePercent(trend90.subscribers)}
          format="count"
        />
      </div>

      <div className="mt-6">
        <BusinessInputsForm
          month={month}
          initial={{
            marketingSpendEur: numberOrNull(existing.data?.marketing_spend_eur),
            fixedCostsEur: numberOrNull(existing.data?.fixed_costs_eur),
            cashBalanceEur: numberOrNull(existing.data?.cash_balance_eur),
          }}
        />
      </div>

      {/* WHAT THE HISTORY IS, said on the page. The snapshot table starts
          on the day it shipped and there is no back-fill — a back-filled
          MRR would be today's prices applied to a past nobody recorded. */}
      <p className="mt-4 text-xs text-muted">
        {t("provenance", { months: inputs.historyMonths, days: trend90.mrr.length })}
      </p>
    </div>
  );
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
