import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { hasActiveBetaBypass, isBetaTester } from "@/lib/beta";
import { diagLog } from "@/lib/diag";
import { getPlan, type Plan, type PlanSlug } from "./plans";
import { isAdminEmail } from "@/lib/admin";
import { clearLegacyEntitlements } from "@/lib/billing/legacy-entitlements";

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
  user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined
): PlanSlug {
  const raw = user?.user_metadata?.subscription_tier;
  if (typeof raw === "string" && getPlan(raw)) return raw as PlanSlug;

  // An owner/admin account has no subscription_tier, because it never
  // bought a subscription — admin status lives in ADMIN_EMAILS, which is
  // an entirely separate axis. Falling through to "free" therefore
  // labelled the owner a free user.
  //
  // That is not merely cosmetic. The plan is what settlement divides by,
  // so it decides what a credit is worth: an owner's generation reported
  // wouldHaveChargedCredits at the FREE/list rate (EUR 0.02 -> 53
  // credits) when their real tier prices it at EUR 0.008 -> 132. The one
  // number available for checking the margin on admin traffic was 60%
  // low, which is the opposite of what a safety figure should do.
  //
  // "enterprise" rather than a paid tier because that is already what the
  // rest of the app calls an admin — see pricing/page.tsx, team/invite
  // and dashboard/team, all of which read `isAdmin ? "enterprise" : ...`.
  // Billing was the only place that disagreed.
  if (isAdminEmail(user?.email)) return "enterprise";

  return "free";
}

export function resolvePlan(
  user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined
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
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined
): Promise<PlanSlug> {
  const baseSlug = resolvePlanSlug(user);
  if (!user || baseSlug === "free") return baseSlug;
  if (user.user_metadata?.stripe_customer_id) return baseSlug;
  if (!isBetaTester(user)) return baseSlug;

  const active = await hasActiveBetaBypass(user);
  return active ? baseSlug : "free";
}

