import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getPlan, type Plan, type PlanSlug } from "./plans";

type ServerSupabaseClient = ReturnType<typeof createClient>;

// Rolling 30-day window used as "per month" — avoids calendar-month edge
// cases (billing anchor day, timezones) for a quota that only needs to be
// approximately monthly.
export const USAGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// The plan a user is on lives in user_metadata.subscription_tier, written
// by the Stripe webhook on checkout/subscription events (see
// api/webhooks/stripe/route.ts) or set to "free" directly at signup. Falls
// back to "free" for anything missing or unrecognized — same default
// dashboard/settings/page.tsx already uses to display the current plan.
export function resolvePlanSlug(
  user: { user_metadata?: Record<string, unknown> | null } | null | undefined
): PlanSlug {
  const raw = user?.user_metadata?.subscription_tier;
  return typeof raw === "string" && getPlan(raw) ? (raw as PlanSlug) : "free";
}

export function resolvePlan(
  user: { user_metadata?: Record<string, unknown> | null } | null | undefined
): Plan {
  return getPlan(resolvePlanSlug(user)) ?? getPlan("free")!;
}

// Create Anything and Veron Chat share one monthly AI-request budget (see
// the Free plan's "20 AI requests/month (Create Anything + Veron Chat
// combined)" line in plans.ts) — usage is counted across both request-log
// tables, not tracked independently per route.
export async function getMonthlyUsageCount(
  supabase: ServerSupabaseClient,
  userId: string
): Promise<{ count: number; error: unknown }> {
  const windowStart = new Date(Date.now() - USAGE_WINDOW_MS).toISOString();

  const [createResult, chatResult] = await Promise.all([
    supabase
      .from("create_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", windowStart),
    supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "user")
      .gte("created_at", windowStart),
  ]);

  return {
    count: (createResult.count ?? 0) + (chatResult.count ?? 0),
    error: createResult.error ?? chatResult.error ?? null,
  };
}

export function buildUsageLimitMessage(plan: Plan): string {
  const limit = plan.aiRequestsPerMonth === "unlimited" ? "" : `${plan.aiRequestsPerMonth} `;
  return `You've used all ${limit}AI requests included in your ${plan.name} plan this month (Create Anything + Veron Chat combined) — upgrade at /pricing for more.`;
}
