import type { Metadata } from "next";
import { pageTitle } from "@/lib/page-title";
import { notFound, redirect } from "next/navigation";
import { Coins } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/dashboard/page-header";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { MARGIN_TARGET } from "@/lib/billing/margin-report";
import {
  monthlyRecurringRevenue,
  type MrrInputRow,
} from "@/lib/billing/monthly-revenue";
import {
  CostDashboard,
  type CostDashboardData,
} from "@/components/costs/cost-dashboard";
import { getLocale } from "next-intl/server";
import { RouterReport, readRouterPeriod } from "@/components/costs/router-report";
import { buildRoutingReport, type CostLogRow, type ProviderAttemptRow } from "@/lib/billing/routing-report";
import { loadModelTable, expandModelTable } from "@/lib/ai/routing/model-table";

/** The most cost-log rows the router section reads in one load. Above
 *  it the section says so rather than reporting a partial month as one. */
const ROUTER_ROW_CAP = 20_000;

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("pageTitle.costs");
}
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * WHERE THE MONEY GOES — owner only.
 *
 * The alerts (api/cron/cost-alerts) say when something changed. This says
 * what is true. They read the same aggregates on purpose: a dashboard
 * computed differently from the alerts is a dashboard that disagrees with
 * them, and then neither is believed.
 *
 * notFound() rather than a redirect or a "not allowed" page: a customer
 * should not learn that a page showing every account's spend exists.
 */
export default async function CostsPage(
  props: {
    searchParams: Promise<{ days?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const locale = await getLocale();
  const routerPeriod = readRouterPeriod(searchParams.days);
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) notFound();

  const admin = createAdminClient();
  const unavailable: string[] = [];
  const call = async <T,>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T[]> => {
    try {
      const { data, error } = await admin.rpc(name, args);
      if (error) throw error;
      return (data ?? []) as T[];
    } catch (err) {
      // console, not logApiError: a page that logs its own failure into a
      // table it may also be failing to reach turns one problem into two.
      console.error(`costs: ${name} failed`, err);
      unavailable.push(name);
      return [];
    }
  };

  // THE ROUTER SECTION (BUILD-SPECS 2.13 Ζ), over the chosen period. Raw
  // rows rather than an RPC: an aggregate RPC would be a migration, and
  // migrations here are pasted by hand (CLAUDE.md). The sums are
  // lib/billing/routing-report.ts's, tested against hand-worked figures.
  const since = new Date(Date.now() - routerPeriod * 86_400_000).toISOString();
  const routerRowsPromise = (async () => {
    try {
      const { data, error } = await admin
        .from("ai_cost_log")
        .select(
          "feature, real_cost_usd, real_cost_eur, credits_charged, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, metadata",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(ROUTER_ROW_CAP);
      if (error) throw error;
      return (data ?? []) as CostLogRow[];
    } catch (err) {
      console.error("costs: ai_cost_log rows failed", err);
      unavailable.push("ai_cost_log");
      return [] as CostLogRow[];
    }
  })();
  const routerAttemptsPromise = (async () => {
    try {
      const { data, error } = await admin
        .from("ai_provider_log")
        .select("request_id, attempt_index, outcome")
        .gte("created_at", since)
        .limit(ROUTER_ROW_CAP * 3);
      if (error) throw error;
      return (data ?? []) as ProviderAttemptRow[];
    } catch (err) {
      // Null, not []: "could not read the provider log" must not print as
      // "nothing ever went to the fallback".
      console.error("costs: ai_provider_log failed", err);
      return null;
    }
  })();

  const [daily, features, topUsers, alerts, mrrRows] = await Promise.all([
    call<{
      day: string;
      cost_eur: string;
      calls: number;
      credits_charged: number;
    }>("cost_daily_totals", { p_days: 30 }),
    call<{
      feature: string;
      cost_eur: string;
      calls: number;
      credits_charged: number;
      charged_calls: number;
      margin_sum: string;
    }>("cost_by_feature", { p_days: 30 }),
    call<{
      user_id: string;
      cost_eur: string;
      calls: number;
      credits_charged: number;
    }>("cost_by_user", { p_days: 30, p_limit: 15 }),
    (async () => {
      try {
        const { data, error } = await admin
          .from("cost_alert_log")
          .select("id, alert_type, payload, delivered, created_at")
          .order("created_at", { ascending: false })
          .limit(25);
        if (error) throw error;
        return (data ?? []) as {
          id: string;
          alert_type: string;
          payload: Record<string, unknown>;
          delivered: boolean;
          created_at: string;
        }[];
      } catch (err) {
        console.error("costs: cost_alert_log failed", err);
        unavailable.push("cost_alert_log");
        return [];
      }
    })(),
    call<{
      tier: string;
      billing_interval: string;
      subscribers: number;
      seats: number;
    }>("mrr_inputs", {}),
  ]);

  const revenue = monthlyRecurringRevenue(
    mrrRows.map(
      (r): MrrInputRow => ({
        tier: r.tier,
        billingInterval: r.billing_interval,
        subscribers: Number(r.subscribers ?? 0),
        seats: Number(r.seats ?? 0),
      }),
    ),
  );

  const data: CostDashboardData = {
    daily: daily.map((d) => ({
      day: String(d.day),
      costEur: Number(d.cost_eur ?? 0),
      calls: Number(d.calls ?? 0),
      creditsCharged: Number(d.credits_charged ?? 0),
    })),
    features: features.map((f) => {
      const chargedCalls = Number(f.charged_calls ?? 0);
      return {
        feature: String(f.feature),
        costEur: Number(f.cost_eur ?? 0),
        calls: Number(f.calls ?? 0),
        creditsCharged: Number(f.credits_charged ?? 0),
        chargedCalls,
        // A bypass row stores achieved_margin null BY DESIGN, so a margin
        // averaged over ALL calls would divide real margin by a count
        // that includes calls which produced no revenue — and every
        // feature the owner uses would read as a shortfall.
        margin:
          chargedCalls > 0 ? Number(f.margin_sum ?? 0) / chargedCalls : null,
      };
    }),
    topUsers: topUsers.map((u) => ({
      userId: String(u.user_id),
      costEur: Number(u.cost_eur ?? 0),
      calls: Number(u.calls ?? 0),
      creditsCharged: Number(u.credits_charged ?? 0),
    })),
    alerts: alerts.map((a) => ({
      id: String(a.id),
      type: String(a.alert_type),
      payload: a.payload ?? {},
      delivered: Boolean(a.delivered),
      createdAt: String(a.created_at),
    })),
    revenue,
    marginTarget: MARGIN_TARGET,
    unavailable,
  };

  const [routerRows, routerAttempts] = await Promise.all([routerRowsPromise, routerAttemptsPromise]);
  const routerReport = buildRoutingReport(routerRows, routerAttempts);
  const loadedTable = loadModelTable();

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <PageHeader
          icon={Coins}
          title="Costs"
          description="What the last 30 days cost, and what fired. Owner only."
          helpKey="help.costs"
        />
        <CostDashboard data={data} locale={locale} />
        <RouterReport
          report={routerReport}
          period={routerPeriod}
          table={expandModelTable(loadedTable.table)}
          tableVersion={loadedTable.table.version}
          tableSource={loadedTable.source}
          tableRejected={loadedTable.rejected}
          truncatedAt={routerRows.length >= ROUTER_ROW_CAP ? ROUTER_ROW_CAP : null}
          locale={locale}
        />
      </div>
    </div>
  );
}
