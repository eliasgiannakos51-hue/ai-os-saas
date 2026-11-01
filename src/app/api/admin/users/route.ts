import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { logApiError } from "@/lib/log-error";
import { logAdminAction } from "@/lib/admin/audit-log";
import { getPlan } from "@/lib/billing/plans";
import { isFeatureOn } from "@/lib/flags/flags";

export const dynamic = "force-dynamic";

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
  const search = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const perPage = 25;

  const admin = createAdminClient();

  try {
    // auth.users is only accessible through admin.auth.admin — not through
    // the PostgREST client. listUsers returns paginated results.
    const { data: usersPage, error: listError } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (listError) throw listError;

    const allUsers = usersPage?.users ?? [];

    // Client-side search filter on email (Supabase admin API doesn't
    // support server-side email search).
    const filtered = search
      ? allUsers.filter(
          (u) =>
            u.email?.toLowerCase().includes(search) ||
            (u.user_metadata?.full_name as string | undefined)?.toLowerCase().includes(search),
        )
      : allUsers;

    // Fetch credit balances for all users on this page.
    const userIds = filtered.map((u) => u.id);
    let creditsMap = new Map<string, { remaining: number; total: number; planTier: string }>();

    if (userIds.length > 0) {
      const { data: creditsRows } = await admin
        .from("user_credits")
        .select("user_id, credits_remaining, credits_total, plan_tier")
        .in("user_id", userIds);

      for (const row of (creditsRows ?? []) as Record<string, unknown>[]) {
        creditsMap.set(String(row.user_id), {
          remaining: Number(row.credits_remaining ?? 0),
          total: Number(row.credits_total ?? 0),
          planTier: String(row.plan_tier ?? "free"),
        });
      }
    }

    // Fetch 30-day cost per user from ai_cost_log.
    let costMap = new Map<string, { costEur: number; calls: number }>();
    if (userIds.length > 0) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: costRows } = await admin
        .from("ai_cost_log")
        .select("user_id, real_cost_eur")
        .in("user_id", userIds)
        .gte("created_at", thirtyDaysAgo);

      for (const row of (costRows ?? []) as Record<string, unknown>[]) {
        const uid = String(row.user_id);
        const existing = costMap.get(uid) ?? { costEur: 0, calls: 0 };
        existing.costEur += Number(row.real_cost_eur ?? 0);
        existing.calls += 1;
        costMap.set(uid, existing);
      }
    }

    const users = filtered.map((u) => {
      const meta = u.user_metadata ?? {};
      const credits = creditsMap.get(u.id);
      const planSlug = credits?.planTier ?? String(meta.plan_tier ?? "free");
      const plan = getPlan(planSlug) ?? getPlan("free")!;
      const cost = costMap.get(u.id);
      const monthlyPrice = typeof plan.price === "number" ? plan.price : 0;
      const costEur = cost?.costEur ?? 0;

      return {
        id: u.id,
        email: u.email ?? "",
        fullName: (meta.full_name as string) ?? "",
        plan: planSlug,
        planName: plan.name ?? planSlug,
        creditsRemaining: credits?.remaining ?? 0,
        creditsTotal: credits?.total ?? 0,
        monthlyPrice,
        costEur30d: Math.round(costEur * 100) / 100,
        calls30d: cost?.calls ?? 0,
        margin: costEur > 0 ? Math.round((monthlyPrice / costEur) * 100) / 100 : null,
        createdAt: u.created_at,
        lastSignIn: u.last_sign_in_at ?? null,
        suspended: meta.suspended === true,
      };
    });

    await logAdminAction(user.email!, "view_users", { search, page });

    return NextResponse.json({
      ok: true,
      users,
      page,
      total: usersPage?.total ?? filtered.length,
    });
  } catch (err) {
    logApiError("/api/admin/users", err);
    return NextResponse.json({ ok: false, code: "load_failed" }, { status: 500 });
  }
}
