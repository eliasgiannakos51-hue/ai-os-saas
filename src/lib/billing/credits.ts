import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { hasActiveBetaBypass, isBetaTester } from "@/lib/beta";
import { getPlan, type Plan, type PlanSlug } from "./plans";

// The plan a user is on lives in user_metadata.subscription_tier, written
// by the Stripe webhook on checkout/subscription events (see
// api/webhooks/stripe/route.ts) or set to "free" directly at signup. Falls
// back to "free" for anything missing or unrecognized — same default
// dashboard/settings/page.tsx already uses to display the current plan.
//
// This is the RAW tier only — it does not know about beta access expiring.
// A beta grant sets subscription_tier: "ultimate" at signup and nothing
// ever writes it back to "free" when the 30-day window closes, so this
// alone would keep reporting "ultimate" forever. Anywhere that resolved
// plan actually gates a feature or a credit cost should use
// resolveEffectivePlanSlug/resolveEffectivePlan below instead, which layer
// the live beta-expiry check on top of this.
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

// The tier actually in effect right now — same as resolvePlanSlug, except
// a beta-granted tier collapses to "free" once beta_expires_at (see
// lib/beta.ts, user_credits.beta_expires_at) has passed. A beta tester who
// has since become a real paying subscriber (has a Stripe customer id) is
// left untouched — Stripe's webhook owns their tier from that point on,
// regardless of whether their old beta window is still open.
export async function resolveEffectivePlanSlug(
  user: { id: string; user_metadata?: Record<string, unknown> | null } | null | undefined
): Promise<PlanSlug> {
  const baseSlug = resolvePlanSlug(user);
  if (!user || baseSlug === "free") return baseSlug;
  if (user.user_metadata?.stripe_customer_id) return baseSlug;
  if (!isBetaTester(user)) return baseSlug;

  const active = await hasActiveBetaBypass(user);
  return active ? baseSlug : "free";
}

export async function resolveEffectivePlan(
  user: { id: string; user_metadata?: Record<string, unknown> | null } | null | undefined
): Promise<Plan> {
  return getPlan(await resolveEffectivePlanSlug(user)) ?? getPlan("free")!;
}

type CreditsRow = {
  credits_remaining: number;
  credits_total: number;
  plan_tier: string;
  beta_expires_at: string | null;
};

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
    .select("credits_remaining, credits_total, plan_tier, beta_expires_at")
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
    .select("credits_remaining, credits_total, plan_tier, beta_expires_at")
    .single();

  return (
    (inserted as CreditsRow) ?? {
      credits_remaining: initial,
      credits_total: initial,
      plan_tier: plan.slug,
      beta_expires_at: null,
    }
  );
}

// Deducts `amount` credits and logs the transaction. Read-then-write, not
// a single atomic SQL expression — the same "cost protection, not a
// security boundary" tolerance the old hourly rate limiter documented, not
// a hard financial ledger. Returns ok:false (no deduction, no log) if the
// balance is insufficient.
//
// `plan` is required so a row that doesn't exist yet gets initialized at
// the account's real entitlement (same as getOrInitCredits, used by
// /api/credits/balance and the dashboard layout) instead of silently
// falling back to a hard 0 balance — the old fallback here meant any
// caller that raced ahead of the row's first initialization would get
// blocked with "not enough credits" regardless of the account's actual
// plan. The initial select/insert/update/transaction-insert errors are all
// now checked and logged (previously unchecked) — an update that silently
// failed used to still return ok:true with a `remaining` that was never
// actually persisted, which reads to the caller as a successful deduction
// that never happened.
export async function deductCredits(
  userId: string,
  amount: number,
  actionType: string,
  description: string,
  plan: Plan
): Promise<{ ok: boolean; remaining: number }> {
  const admin = createAdminClient();
  const { data: row, error: selectError } = await admin
    .from("user_credits")
    .select("credits_remaining")
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) {
    logApiError("deductCredits", selectError, { userId, actionType, stage: "select" });
  }

  let remaining: number;
  if (row) {
    remaining = row.credits_remaining;
  } else {
    const initial = planMonthlyCredits(plan);
    const { error: insertError } = await admin.from("user_credits").insert({
      user_id: userId,
      credits_remaining: initial,
      credits_total: initial,
      plan_tier: plan.slug,
    });
    if (insertError) {
      logApiError("deductCredits", insertError, { userId, actionType, stage: "init_insert" });
    }
    remaining = initial;
  }

  const comparisonResult = remaining >= amount ? "sufficient" : "insufficient";
  console.error("CREDITS CHECK:", {
    userId,
    actionType,
    userCredits: remaining,
    actionCost: amount,
    comparisonResult,
  });

  if (remaining < amount) {
    return { ok: false, remaining };
  }

  const nextRemaining = remaining - amount;
  const { error: updateError } = await admin
    .from("user_credits")
    .update({ credits_remaining: nextRemaining })
    .eq("user_id", userId);

  if (updateError) {
    logApiError("deductCredits", updateError, { userId, actionType, stage: "update" });
    return { ok: false, remaining };
  }

  const { error: insertTxError } = await admin
    .from("credit_transactions")
    .insert({ user_id: userId, amount: -amount, action_type: actionType, description });

  if (insertTxError) {
    logApiError("deductCredits", insertTxError, { userId, actionType, stage: "insert_transaction" });
  }

  return { ok: true, remaining: nextRemaining };
}

