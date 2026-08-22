import type { Metadata } from "next";
import { pageTitle } from "@/lib/page-title";
import { notFound, redirect } from "next/navigation";
import { Coins } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/dashboard/page-header";
import { isAdminEmail } from "@/lib/admin";
import { MARGIN_TARGET } from "@/lib/billing/margin-report";
import { monthlyRecurringRevenue, type MrrInputRow } from "@/lib/billing/monthly-revenue";
import { CostDashboard, type CostDashboardData } from "@/components/costs/cost-dashboard";
import { getLocale } from "next-intl/server";

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
export default async function CostsPage() {
  const locale = await getLocale();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) notFound();

  const admin = createAdminClient();
  const unavailable: string[] = [];
  const call = async <T,>(name: string, args: Record<string, unknown>): Promise<T[]> => {
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

  const [daily, features, topUsers, alerts, mrrRows] = await Promise.all([
    call<{ day: string; cost_eur: string; calls: number; credits_charged: number }>(
      "cost_daily_totals",
      { p_days: 30 }
    ),
    call<{
      feature: string;
      cost_eur: string;
      calls: number;
      credits_charged: number;
      charged_calls: number;
      margin_sum: string;
    }>("cost_by_feature", { p_days: 30 }),
    call<{ user_id: string; cost_eur: string; calls: number; credits_charged: number }>(
      "cost_by_user",
      { p_days: 30, p_limit: 15 }
    ),
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
    call<{ tier: string; billing_interval: string; subscribers: number; seats: number }>(
      "mrr_inputs",
      {}
    ),
  ]);

  const revenue = monthlyRecurringRevenue(
    mrrRows.map(
      (r): MrrInputRow => ({
        tier: r.tier,
        billingInterval: r.billing_interval,
        subscribers: Number(r.subscribers ?? 0),
        seats: Number(r.seats ?? 0),
      })
    )
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
        margin: chargedCalls > 0 ? Number(f.margin_sum ?? 0) / chargedCalls : null,
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

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <PageHeader
          icon={Coins}
          title="Costs"
          description="What the last 30 days cost, and what fired. Owner only."
        />
        <CostDashboard data={data} locale={locale} />
      </div>
    </main>
  );
}