export async function resolveEffectivePlan(
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined
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

// Read-only balance check — no write, no transaction log. Used to gate an
// expensive AI call BEFORE it starts (reject early with a clear "not
// enough credits" message, same as before) while the actual deduction
// (see deductCredits) happens only once that call has confirmed-
// successfully completed — see api/websites/generate/route.ts,
// api/create/route.ts and api/chat/route.ts for the two-step pattern this
// enables: check-then-call-then-deduct, instead of the old deduct-then-
// call (which charged the user even when the call itself failed).
export async function hasEnoughCredits(
  userId: string,
  amount: number,
  plan: Plan
): Promise<{ ok: boolean; remaining: number }> {
  const row = await getOrInitCredits(userId, plan);
  return { ok: row.credits_remaining >= amount, remaining: row.credits_remaining };
}

// Deducts `amount` credits and logs the transaction. Atomic — calls
// deduct_credits_atomic (supabase_credits_schema.sql), a single Postgres
// UPDATE whose WHERE clause and SET expression both reference the
// row's CURRENT value, evaluated under Postgres's own row-level lock.
// This is a real fix for a genuine race condition the previous
// SELECT-then-check-then-UPDATE implementation had: two concurrent
// requests (two tabs, two fast clicks) could both read the same balance,
// both pass the "enough credits?" check in application code, and both
// write — silently losing one of the two deductions. A single atomic SQL
// statement makes that literally impossible: Postgres serializes any two
// concurrent UPDATEs to the same row, so the second one always sees the
// first one's already-decremented value. Returns ok:false (no deduction,
// no log) if the balance is insufficient.
//
// `plan` is required so a row that doesn't exist yet gets initialized at
// the account's real entitlement (same as getOrInitCredits, used by
// /api/credits/balance and the dashboard layout) instead of silently
// falling back to a hard 0 balance — the old fallback here meant any
// caller that raced ahead of the row's first initialization would get
// blocked with "not enough credits" regardless of the account's actual
// plan. deduct_credits_atomic does that same first-time initialization
// (an upsert) INSIDE the same atomic statement, so two concurrent
// first-ever deductions for a brand-new account can't race each other
// either.
export async function deductCredits(
  userId: string,
  amount: number,
  actionType: string,
  description: string,
  plan: Plan
): Promise<{ ok: boolean; remaining: number }> {
  const admin = createAdminClient();
  const initial = planMonthlyCredits(plan);

  const { data, error: rpcError } = await admin.rpc("deduct_credits_atomic", {
    p_user_id: userId,
    p_amount: amount,
    p_initial_credits: initial,
    p_plan_tier: plan.slug,
  });

  if (rpcError) {
    logApiError("deductCredits", rpcError, { userId, actionType, stage: "rpc" });
    return { ok: false, remaining: 0 };
  }

  const result = Array.isArray(data) ? data[0] : data;
  const ok = Boolean(result?.ok);
  const remaining = typeof result?.remaining === "number" ? result.remaining : 0;

  diagLog(
    `CREDITS CHECK: ${JSON.stringify({
      userId,
      actionType,
      actionCost: amount,
      comparisonResult: ok ? "sufficient" : "insufficient",
      remainingAfter: remaining,
    })}`
  );

  if (!ok) {
    return { ok: false, remaining };
  }

  const { error: insertTxError } = await admin
    .from("credit_transactions")
    .insert({ user_id: userId, amount: -amount, action_type: actionType, description });

  if (insertTxError) {
    logApiError("deductCredits", insertTxError, { userId, actionType, stage: "insert_transaction" });
  }

  return { ok: true, remaining };
}

// Grants credits (purchase, plan renewal/upgrade, signup) — adds to
// credits_remaining; setTotal/setPlanTier additionally overwrite those
// columns for a plan-driven grant (a purchase leaves them as-is).
// setBetaExpiresAt is only ever passed by a beta-code signup (see
// api/signup/route.ts) — omitted, it leaves the existing value (or null
// for a brand-new row) untouched, so a normal credit-pack purchase or plan
// renewal never accidentally clears or extends someone's beta window.
//
// TWO DEFECTS fixed here in the V1+V2 audit, both of which moved real money:
//
//   1. It was not IDEMPOTENT. The Stripe webhook called this for every
//      checkout.session.completed it received, keeping no record of which
//      events it had handled. Stripe's delivery guarantee is at-least-once —
//      the same event legitimately arrives twice after a timeout on our side,
//      a Stripe-side retry, or a manual resend — and every duplicate granted
//      the whole pack again.
//   2. It was not ATOMIC. `select credits_remaining` then `upsert(remaining +
//      amount)` is a read-modify-write across two round trips: two grants that
//      overlap in that window both read the same starting balance, and the
//      second write silently discards the first. The reservation path already
//      closed exactly this race with reserve_credits' FOR UPDATE; grants never
//      got the same treatment.
//
// Both are now a single statement-level transaction in the
// grant_credits_idempotent RPC, with credit_transactions.idempotency_key as
// the ledger. Pass an idempotencyKey for anything that can legitimately be
// delivered twice (a Stripe event id, a per-user signup key); omit it for
// grants that are meant to be repeatable, such as a manual admin adjustment.
export async function grantCredits(
  userId: string,
  amount: number,
  actionType: string,
  description: string,
  options?: {
    setTotal?: number;
    setPlanTier?: PlanSlug;
    setBetaExpiresAt?: string;
    /**
     * True when the credits were BOUGHT (a pack), rather than granted by a
     * plan, a beta window or a manual adjustment. Purchased credits are
     * tracked in their own sub-ledger and survive every monthly reset;
     * everything else expires with the month it belongs to.
     */
    purchased?: boolean;
    /** Stable key for an operation that must happen at most once. */
    idempotencyKey?: string;
  }
): Promise<{ granted: boolean; creditsRemaining: number }> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("grant_credits_idempotent", {
    p_user_id: userId,
    p_amount: amount,
    p_action_type: actionType,
    p_description: description,
    p_idempotency_key: options?.idempotencyKey ?? null,
    p_set_total: options?.setTotal ?? null,
    p_set_plan_tier: options?.setPlanTier ?? null,
    p_set_beta_expires_at: options?.setBetaExpiresAt ?? null,
    p_purchased: options?.purchased ?? false,
  });

  if (error) {
    // Surfaced rather than swallowed: unlike the optional pack-price column
    // above, a failed grant means a paying customer did not receive what they
    // bought. Callers already wrap this in try/catch and log; letting it
    // through is what makes the failure visible instead of silent.
    logApiError("billing:grantCredits", error, { userId, actionType, amount });
    throw new Error(`Could not grant credits: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    granted: Boolean(row?.granted),
    creditsRemaining: Number(row?.credits_remaining ?? 0),
  };
}

// The cheapest euro-per-credit rate this account has ever bought a credit
// pack at, or null if it has never bought one. Settlement divides by
// min(list price, plan rate, this) so the margin multiplier holds against
// what the customer actually paid — see credit-formula.ts.
//
// Both of these degrade to a no-op rather than throwing if the column is
// missing (the migration hasn't been applied yet): a settlement that falls
// back to the plan rate charges the pre-existing amount, which is the
// current behaviour, whereas a thrown error would break billing outright.
export async function getPurchasedPackCreditPriceEur(userId: string): Promise<number | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_credits")
      .select("min_pack_credit_price_eur")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      logApiError("getPurchasedPackCreditPriceEur", error, { userId });
      return null;
    }
    const raw = (data as { min_pack_credit_price_eur?: number | string | null } | null)
      ?.min_pack_credit_price_eur;
    const value = typeof raw === "string" ? Number(raw) : raw;
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  } catch (err) {
    logApiError("getPurchasedPackCreditPriceEur", err, { userId, stage: "unhandled" });
    return null;
  }
}

/**
 * Records the rate of a pack the user just bought, keeping the running
 * MINIMUM. Minimum, not latest: buying a small pack after a big one must
 * not erase the cheap credits the big one already put in the balance —
 * credits are fungible, so the cheapest rate in play is the only safe
 * basis for the charge.
 */
export async function recordPackPurchaseRate(userId: string, pricePerCreditEur: number): Promise<void> {
  if (!Number.isFinite(pricePerCreditEur) || pricePerCreditEur <= 0) return;
  try {
    const existing = await getPurchasedPackCreditPriceEur(userId);
    const next = existing === null ? pricePerCreditEur : Math.min(existing, pricePerCreditEur);
    if (existing !== null && next === existing) return;

    const admin = createAdminClient();
    const { error } = await admin
      .from("user_credits")
      .update({ min_pack_credit_price_eur: next })
      .eq("user_id", userId);
    if (error) logApiError("recordPackPurchaseRate", error, { userId, pricePerCreditEur });
  } catch (err) {
    logApiError("recordPackPurchaseRate", err, { userId, stage: "unhandled" });
  }
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

  // A plan change ends any grandfathered entitlement. This is the guard
  // that keeps grandfathering from becoming a hole rather than a courtesy:
  // without it, an Ultimate account that downgrades to Starter would keep
  // 1,200 free chat messages — EUR 37.63/month of worst-case spend against
  // EUR 20 of revenue — and downgrading would be the cheapest way to buy
  // the expensive plan's allowance. Runs on every subscription event the
  // Stripe webhook reports, including a cancellation back to Free.
  await clearLegacyEntitlements(userId);

  if (plan.monthlyCredits === "custom") {
    await admin.from("user_credits").upsert(
      { user_id: userId, plan_tier: planSlug },
      { onConflict: "user_id", ignoreDuplicates: false }
    );
    return;
  }

  const total = plan.monthlyCredits;
  // reset_monthly_credits, not an upsert of credits_remaining.
  //
  // PURCHASED CREDITS DO NOT EXPIRE. A pack adds to the same balance
  // column, and writing that column back down to the plan's allotment is
  // what destroyed them — monthly, at every renewal. The RPC re-adds
  // user_credits.purchased_credits inside the same statement, which is
  // also the only way to do it without a race: reading the purchased
  // figure here and writing the sum back would lose any spend that landed
  // in between.
  const { error: resetError } = await admin.rpc("reset_monthly_credits", {
    p_user_id: userId,
    p_monthly: total,
    p_plan_tier: planSlug,
  });
  if (resetError) throw resetError;
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
  // No longer the actual charge: generation cost is now dynamic (see
  // lib/website-generation-cost.ts, used by
  // api/websites/generate/process/route.ts), based on description
  // length, reference image count, and real generated HTML length. Kept
  // here only as an approximate reference point for other code/docs.
  websiteGenerate: 100,
  // Website Builder post-generation editing (api/websites/edit). No
  // longer the actual charge: edits are reserved and settled on MEASURED
  // usage through lib/billing/reservations.ts, exactly like generation —
  // a cheap find-replace patch and a full regeneration have wildly
  // different real costs. Kept only as a reference point for docs.
  websiteEdit: 50,
  // The "does this request need clarifying questions first?" check (see
  // lib/clarification.ts) — a small, cheap, forced-tool-use call that
  // runs before Website Builder, Mission Control, Automations, and
  // Create Anything's real generation call. Charged once per user
  // submission regardless of the verdict (needs clarification or not),
  // shown to the user explicitly before they submit. Never charged twice
  // for the same request — the resubmission after answering skips this
  // check entirely (see each route's skipClarification flag).
  clarificationCheck: 1,
  // Anthropic's native web_search_20250305 server tool (api/chat/route.ts,
  // api/records/ask/route.ts) — small extra cost ON TOP OF the normal
  // chatMessage charge, added ONLY when the model actually performed at
  // least one real search for that reply (response.usage.server_tool_use
  // .web_search_requests > 0 — offering the tool costs nothing by itself,
  // Anthropic only bills for searches actually executed). Charged once
  // per search performed, not once per message, since a single reply can
  // trigger multiple searches.
  webSearchPerQuery: 1,
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
