import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { logApiError } from "@/lib/log-error";
import { logAdminAction } from "@/lib/admin/audit-log";
import { isFeatureOn } from "@/lib/flags/flags";
import { loadTrend } from "@/lib/billing/revenue-history";
import { loadMetricInputs } from "@/lib/billing/revenue-history";
import { computeMetrics, type Metric } from "@/lib/billing/metrics";

export const dynamic = "force-dynamic";

type MonthlyEvent = {
  month: string;
  started: number;
  reactivated: number;
  cancelled: number;
  upgraded: number;
  downgraded: number;
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ ok: false }, { status: 404 });

  const on = await isFeatureOn("admin-dashboard", user);
  if (!on) return NextResponse.json({ ok: false }, { status: 404 });

  const url = new URL(request.url);
  const days = Math.min(180, Math.max(7, Number(url.searchParams.get("days") ?? 90)));

  try {
    const [trend, metricInputs, events] = await Promise.all([
      loadTrend(days),
      loadMetricInputs(),
      loadSubscriptionEvents(days),
    ]);

    const metrics = computeMetrics(metricInputs);

    const safeMetrics = metrics.map(serializeMetric);

    await logAdminAction(user.email!, "view_revenue", { days });

    return NextResponse.json({
      ok: true,
      days,
      trend: {
        mrr: trend.mrr,
        aiCost: trend.aiCost,
        subscribers: trend.subscribers,
      },
      metrics: safeMetrics,
      events,
      currentMrr: metricInputs.mrrEur,
      payingSubscribers: metricInputs.payingSubscribers,
      totalAccounts: metricInputs.totalAccounts,
    });
  } catch (err) {
    logApiError("/api/admin/revenue", err);
    return NextResponse.json({ ok: false, code: "load_failed" }, { status: 500 });
  }
}

async function loadSubscriptionEvents(days: number): Promise<MonthlyEvent[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await admin
    .from("subscription_events")
    .select("kind, at")
    .gte("at", since)
    .order("at", { ascending: true })
    .limit(10000);

  if (error) throw error;

  const byMonth = new Map<string, MonthlyEvent>();

  for (const row of (rows ?? []) as Record<string, unknown>[]) {
    const at = String(row.at ?? "");
    const month = at.slice(0, 7);
    const kind = String(row.kind ?? "");

    if (!byMonth.has(month)) {
      byMonth.set(month, {
        month,
        started: 0,
        reactivated: 0,
        cancelled: 0,
        upgraded: 0,
        downgraded: 0,
      });
    }

    const entry = byMonth.get(month)!;
    if (kind === "started") entry.started++;
    else if (kind === "reactivated") entry.reactivated++;
    else if (kind === "cancelled") entry.cancelled++;
    else if (kind === "upgraded") entry.upgraded++;
    else if (kind === "downgraded") entry.downgraded++;
  }

  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function serializeMetric(m: Metric): Record<string, unknown> {
  const base: Record<string, unknown> = { key: m.key, unit: m.unit, state: m.state };
  if (m.state === "computed") {
    base.value = m.value;
    if (m.note) base.note = m.note;
  } else if (m.state === "needs_input") {
    base.missing = m.missing;
  } else if (m.state === "needs_history") {
    base.haveMonths = m.haveMonths;
    base.needMonths = m.needMonths;
  } else if (m.state === "needs_history_days") {
    base.haveDays = m.haveDays;
    base.needDays = m.needDays;
  } else if (m.state === "no_data") {
    base.why = m.why;
  }
  return base;
}
