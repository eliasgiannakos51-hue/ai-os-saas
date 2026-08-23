import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { hasActiveBetaBypass, isBetaTester } from "@/lib/beta";
import { diagLog } from "@/lib/diag";
import {
  getPlan,
  higherPlanSlug,
  annualMonthlyEquivalentEur,
  type BillingInterval,
  type Plan,
  type PlanSlug,
} from "./plans";
import { isAdminEmail } from "@/lib/admin";
import { clearLegacyEntitlements } from "@/lib/billing/legacy-entitlements";

// The plan an account is on is resolved in lib/billing/plan-resolution.ts
// — pure, and therefore unit-testable, which this module is not. Re-exported
// so every existing `from "@/lib/billing/credits"` import keeps working.
import { resolvePlanSlug, resolvePlan } from "@/lib/billing/plan-resolution";
export { resolvePlanSlug, resolvePlan };

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

/**
 * Which billing interval this account is on. Written by the Stripe
 * webhook from the subscription's own price, never from anything the
 * client sends.
 */
export function resolveBillingInterval(
  user: { user_metadata?: Record<string, unknown> | null } | null | undefined
): BillingInterval {
  return user?.user_metadata?.billing_interval === "year" ? "year" : "month";
}

/**
 * The plan in effect, priced at WHAT THIS ACCOUNT ACTUALLY PAYS PER
 * MONTH.
 *
 * For a monthly subscriber that is the catalogue price. For an annual one
 * it is the discounted price divided by twelve — €192/yr becomes €16.
 *
 * WHY THE PRICE IS REWRITTEN HERE rather than an `interval` argument
 * threaded through settlement. Every credit-price divisor in the app is
 * ultimately `plan.price / plan.monthlyCredits`
 * (effectiveCreditPriceEur), and the whole margin guarantee rests on that
 * divisor being what the customer really pays. Annual sells the same
 * credits for 20% less, so leaving `price` at the catalogue figure would
 * drop every annual settlement from 4x to 3.2x — the exact leak the plan
 * and credit-pack fixes already closed, arriving through a third door,
 * and invisible for the same reason: the stored margin would be computed
 * from the same wrong divisor and read as healthy.
 *
 * Returning the real monthly price makes every existing call site correct
 * with no change, which is a much smaller surface to get wrong than 31
 * threaded arguments.
 *
 * The CATALOGUE price is still what /pricing renders — that reads PLANS
 * directly, and must, because it is advertising a rate rather than
 * describing an account.
 */
export async function resolveEffectivePlan(
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined
): Promise<Plan> {
  const plan = getPlan(await resolveEffectivePlanSlug(user)) ?? getPlan("free")!;
  if (resolveBillingInterval(user) !== "year") return plan;
  const monthly = annualMonthlyEquivalentEur(plan);
  if (monthly === null) return plan;
  return { ...plan, price: monthly };
}

type CreditsRow = {
  credits_remaining: number;
  credits_total: number;
  plan_tier: string;
  beta_expires_at: string | null;
  /** The best per-credit price this account has ever bought a pack at.
   *  Selected here rather than by a second read of the same row: the
   *  dashboard layout needs both the balance and this price on every page
   *  load, and asking user_credits twice for one row is a round trip the
   *  user waits through on every navigation. */
  min_pack_credit_price_eur?: number | string | null;
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
    // `*`, not a column list, on purpose. Naming min_pack_credit_price_eur
    // explicitly makes this read FAIL on a database where that column is
    // missing — and a failed read here does not degrade, it falls through
    // to the insert path, which loses to the unique index and returns the
    // plan's monthly allotment as if it were the balance. A user would see
    // a wrong number, not an error. `*` returns whatever the row has.
    .select("*")
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
    .select("*")
    .single();

  return (
    (inserted as CreditsRow) ?? {
      credits_remaining: initial,
      credits_total: initial,
      plan_tier: plan.slug,
      beta_expires_at: null,
      min_pack_credit_price_eur: null,
    }
  );
}

/** The pack price out of a row already read, for the callers that have
 *  one — same normalisation as getPurchasedPackCreditPriceEur, no query. */
