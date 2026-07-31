import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlan, type Plan, type PlanSlug } from "./plans";

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

type CreditsRow = { credits_remaining: number; credits_total: number; plan_tier: string };

function planMonthlyCredits(plan: Plan): number {
  return plan.monthlyCredits === "custom" ? 0 : plan.monthlyCredits;
}

// Reads the user's credit balance, initializing a row (at the given plan's
// monthly allotment) if one doesn't exist yet — covers accounts created
// before user_credits existed; otherwise a plain read.
export async function getOrInitCredits(userId: string, plan: Plan): Promise<CreditsRow> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_credits")
    .select("credits_remaining, credits_total, plan_tier")
    .eq("user_id", userId)
    .maybeSingle();

  if (data) return data as CreditsRow;

  const initial = planMonthlyCredits(plan);
  const { data: inserted } = await admin
    .from("user_credits")
    .insert({
      user_id: userId,
      credits_remaining: initial,
      credits_total: initial,
      plan_tier: plan.slug,
    })
    .select("credits_remaining, credits_total, plan_tier")
    .single();

  return (
    (inserted as CreditsRow) ?? { credits_remaining: initial, credits_total: initial, plan_tier: plan.slug }
  );
}

// Deducts `amount` credits and logs the transaction. Read-then-write, not
// a single atomic SQL expression — the same "cost protection, not a
// security boundary" tolerance the old hourly rate limiter documented, not
// a hard financial ledger. Returns ok:false (no deduction, no log) if the
// balance is insufficient.
export async function deductCredits(
  userId: string,
  amount: number,
  actionType: string,
  description: string
): Promise<{ ok: boolean; remaining: number }> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("user_credits")
    .select("credits_remaining")
    .eq("user_id", userId)
    .maybeSingle();

  const remaining = row?.credits_remaining ?? 0;
  if (remaining < amount) {
    return { ok: false, remaining };
  }

  const nextRemaining = remaining - amount;
  await admin.from("user_credits").update({ credits_remaining: nextRemaining }).eq("user_id", userId);
  await admin
    .from("credit_transactions")
    .insert({ user_id: userId, amount: -amount, action_type: actionType, description });

  return { ok: true, remaining: nextRemaining };
}

// Grants credits (purchase, plan renewal/upgrade, signup) — adds to
// credits_remaining; setTotal/setPlanTier additionally overwrite those
// columns for a plan-driven grant (a purchase leaves them as-is).
export async function grantCredits(
  userId: string,
  amount: number,
  actionType: string,
  description: string,
  options?: { setTotal?: number; setPlanTier?: PlanSlug }
): Promise<void> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("user_credits")
    .select("credits_remaining, credits_total, plan_tier")
    .eq("user_id", userId)
    .maybeSingle();

  const nextRemaining = (row?.credits_remaining ?? 0) + amount;
  await admin.from("user_credits").upsert(
    {
      user_id: userId,
      credits_remaining: nextRemaining,
      credits_total: options?.setTotal ?? row?.credits_total ?? amount,
      plan_tier: options?.setPlanTier ?? row?.plan_tier ?? "free",
    },
    { onConflict: "user_id" }
  );

  await admin
    .from("credit_transactions")
    .insert({ user_id: userId, amount, action_type: actionType, description });
}

// Resets credits_remaining back to credits_total — used by the monthly
// cron reset (api/cron/reset-credits) for accounts whose plan didn't
// change this cycle.
export async function resetCreditsToTotal(userId: string, total: number): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("user_credits")
    .update({ credits_remaining: total, credits_total: total })
    .eq("user_id", userId);
}

// Resets a user's credit balance to their (new) plan's monthly allotment —
// called from the Stripe webhook on checkout, plan change, cancellation,
// and renewal (see api/webhooks/stripe/route.ts's syncSubscriptionToUser).
// Enterprise's "custom" allotment is configured by hand, not by a plan
// lookup, so it's left untouched here — only plan_tier is synced for it.
export async function syncCreditsForPlan(userId: string, planSlug: PlanSlug, reason: string): Promise<void> {
  const plan = getPlan(planSlug) ?? getPlan("free")!;
  const admin = createAdminClient();

  if (plan.monthlyCredits === "custom") {
    await admin.from("user_credits").upsert(
      { user_id: userId, plan_tier: planSlug },
      { onConflict: "user_id", ignoreDuplicates: false }
    );
    return;
  }

  const total = plan.monthlyCredits;
  await admin.from("user_credits").upsert(
    { user_id: userId, credits_remaining: total, credits_total: total, plan_tier: planSlug },
    { onConflict: "user_id" }
  );
  await admin
    .from("credit_transactions")
    .insert({ user_id: userId, amount: total, action_type: "plan_renewal", description: reason });
}

export const CREDIT_COSTS = {
  chatMessage: 1,
  createAnything: 1,
  agentCreate: 40,
  automationCreate: 50,
  websiteCreate: 100,
  mobileAppCreate: 300,
  // Not wired to any UI yet — no "SaaS Project" builder exists in the app.
  // Defined so the cost is ready the moment that module ships.
  saasProjectCreate: 700,
} as const;

export function insufficientCreditsMessage(): string {
  return "Not enough credits. Upgrade your plan or purchase more credits.";
}
