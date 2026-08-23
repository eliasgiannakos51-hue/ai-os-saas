import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { logApiError } from "@/lib/log-error";
import {
  evaluateAllCostAlerts,
  fillHours,
  resolveCostAlertConfig,
  type FeatureMargin,
  type HourlyPoint,
  type UserSpend,
} from "@/lib/billing/cost-alerts";
import { deliverCostAlert, ownerUserIds } from "@/lib/billing/cost-alert-delivery";
import { monthlyRecurringRevenue, type MrrInputRow } from "@/lib/billing/monthly-revenue";
import { ABSORBED_REFUSAL_FEATURE } from "@/lib/billing/margin-report";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * The hourly sweep.
 *
 * SCHEDULED in vercel.json at "5 * * * *" — five past every hour, so it
 * reads a completed hour rather than racing the one that is still being
 * written.
 *
 * WHAT IT IS FOR. #12, #13 and #34 all open new ways to spend money on
 * somebody else's behalf. This is the net that goes up first: not to
 * prevent a runaway, which the circuit breaker and the bypass ceiling
 * already do per-request, but to make sure a person hears about one
 * within the hour rather than from an invoice.
 *
 * EVERY AGGREGATE IS COMPUTED IN SQL. The margin report reads raw rows
 * with .limit(20000) and groups them in TypeScript, which is fine for a
 * page somebody is looking at and wrong here: a truncated read makes
 * spend look LOWER than it is, and a safety net whose failure mode is a
 * silent false negative is not one.
 *
 * ONE FAILING RULE DOES NOT TAKE THE REST DOWN. Each query is awaited
 * separately and a failure degrades that rule to "no data", which its
 * evaluator treats as "do not fire" — never as "everything is fine",
 * because those are recorded differently in the response.
 *
 * Auth: CRON_SECRET, fail-closed, same as every other cron route.
 */
export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const config = resolveCostAlertConfig();
  const unavailable: string[] = [];

  const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T[] | null> => {
    try {
      const { data, error } = await admin.rpc(name, args);
      if (error) throw error;
      return (data ?? []) as T[];
    } catch (err) {
      logApiError("/api/cron/cost-alerts", err, { stage: name });
      unavailable.push(name);
      return null;
    }
  };

  // Eight days of hours: the rolling 24h window plus the seven before it.
  const hourRows = await rpc<{ hour: string; calls: number; cost_eur: string | number }>(
    "cost_hourly_calls",
    { p_hours: 24 * 8 }
  );
  // ZERO-FILLED. The query returns only hours that HAD traffic, so a
  // quiet night arrives as missing rows — and a median over "the hours
  // that were busy" is a median of busy hours, which makes every
  // ordinary hour look like a burst. The gaps are real zeros and have to
  // be present as zeros.
  const hours: HourlyPoint[] = hourRows ? fillHours(hourRows, 24 * 8) : [];

  const userRows = await rpc<{ user_id: string; cost_eur: string | number; calls: number }>(
    "cost_user_totals",
    { p_days: 1 }
  );
  const users: UserSpend[] = (userRows ?? []).map((r) => ({
    userId: r.user_id,
    costEur: Number(r.cost_eur ?? 0),
    calls: Number(r.calls ?? 0),
  }));

  const featureRows = await rpc<{
    feature: string;
    cost_eur: string | number;
    charged_calls: number;
    margin_sum: string | number;
  }>("cost_by_feature", { p_days: 30 });
  const features: FeatureMargin[] = (featureRows ?? []).map((r) => ({
    feature: r.feature,
    costEur: Number(r.cost_eur ?? 0),
    chargedCalls: Number(r.charged_calls ?? 0),
    marginSum: Number(r.margin_sum ?? 0),
  }));

  // Revenue, and whether it can be trusted. See lib/billing/monthly-revenue.ts
  // for why an incomplete figure must not become a share.
  const mrrRows = await rpc<{
    tier: string;
    billing_interval: string;
    subscribers: number;
    seats: number;
  }>("mrr_inputs", {});
  const revenue = mrrRows
    ? monthlyRecurringRevenue(
        mrrRows.map(
          (r): MrrInputRow => ({
            tier: r.tier,
            billingInterval: r.billing_interval,
            subscribers: Number(r.subscribers ?? 0),
            seats: Number(r.seats ?? 0),
          })
        )
      )
    : null;

  const absorbedRow = features.find((f) => f.feature === ABSORBED_REFUSAL_FEATURE);
  const absorbed =
    absorbedRow && revenue && revenue.complete && revenue.eur > 0
      ? {
          calls: absorbedRow.chargedCalls,
          costEur: absorbedRow.costEur,
          shareOfRevenue: absorbedRow.costEur / revenue.eur,
        }
      : absorbedRow
        ? { calls: absorbedRow.chargedCalls, costEur: absorbedRow.costEur, shareOfRevenue: null }
        : null;

  const unpricedRows = await rpc<{ models: string[]; calls: number; cost_eur: string | number }>(
    "cost_unpriced_usage",
    { p_hours: 24 }
  );
  const unpricedRow = unpricedRows?.[0];
  const unpriced =
    unpricedRow && Number(unpricedRow.calls ?? 0) > 0
      ? {
          models: unpricedRow.models ?? [],
          calls: Number(unpricedRow.calls ?? 0),
          costEur: Number(unpricedRow.cost_eur ?? 0),
        }
      : null;

  // THE OWNER'S OWN ACCOUNT IS NOT AN OUTLIER. It has real spend and no
  // revenue, and in a young product it is usually the biggest line — an
  // alert firing on it every hour is how this gets muted in week one.
  const excludedUserIds = new Set(await ownerUserIds());

  const alerts = evaluateAllCostAlerts({
    hours,
    users,
    features,
    absorbed,
    unpriced,
    excludedUserIds,
    config,
  });

  const delivered = [];
  for (const alert of alerts) {
    delivered.push(await deliverCostAlert(alert));
  }

  return NextResponse.json({
    ok: true,
    evaluated: {
      hours: hours.length,
      spendingUsers: users.filter((u) => u.costEur > 0).length,
      features: features.length,
      revenueEur: revenue?.eur ?? null,
      revenueComplete: revenue?.complete ?? null,
      unpricedSubscribers: revenue?.unpricedSubscribers ?? null,
    },
    // Not the same as "nothing is wrong": a rule with no data did not
    // pass, it did not run. The response says which.
    unavailable,
    alerts: delivered,
  });
}
