import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { logApiError } from "@/lib/log-error";
import { logAdminAction } from "@/lib/admin/audit-log";
import { isFeatureOn } from "@/lib/flags/flags";
import { getPlan } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

function providerFromModel(model: string): string {
  if (model.startsWith("openai/")) return "openai";
  if (model.startsWith("google/")) return "google";
  if (model.startsWith("groq/")) return "groq";
  if (model.startsWith("external:")) return model.slice(9).split("/")[0] || "external";
  if (model.startsWith("batch:")) return providerFromModel(model.slice(6));
  if (model.startsWith("claude-")) return "anthropic";
  return "other";
}

type DayProvider = { date: string; provider: string; costEur: number; calls: number };

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
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 30)));

  const admin = createAdminClient();

  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Fetch cost log rows with metadata for model breakdown
    const { data: rows, error } = await admin
      .from("ai_cost_log")
      .select("user_id, real_cost_eur, feature, metadata, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50000);

    if (error) throw error;

    // --- 1. Cost per provider per day ---
    const dayProviderMap = new Map<string, { costEur: number; calls: number }>();

    for (const row of (rows ?? []) as Record<string, unknown>[]) {
      const createdAt = String(row.created_at ?? "");
      const date = createdAt.slice(0, 10);
      const eurCost = Number(row.real_cost_eur ?? 0);
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const breakdown = (meta.modelBreakdown ?? null) as Record<string, Record<string, unknown>> | null;

      if (breakdown && Object.keys(breakdown).length > 0) {
        const totalUsd = Object.values(breakdown).reduce(
          (s, u) => s + Number(u.usdCost ?? 0),
          0,
        );
        for (const [model, usage] of Object.entries(breakdown)) {
          const provider = providerFromModel(model);
          const share = totalUsd > 0 ? Number(usage.usdCost ?? 0) / totalUsd : 1 / Object.keys(breakdown).length;
          const key = `${date}|${provider}`;
          const cur = dayProviderMap.get(key) ?? { costEur: 0, calls: 0 };
          cur.costEur += eurCost * share;
          cur.calls += 1;
          dayProviderMap.set(key, cur);
        }
      } else {
        const key = `${date}|anthropic`;
        const cur = dayProviderMap.get(key) ?? { costEur: 0, calls: 0 };
        cur.costEur += eurCost;
        cur.calls += 1;
        dayProviderMap.set(key, cur);
      }
    }

    const dailyProviderCosts: DayProvider[] = [...dayProviderMap.entries()]
      .map(([key, v]) => {
        const [date, provider] = key.split("|");
        return {
          date,
          provider,
          costEur: Math.round(v.costEur * 10000) / 10000,
          calls: v.calls,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.provider.localeCompare(b.provider));

    // --- 2. Users whose cost > what they pay (margin < 1) ---
    const userCostMap = new Map<string, { costEur: number; calls: number }>();
    for (const row of (rows ?? []) as Record<string, unknown>[]) {
      const uid = String(row.user_id);
      const eurCost = Number(row.real_cost_eur ?? 0);
      const cur = userCostMap.get(uid) ?? { costEur: 0, calls: 0 };
      cur.costEur += eurCost;
      cur.calls += 1;
      userCostMap.set(uid, cur);
    }

    const userIds = [...userCostMap.keys()];
    let creditsMap = new Map<string, string>();
    if (userIds.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        const { data: creditRows } = await admin
          .from("user_credits")
          .select("user_id, plan_tier")
          .in("user_id", batch);
        for (const row of (creditRows ?? []) as Record<string, unknown>[]) {
          creditsMap.set(String(row.user_id), String(row.plan_tier ?? "free"));
        }
      }
    }

    // Fetch emails for flagged users only (privacy: only for those who cost > pay)
    const flaggedUsers: {
      userId: string;
      email: string;
      costEur: number;
      monthlyPrice: number;
      margin: number | null;
      calls: number;
    }[] = [];

    const potentialFlagged: { userId: string; costEur: number; monthlyPrice: number; calls: number }[] = [];
    for (const [uid, cost] of userCostMap) {
      const planSlug = creditsMap.get(uid) ?? "free";
      const plan = getPlan(planSlug) ?? getPlan("free")!;
      const monthlyPrice = typeof plan.price === "number" ? plan.price : 0;
      if (cost.costEur > monthlyPrice && cost.costEur > 0.5) {
        potentialFlagged.push({ userId: uid, costEur: cost.costEur, monthlyPrice, calls: cost.calls });
      }
    }

    if (potentialFlagged.length > 0) {
      const flaggedIds = potentialFlagged.map((f) => f.userId);
      const batchSize = 50;
      const emailMap = new Map<string, string>();
      for (let i = 0; i < flaggedIds.length; i += batchSize) {
        const batch = flaggedIds.slice(i, i + batchSize);
        const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 1000 });
        for (const u of usersPage?.users ?? []) {
          if (batch.includes(u.id)) {
            emailMap.set(u.id, u.email ?? "");
          }
        }
      }

      for (const f of potentialFlagged) {
        flaggedUsers.push({
          userId: f.userId,
          email: emailMap.get(f.userId) ?? "",
          costEur: Math.round(f.costEur * 100) / 100,
          monthlyPrice: f.monthlyPrice,
          margin: f.monthlyPrice > 0 ? Math.round((f.monthlyPrice / f.costEur) * 100) / 100 : null,
          calls: f.calls,
        });
      }

      flaggedUsers.sort((a, b) => b.costEur - a.costEur);
    }

    // --- 3. Summary totals ---
    const totalCostEur = [...userCostMap.values()].reduce((s, v) => s + v.costEur, 0);
    const totalCalls = [...userCostMap.values()].reduce((s, v) => s + v.calls, 0);

    const providerTotals: { provider: string; costEur: number; calls: number }[] = [];
    const providerMap = new Map<string, { costEur: number; calls: number }>();
    for (const dp of dailyProviderCosts) {
      const cur = providerMap.get(dp.provider) ?? { costEur: 0, calls: 0 };
      cur.costEur += dp.costEur;
      cur.calls += dp.calls;
      providerMap.set(dp.provider, cur);
    }
    for (const [provider, v] of providerMap) {
      providerTotals.push({
        provider,
        costEur: Math.round(v.costEur * 100) / 100,
        calls: v.calls,
      });
    }
    providerTotals.sort((a, b) => b.costEur - a.costEur);

    await logAdminAction(user.email!, "view_costs", { days });

    return NextResponse.json({
      ok: true,
      days,
      totalCostEur: Math.round(totalCostEur * 100) / 100,
      totalCalls,
      providerTotals,
      dailyProviderCosts,
      flaggedUsers,
    });
  } catch (err) {
    logApiError("/api/admin/costs", err);
    return NextResponse.json({ ok: false, code: "load_failed" }, { status: 500 });
  }
}