export function packCreditPriceEurFromRow(row: {
  min_pack_credit_price_eur?: number | string | null;
}): number | null {
  const raw = row.min_pack_credit_price_eur;
  const value = typeof raw === "string" ? Number(raw) : raw;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

// Read-only balance check — no write, no transaction log. Used to gate an
// expensive AI call BEFORE it starts (reject early with a clear "not
// enough credits" message, same as before) while the actual deduction
// (see deductCredits) happens only once that call has confirmed-
// successfully completed — see api/websites/generate/route.ts,
// api/create/route.ts and api/chat/route.ts for the two-step pattern this
// enables: check-then-call-then-deduct, instead of the old deduct-then-
// call (which charged the user even when the call itself failed).
/**
 * Can this account afford `amount` right now?
 *
 * OVERAGE HEADROOM COUNTS, AND IS NOT SPENT HERE. Ten routes ask this
 * question BEFORE they call reserveCredits, so a balance-only answer
 * would refuse the action and reserveCredits — the one place overage
 * actually happens — would never be reached. An account that consented to
 * overage, under a cap with room in it, can afford this.
 *
 * NOTHING IS CHARGED BY ASKING. This reads the settings and the month's
 * ledger and returns a verdict; the charge is made once, later, inside
 * reserveCredits. A pre-check that took money would charge for actions
 * that were then refused for some other reason entirely.
 *
 * `overageWouldCover` lets the caller say so — "you are out of credits,
 * this will use your overage" is a different message from "you are out of
 * credits".
 */
export async function hasEnoughCredits(
  userId: string,
  amount: number,
  plan: Plan
): Promise<{ ok: boolean; remaining: number; overageWouldCover?: boolean }> {
  const row = await getOrInitCredits(userId, plan);
  if (row.credits_remaining >= amount) return { ok: true, remaining: row.credits_remaining };

  try {
    const { checkOverage } = await import("@/lib/billing/overage-store");
    const shortfall = Math.max(0, Math.ceil(amount - row.credits_remaining));
    const { decision } = await checkOverage({ userId, shortfall });
    if (decision.allowed) return { ok: true, remaining: row.credits_remaining, overageWouldCover: true };
  } catch {
    // FAILS TO REFUSE. An unreadable overage state means the account is
    // treated as it was before overage existed — out of credits — which
    // is the same thing reserveCredits would conclude a moment later.
  }
  return { ok: false, remaining: row.credits_remaining };
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

/**
 * The calendar month a monthly allowance belongs to, as "YYYY-MM".
 *
 * The idempotency key is built from this, so it is what makes "grant this
 * month's credits" safe to call from a cron that may retry, from a
 * webhook that Stripe may redeliver, and from both at once.
 */
export function creditMonthKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * One month's credit allowance for a plan, granted at most once per
 * calendar month.
 *
 * WHY THIS EXISTS. Credits used to arrive entirely through the Stripe
 * webhook: `invoice.paid` fires, syncCreditsForPlan resets the balance to
 * the plan's monthly allotment. For a monthly subscriber that is exactly
 * right — one invoice a month, one allowance a month.
 *
 * For an ANNUAL subscriber, Stripe fires invoice.paid ONCE A YEAR. On the
 * old path a €192/year Starter customer would have received 1,000 credits
 * in January and nothing until the following January. That is not a
 * subtle bug — it is eleven months of an unusable product — and it is why
 * "credits given monthly, not all at once" cannot be satisfied by the
 * webhook alone.
 *
 * `setTotal` moves credits_total too, so the balance and the plan's
 * allowance stay in step through an upgrade mid-year.
 *
 * Returns whether it actually granted, so the caller can count.
 */
export async function grantMonthlyPlanCredits(
  userId: string,
  planSlug: PlanSlug,
  monthKey: string = creditMonthKey()
): Promise<boolean> {
  const plan = getPlan(planSlug);
  if (!plan || typeof plan.monthlyCredits !== "number" || plan.monthlyCredits <= 0) return false;
  const { granted } = await grantCredits(
    userId,
    plan.monthlyCredits,
    "plan_renewal",
    `Monthly credits for the ${plan.name} plan (${monthKey})`,
    {
      // The whole safety property. The same key from the cron, from a
      // Stripe redelivery, and from the first month of a new annual
      // subscription — so all three can call this and exactly one grant
      // lands.
      idempotencyKey: `plan_month:${userId}:${monthKey}`,
      setTotal: plan.monthlyCredits,
      setPlanTier: planSlug,
    }
  );
  return granted;
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