// Grants credits (purchase, plan renewal/upgrade, signup) — adds to
// credits_remaining; setTotal/setPlanTier additionally overwrite those
// columns for a plan-driven grant (a purchase leaves them as-is).
// setBetaExpiresAt is only ever passed by a beta-code signup (see
// api/signup/route.ts) — omitted, it leaves the existing value (or null
// for a brand-new row) untouched, so a normal credit-pack purchase or plan
// renewal never accidentally clears or extends someone's beta window.
export async function grantCredits(
  userId: string,
  amount: number,
  actionType: string,
  description: string,
  options?: { setTotal?: number; setPlanTier?: PlanSlug; setBetaExpiresAt?: string }
): Promise<void> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("user_credits")
    .select("credits_remaining, credits_total, plan_tier, beta_expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  const nextRemaining = (row?.credits_remaining ?? 0) + amount;
  await admin.from("user_credits").upsert(
    {
      user_id: userId,
      credits_remaining: nextRemaining,
      credits_total: options?.setTotal ?? row?.credits_total ?? amount,
      plan_tier: options?.setPlanTier ?? row?.plan_tier ?? "free",
      beta_expires_at: options?.setBetaExpiresAt ?? row?.beta_expires_at ?? null,
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
  textAction: 1,
  agentCreate: 40,
  automationCreate: 50,
  websiteCreate: 100,
  mobileAppCreate: 300,
  // Not wired to any UI yet — no "SaaS Project" builder exists in the app.
  // Defined so the cost is ready the moment that module ships.
  saasProjectCreate: 700,
  // Mission Control's Planner/Reviewer agents (api/mission/plan,
  // api/mission/review) — each step's own "Create with AI" click is a
  // separate, already-costed createAnything call, not covered by these.
  missionPlan: 2,
  missionReview: 2,
  // Weekly Reflection (api/reflection/generate) — on-demand, so this is
  // paid only when the user actually clicks "Generate Weekly Reflection".
  weeklyReflection: 2,
  // Website Builder (api/websites/generate) — a real Claude HTML/CSS
  // generation call, distinct from websiteCreate above (the existing
  // "Websites" Build module's plain CRUD tracker, which never calls AI).
  websiteGenerate: 100,
  // Website Builder post-generation editing (api/websites/edit) — a
  // smaller Claude call than a full generation (it starts from the
  // existing HTML rather than building from scratch), priced at half of
  // websiteGenerate.
  websiteEdit: 50,
} as const;

// TEMPORARY diagnostic: shows the exact numbers deductCredits compared,
// directly in the user-facing message — added because the generic message
// gave no way to tell, from the outside, whether a report of "not enough
// credits" despite a real balance was actually a low `remaining` value or
// something else. Remove the "(you have: X, need: Y)" clause once the
// underlying cause is confirmed and this is no longer needed for
// diagnosis.
export function insufficientCreditsMessage(remaining?: number, cost?: number): string {
  const detail =
    typeof remaining === "number" && typeof cost === "number"
      ? ` (you have: ${remaining}, need: ${cost})`
      : "";
  return `Not enough credits${detail}. Upgrade your plan or purchase more credits.`;
}
