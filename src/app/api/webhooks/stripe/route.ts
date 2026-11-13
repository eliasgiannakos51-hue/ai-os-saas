import { NextResponse } from "next/server";
import { creditSyncDecision, creditPeriodKey } from "@/lib/billing/subscription-sync";
import { currentPeriodStartSeconds, currentPeriodEndIso } from "@/lib/billing/subscription-period";
import { diagLog } from "@/lib/diag";
import type Stripe from "stripe";
import { createStripeClient } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordSubscriptionEvent } from "@/lib/billing/subscription-log";
import { ADDONS, addonStateFromSubscription, isAddonSlug } from "@/lib/billing/addons";
import { getPlanFromPriceId, getTeamSeatPriceId } from "@/lib/billing/price-ids";
import {
  getCreditPack,
  creditPackPriceEurPerCredit,
  type BillingInterval,
  type PlanSlug,
} from "@/lib/billing/plans";
import {
  grantCredits,
  grantMonthlyPlanCredits,
  syncCreditsForPlan,
  clampCreditsToPlan,
  reversePurchasedCredits,
  recordPackPurchaseRate,
} from "@/lib/billing/credits";
import { logApiError } from "@/lib/log-error";
import { mergeUserMetadata } from "@/lib/auth/user-metadata";
import { revokeTeamGrants } from "@/lib/team/revoke-team-grants";
import { syncTeamGrants } from "@/lib/team/sync-team-grants";
import { disableOverage } from "@/lib/billing/overage-store";
import { billOutstandingOverage } from "@/lib/billing/overage-invoice";
import {
  recordCommissionForInvoice,
  reverseCommissionForInvoice,
} from "@/lib/affiliate/store";

export const dynamic = "force-dynamic";

// Re-derives the user's tier + seat count from the live subscription state
// (rather than trusting the specific event payload) so
// checkout.session.completed and every later subscription.updated event
// converge on the same result regardless of what changed.
//
// `fallbackSupabaseUserId` covers a real gap: the Stripe Customer only
// gets `metadata.supabase_user_id` set at the moment api/checkout CREATES
// a brand-new customer. Any customer created before that convention
// existed, or by any other path, has no such metadata — so a
// checkout.session.completed for that customer would silently no-op here
// forever, with the payment succeeding on Stripe's side but the user's
// plan never updating, and no error visible anywhere except a server log.
// The Checkout Session itself always carries supabase_user_id in its own
// metadata (set every time in api/checkout), so that's passed through as
// a fallback specifically for the checkout.session.completed case below,
// and backfilled onto the customer so later events for the same
// subscription (renewals, plan changes) don't hit the same gap.
async function syncSubscriptionToUser(
  stripe: Stripe,
  subscriptionId: string,
  /**
   * The Stripe event that brought us here. It decides whether the credit
   * balance may be rewritten — see lib/billing/subscription-sync.ts. It is
   * a required argument, in a position every existing caller had to edit,
   * so no call site can quietly go back to resetting on everything.
   */
  eventType: string,
  subscriptionHint?: Stripe.Subscription,
  fallbackSupabaseUserId?: string,
  /** Stripe's own event id, so the revenue log is idempotent: a retried
   *  webhook must not become a second cancellation in the churn count. */
  stripeEventId?: string,
  /** invoice.paid only: the invoice's billing_reason. A renewal opens a
   *  paid period; a proration invoice does not (subscription-sync.ts). */
  billingReason?: string | null
) {
  const subscription =
    subscriptionHint ?? (await stripe.subscriptions.retrieve(subscriptionId));

  // AN ADD-ON IS NOT THE PLAN. A recurring add-on (api/billing/addons) is
  // its own Stripe subscription, marked with metadata.addon_slug, and its
  // price is no plan's price, so it must never be synced as the plan (fixed
  // 2026-10-05). Add-ons are granted by grantAddon below, and their own
  // subscription's later life — cancelled, lapsed, resumed — is followed by
  // syncAddonSubscription (2026-11-05, ΑΣ-4.17), which touches
  // account_addons and nothing of the plan.
  if (subscription.metadata?.addon_slug) return syncAddonSubscription(subscription);

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const customer = await stripe.customers.retrieve(customerId);

  if (customer.deleted) {
    logApiError("/api/webhooks/stripe", new Error("Stripe customer was deleted"), {
      customerId,
    });
    return;
  }

  // TEMPORARY diagnostic logging for the "Business signup flow doesn't
  // work end-to-end" investigation — this sandbox has no network path to
  // Stripe/Supabase to reproduce a real webhook delivery directly, so this
  // traces exactly what the live webhook resolves once deployed. Safe to
  // remove once confirmed.
  diagLog(`[webhook-diag] syncSubscriptionToUser start subscriptionId=${subscriptionId} customerId=${customerId} customerMetadataUserId=${customer.metadata?.supabase_user_id ?? "none"} fallbackSupabaseUserId=${fallbackSupabaseUserId ?? "none"}`);

  let supabaseUserId = customer.metadata?.supabase_user_id;
  if (!supabaseUserId && fallbackSupabaseUserId) {
    supabaseUserId = fallbackSupabaseUserId;
    try {
      await stripe.customers.update(customerId, {
        metadata: { ...customer.metadata, supabase_user_id: fallbackSupabaseUserId },
      });
    } catch (err) {
      logApiError("/api/webhooks/stripe", err, { stage: "backfill_customer_metadata", customerId });
    }
  }
  if (!supabaseUserId) {
    logApiError(
      "/api/webhooks/stripe",
      new Error("Stripe customer missing supabase_user_id metadata"),
      { customerId }
    );
    return;
  }

  const isActive = subscription.status === "active" || subscription.status === "trialing";
  const teamSeatPriceId = getTeamSeatPriceId();

  let planSlug: PlanSlug = "free";
  let seatCount = 0;
  // Monthly unless a matched price says otherwise. Read from the
  // subscription's own price, never from checkout metadata — metadata is
  // whatever we wrote at session creation, and a customer who later
  // switched interval in the Stripe portal would keep the stale value
  // forever. The price id is the fact.
  let interval: BillingInterval = "month";

  if (isActive) {
    for (const item of subscription.items.data) {
      const priceId = item.price.id;
      const matched = getPlanFromPriceId(priceId);
      if (matched) {
        planSlug = matched.slug;
        interval = matched.interval;
      } else if (teamSeatPriceId && priceId === teamSeatPriceId) {
        seatCount = item.quantity ?? 0;
      }
    }
  }

  const admin = createAdminClient();
  const { data: userData, error: getUserError } = await admin.auth.admin.getUserById(
    supabaseUserId
  );
  if (getUserError || !userData?.user) {
    logApiError("/api/webhooks/stripe", getUserError, { stage: "get_user", supabaseUserId });
    return;
  }

  // Read BEFORE the update below overwrites it: the decision is about what
  // changed, and comparing the new tier with itself would make the guard a
  // no-op that still looks correct.
  const previousTier = (userData.user.user_metadata?.subscription_tier as PlanSlug | undefined) ?? null;

  // A MERGE, NOT A REPLACE. This used to spread `userData.user.user_metadata`
  // — the snapshot read a few lines up — over the five keys below and hand
  // the whole object to updateUserById, which replaces user_metadata
  // wholesale. Stripe delivers customer.subscription.updated and invoice.paid
  // inside the same second and Vercel runs them as two concurrent
  // invocations of this handler, so both read the same snapshot and the
  // second write erased whatever the first had added. Anything written
  // between the read and the write by ANOTHER route went the same way: a
  // team grant accepted in that window (team_granted_tier, team_owner_id)
  // vanished, and the member silently lost the plan their owner pays for.
  //
  // mergeUserMetadata does the same five-key merge in one UPDATE statement,
  // under the row lock that statement takes, so there is no window.
  // The snapshot above is still read — previousTier, previousInterval and
  // previousSeats below need it — but it is no longer what gets written.
  const merged = await mergeUserMetadata(
    supabaseUserId,
    {
      stripe_customer_id: customerId,
      stripe_subscription_id: isActive ? subscription.id : null,
      subscription_tier: planSlug,
      seat_count: seatCount,
      // Reset to "month" when the subscription ends, so a lapsed annual
      // customer is not left being priced at the annual credit rate.
      billing_interval: isActive ? interval : "month",
    },
    { context: "/api/webhooks/stripe" }
  );
  const updateError = merged ? null : new Error("merge_user_metadata failed");

  // THE TEAM ENDS WITH THE OWNER'S PAID PERIOD (NEEDS 24). An inactive
  // subscription here is a period that ended unpaid or a cancellation
  // reaching its end — the members' grants go with it, and nothing else.
  //
  // AND OVERAGE ENDS WITH IT (2026-11-05, ΑΣ-4.16). The consent row is
  // deleted, so nothing is charged to an account with no subscription to
  // bill; decideOverage refuses without a live subscription anyway, this
  // is the state that says so. A subscription that has actually ENDED
  // (status canceled) has whatever overage is still unbilled invoiced now,
  // on the card it used — there is no later subscription invoice for it
  // to ride on.
  if (!isActive) {
    const revoked = await revokeTeamGrants(supabaseUserId);
    diagLog(`[webhook-diag] team grants revoked=${revoked} owner=${supabaseUserId}`);
    const overageOff = await disableOverage(supabaseUserId);
    if (!overageOff.ok) {
      logApiError("/api/webhooks/stripe", new Error("could not switch overage off"), { stage: "overage_off", supabaseUserId });
    }
    if (subscription.status === "canceled") {
      const pm = subscription.default_payment_method;
      const final = await billOutstandingOverage({
        userId: supabaseUserId,
        customerId,
        subscriptionId: subscription.id,
        defaultPaymentMethod: typeof pm === "string" ? pm : pm?.id ?? null,
      });
      diagLog(`[webhook-diag] final overage billed=${final?.billedEur ?? "failed"} owner=${supabaseUserId}`);
    }
  } else {
    // THE TEAM FOLLOWS THE PLAN (2026-11-05, ΑΣ-1.16): on every sync of a
    // live owner, members are re-stamped to the owner's tier now, and lose
    // the grant when the plan has no team or fewer seats than members
    // (most recently added first). Counted before and after; only the
    // lent plan moves, never a member's own plan or data.
    const team = await syncTeamGrants(supabaseUserId, { tier: planSlug, seatCount, active: true });
    diagLog(
      `[webhook-diag] team grants owner=${supabaseUserId} members=${team.members} before=${team.grantedBefore} after=${team.grantedAfter} restamped=${team.restamped} revoked=${team.revoked}`
    );
  }
  diagLog(`[webhook-diag] syncSubscriptionToUser result supabaseUserId=${supabaseUserId} planSlug=${planSlug} isActive=${isActive} seatCount=${seatCount} updateError=${updateError?.message ?? "none"}`);

  // CREDITS — a GATE and, inside it, TWO PATHS. Both halves of a merge,
  // and together they are stricter than either side was alone.
  //
  // THE GATE (from the trunk). Stripe fires customer.subscription.updated
  // for a card update, a coupon, an added seat and for setting
  // cancel_at_period_end. Resetting on all of them destroyed the balance
  // of anyone who had bought a credit pack, because a pack ADDS above the
  // plan total and a reset clamps back down to it. creditSyncDecision
  // returns "reset" only for invoice.paid, checkout.session.completed,
  // customer.subscription.deleted, and for a real change of tier.
  //
  // THE TWO PATHS (from the annual-billing branch). Monthly, and every
  // cancellation whatever the interval: reset to the plan's allotment, as
  // before — one invoice a month is one reset a month. Annual: Stripe
  // fires invoice.paid once a YEAR, so a reset would give eleven months
  // of nothing. The annual account gets THIS MONTH's allowance through
  // the same idempotent, month-keyed grant the cron uses, so the first
  // month lands at checkout and a second call inside the same month is a
  // no-op.
  //
  // The branch's own version had no gate: `isActive && interval === "year"`
  // on every event would have granted a fresh month every time an annual
  // customer opened the billing portal. The gate is what makes the annual
  // path safe, so they are not independent — this is why both are here.
  // THE REVENUE LOG, written here because this is the one place both the
  // old tier and the new one are known — a second later the old value is
  // gone from auth.users forever. It never throws and its failure never
  // touches the entitlement above it: a missing row is a gap in a report,
  // and a failed entitlement write is a customer who paid and cannot use
  // what they paid for.
  const previousInterval = (userData.user.user_metadata?.billing_interval as string | undefined) ?? null;
  const previousSeats =
    userData.user.user_metadata?.seat_count === undefined
      ? null
      : Number(userData.user.user_metadata.seat_count) || 0;
  await recordSubscriptionEvent({
    userId: supabaseUserId,
    fromTier: previousTier,
    toTier: planSlug,
    fromInterval: previousInterval,
    toInterval: isActive ? interval : "month",
    fromSeats: previousSeats,
    toSeats: seatCount,
    stripeEventId,
  });

  const decision = creditSyncDecision({ eventType, previousTier, nextTier: planSlug, billingReason });
  // ONE RESET PER PLAN PER PAID PERIOD (ΑΣ-4.15): the period this
  // subscription is in, as Stripe reports it — not the calendar month.
  const periodKey = creditPeriodKey(currentPeriodStartSeconds(subscription));
  if (decision === "reset") {
    try {
      if (isActive && interval === "year") {
        await grantMonthlyPlanCredits(supabaseUserId, planSlug);
      } else {
        await syncCreditsForPlan(
          supabaseUserId,
          planSlug,
          `Subscription ${isActive ? "active" : "ended"}: ${planSlug} plan`,
          periodKey
        );
      }
    } catch (err) {
      logApiError("/api/webhooks/stripe", err, { stage: "sync_credits", supabaseUserId });
    }
  } else if (decision === "clamp") {
    // DOWN, NEVER UP: a lower plan, a lapsed period or the end of the
    // subscription lowers the balance to the new allowance at most.
    try {
      await clampCreditsToPlan(
        supabaseUserId,
        planSlug,
        `Subscription ${isActive ? "moved down" : "ended"}: ${planSlug} plan`
      );
    } catch (err) {
      logApiError("/api/webhooks/stripe", err, { stage: "clamp_credits", supabaseUserId });
    }
  }
  diagLog(`[webhook-diag] creditSync decision=${decision} eventType=${eventType} reason=${billingReason ?? "none"} previousTier=${previousTier ?? "none"} nextTier=${planSlug} period=${periodKey}`);
}

/**
 * A RECURRING ADD-ON'S OWN SUBSCRIPTION CHANGED (2026-11-05, ΑΣ-4.17).
 *
 * The webhook used to return on every add-on subscription event, so
 * nothing ever moved account_addons after the purchase: an add-on whose
 * subscription was cancelled, lapsed unpaid or was deleted in Stripe kept
 * granting for ever (lib/billing/addons.ts reads an active row as active).
 * The row now follows the subscription: cancelled at period end keeps it
 * until that end, an ended or unpaid subscription ends it now, and a
 * resumed one makes it active again. The decision is
 * addonStateFromSubscription; this finds the rows and writes it.
 *
 * Rows are matched by the subscription's own item ids. A row from before
 * the item was recorded (null) is matched once, by account and add-on, and
 * given the item id so the next event finds it directly.
 */
async function syncAddonSubscription(subscription: Stripe.Subscription): Promise<void> {
  const slug = subscription.metadata?.addon_slug;
  const supabaseUserId = subscription.metadata?.supabase_user_id;
  if (!isAddonSlug(slug) || !supabaseUserId) {
    logApiError("/api/webhooks/stripe", new Error("add-on subscription missing metadata"), {
      stage: "sync_addon",
      subscriptionId: subscription.id,
    });
    return;
  }
  const state = addonStateFromSubscription(
    {
      status: subscription.status,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      periodEndIso: currentPeriodEndIso(subscription),
    },
    new Date()
  );
  const itemIds = subscription.items.data.map((item) => item.id);
  const admin = createAdminClient();

  let { data: rows, error } = await admin
    .from("account_addons")
    .select("id, status")
    .eq("user_id", supabaseUserId)
    .eq("addon_slug", slug)
    .in("stripe_subscription_item_id", itemIds.length > 0 ? itemIds : ["-"]);
  if (error) {
    logApiError("/api/webhooks/stripe", error, { stage: "sync_addon_read", slug });
    return;
  }
  if (!rows || rows.length === 0) {
    const legacy = await admin
      .from("account_addons")
      .select("id, status")
      .eq("user_id", supabaseUserId)
      .eq("addon_slug", slug)
      .is("stripe_subscription_item_id", null)
      .order("purchased_at", { ascending: true })
      .limit(1);
    rows = legacy.data ?? [];
    if (rows.length > 0 && itemIds[0]) {
      await admin.from("account_addons").update({ stripe_subscription_item_id: itemIds[0] }).eq("id", rows[0].id);
    }
  }
  if (rows.length === 0) {
    // Usually the purchase itself, arriving before checkout.session.completed
    // has written the row. grantAddon writes it active, which is what a live
    // subscription means.
    diagLog(`[webhook-diag] add-on subscription with no row yet sub=${subscription.id} slug=${slug}`);
    return;
  }

  const ids = rows.map((r) => r.id);
  const write =
    state.status === "active"
      ? { status: "active", expires_at: null, cancelled_at: null }
      : { status: "cancelled", expires_at: state.expiresAt };
  const { error: writeError } = await admin.from("account_addons").update(write).in("id", ids);
  if (writeError) {
    logApiError("/api/webhooks/stripe", writeError, { stage: "sync_addon_write", slug });
    return;
  }
  // When it was cancelled is recorded once, on the rows that were active.
  if (state.status === "cancelled") {
    const wasActive = rows.filter((r) => r.status === "active").map((r) => r.id);
    if (wasActive.length > 0) {
      await admin.from("account_addons").update({ cancelled_at: new Date().toISOString() }).in("id", wasActive);
    }
  }
  diagLog(`[webhook-diag] add-on synced sub=${subscription.id} slug=${slug} rows=${ids.length} status=${state.status} expires=${state.expiresAt ?? "none"}`);
}

/**
 * WAS THIS CHECKOUT ACTUALLY PAID? (2026-11-05, ΑΣ-4.18)
 *
 * checkout.session.completed means the customer finished the page, not
 * that the money arrived: with a delayed payment method the session
 * completes `unpaid`, and Stripe sends checkout.session.async_payment_
 * succeeded or _failed later. Packs and add-ons were granted on
 * completion regardless. Now they are granted only on a `paid` session —
 * on completion when the card paid at once, on async_payment_succeeded
 * otherwise — and both paths are keyed on the session, so a session that
 * reports paid twice grants once.
 */
function sessionIsPaid(session: Stripe.Checkout.Session, eventId: string): boolean {
  if (session.payment_status === "paid") return true;
  diagLog(
    `[webhook-diag] checkout not paid yet, nothing granted session=${session.id} event=${eventId} payment_status=${session.payment_status}`
  );
  return false;
}

/**
 * A REFUND OR A LOST DISPUTE TAKES THE PACK'S CREDITS BACK (2026-11-05,
 * ΑΣ-4.18).
 *
 * Only a one-off purchase — a credit pack or a credit add-on, found
 * through the Checkout Session that took the payment, and only one this
 * webhook actually granted (its ledger key is there). A subscription
 * invoice is not a pack; its refund reverses the commission above and
 * nothing here.
 *
 * Proportional to what came back: a partial refund takes that share of
 * the pack, a lost dispute all of it. CUMULATIVE AND ONCE: every reversal
 * for a charge is keyed `stripe_reversal:<charge>:<total so far>`, so a
 * redelivered event takes nothing and a second, larger refund takes only
 * the difference. The balance floors at zero (reverse_purchased_credits):
 * what was already spent is not owed back as a negative balance, and the
 * ledger row says how much was actually taken.
 */
async function reversePackForCharge(stripe: Stripe, event: Stripe.Event): Promise<void> {
  try {
    let chargeId: string | null = null;
    let paymentIntentId: string | null = null;
    let share = 0;
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      chargeId = charge.id;
      paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
      share = charge.amount > 0 ? Math.min(1, Math.max(0, charge.amount_refunded / charge.amount)) : 0;
    } else if (event.type === "charge.dispute.closed") {
      const dispute = event.data.object as Stripe.Dispute;
      // A won dispute is money that stayed with us; nothing is taken back.
      if (dispute.status !== "lost") return;
      chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id ?? null;
      paymentIntentId =
        typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id ?? null;
      share = 1;
    }
    if (!chargeId || !paymentIntentId || share <= 0) return;

    const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
    const session = sessions.data[0];
    if (!session || session.mode !== "payment") return;
    const supabaseUserId = session.metadata?.supabase_user_id;
    const addonSlug = session.metadata?.addon_slug;
    let packCredits = 0;
    let grantKey = "";
    if (addonSlug) {
      if (isAddonSlug(addonSlug) && ADDONS[addonSlug].grants.kind === "credits") {
        const grants = ADDONS[addonSlug].grants as { kind: "credits"; amount: number };
        packCredits = grants.amount;
        grantKey = `stripe_addon:${session.id}`;
      }
    } else {
      packCredits = Number(session.metadata?.credit_amount) || 0;
      grantKey = `stripe_checkout:${session.id}`;
    }
    if (!supabaseUserId || packCredits <= 0 || !grantKey) return;

    const admin = createAdminClient();
    // Only what this webhook granted can be taken back.
    const { data: granted } = await admin
      .from("credit_transactions")
      .select("id")
      .eq("user_id", supabaseUserId)
      .eq("idempotency_key", grantKey)
      .limit(1);
    if (!granted || granted.length === 0) return;

    const prefix = `stripe_reversal:${chargeId}:`;
    const { data: earlier } = await admin
      .from("credit_transactions")
      .select("idempotency_key")
      .eq("user_id", supabaseUserId)
      .like("idempotency_key", `${prefix}%`)
      .limit(100);
    const alreadyRequested = Math.max(
      0,
      ...(earlier ?? []).map((row) => Number(String(row.idempotency_key ?? "").slice(prefix.length)) || 0)
    );
    const target = Math.floor(packCredits * share);
    const delta = target - alreadyRequested;
    if (delta <= 0) return;

    // The ledger line names the purchase the way the grant named it
    // (`Add-on: <slug>` / `Purchased <pack> credit pack`).
    const purchase = addonSlug ? `add-on ${addonSlug}` : `${session.metadata?.credit_pack_id ?? "unknown_pack"} credit pack`;
    const result = await reversePurchasedCredits(
      supabaseUserId,
      delta,
      `${prefix}${target}`,
      `${event.type === "charge.refunded" ? "Refunded" : "Disputed"} purchase: ${purchase}`
    );
    diagLog(
      `[webhook-diag] pack reversal charge=${chargeId} requested=${delta} taken=${result?.debited ?? "failed"} applied=${result?.applied ?? false}`
    );
  } catch (err) {
    logApiError("/api/webhooks/stripe", err, { stage: "reverse_pack", eventType: event.type });
  }
}

/**
 * An add-on the customer just bought (api/billing/addons).
 *
 * IDEMPOTENT ON STRIPE'S EVENT ID. Stripe retries; a retried
 * checkout.session.completed must not grant five more agents twice. The
 * unique constraint on account_addons.stripe_event_id is what enforces
 * it — a duplicate insert fails, and that failure is the guard working
 * rather than an error.
 */
async function grantAddon(session: Stripe.Checkout.Session, eventId: string) {
  // NOTHING BEFORE THE MONEY (2026-11-05, ΑΣ-4.18): see sessionIsPaid.
  if (!sessionIsPaid(session, eventId)) return;
  const supabaseUserId = session.metadata?.supabase_user_id;
  const slug = session.metadata?.addon_slug;
  if (!supabaseUserId || !isAddonSlug(slug)) {
    logApiError("/api/webhooks/stripe", new Error("addon session missing metadata"), {
      stage: "grant_addon",
      eventId,
    });
    return;
  }

  const admin = createAdminClient();
  // For a recurring add-on, the subscription item is what cancelling has
  // to remove later. Read from the session's line items rather than
  // guessed at.
  let subscriptionItemId: string | null = null;
  try {
    if (session.mode === "subscription" && session.subscription) {
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      const stripe = createStripeClient();
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = process.env[ADDONS[slug].priceEnvVar];
      const item = subscription.items.data.find((i) => i.price.id === priceId);
      subscriptionItemId = item?.id ?? null;
    }
  } catch (err) {
    logApiError("/api/webhooks/stripe", err, { stage: "grant_addon_item", slug });
  }

  const { error } = await admin.from("account_addons").insert({
    user_id: supabaseUserId,
    addon_slug: slug,
    quantity: 1,
    status: "active",
    stripe_subscription_item_id: subscriptionItemId,
    stripe_event_id: eventId,
  });
  if (error && !String(error.message ?? "").includes("duplicate key")) {
    logApiError("/api/webhooks/stripe", error, { stage: "grant_addon", slug, supabaseUserId });
    return;
  }

  // A CREDIT PACK ADD-ON GRANTS CREDITS, and it does so through the same
  // path the standalone credit pack uses — one place where credits are
  // added, one place for the arithmetic to be wrong.
  const grants = ADDONS[slug].grants;
  if (grants.kind === "credits") {
    try {
      // KEYED ON THE SESSION, exactly like the standalone credit pack
      // above, and for the same reason: one purchase is one session, but
      // Stripe can deliver several EVENTS that refer to it.
      const { granted } = await grantCredits(
        supabaseUserId,
        grants.amount,
        "purchase",
        `Add-on: ${slug}`,
        { idempotencyKey: `stripe_addon:${session.id}`, purchased: true }
      );
      if (!granted) {
        diagLog(`[webhook-diag] duplicate addon credit grant suppressed session=${session.id} event=${eventId}`);
      } else {
        // What these credits cost, recorded like a pack's (below), so the
        // margin a settlement reports is taken on what was actually paid.
        // It was never recorded for the add-on, and since 2026-10-03 the
        // charge is one size for everyone — this is the only place a
        // cheaper credit can still be seen.
        await recordPackPurchaseRate(supabaseUserId, ADDONS[slug].priceEur / grants.amount);
      }
    } catch (err) {
      logApiError("/api/webhooks/stripe", err, { stage: "grant_addon_credits", slug });
    }
  }
}

// One-time credit pack purchase (api/credits/checkout, mode: "payment") —
// grants credits from the session's own metadata rather than re-deriving
// anything from a subscription, since a credit pack purchase isn't one.
async function grantPurchasedCredits(session: Stripe.Checkout.Session, eventId: string) {
  // NOTHING BEFORE THE MONEY (2026-11-05, ΑΣ-4.18): see sessionIsPaid.
  if (!sessionIsPaid(session, eventId)) return;
  const supabaseUserId = session.metadata?.supabase_user_id;
  const creditAmount = Number(session.metadata?.credit_amount);
  const packId = session.metadata?.credit_pack_id ?? "unknown_pack";

  if (!supabaseUserId || !Number.isFinite(creditAmount) || creditAmount <= 0) {
    logApiError(
      "/api/webhooks/stripe",
      new Error("checkout.session.completed (payment) missing/invalid credit metadata"),
      { sessionId: session.id }
    );
    return;
  }

  // Keyed on the checkout session, not the event id: a single purchase is
  // one session, but Stripe can deliver more than one EVENT that refers to
  // it (a retry of checkout.session.completed, an async_payment_succeeded
  // for the same session, a manual resend). Keying on the session is what
  // makes "this pack has been granted" true across all of them.
  const { granted } = await grantCredits(
    supabaseUserId,
    creditAmount,
    "purchase",
    `Purchased ${packId} credit pack`,
    // purchased: this is money for credits, not a plan allowance. It goes
    // into the sub-ledger that survives every monthly reset.
    { idempotencyKey: `stripe_checkout:${session.id}`, purchased: true }
  );

  if (!granted) {
    // A replay. Not an error — this is the guard doing its job — but worth
    // a log line, because a HIGH rate of these means something upstream is
    // redelivering far more than Stripe normally would.
    diagLog(`[webhook-diag] duplicate credit grant suppressed session=${session.id} event=${eventId}`);
    return;
  }

  // Packs sell credits below list price (€100 / 8,000 = €0.0125 each).
  // Persist the rate so settlement charges against what was actually paid
  // instead of the €0.02 list price — otherwise the 4x multiplier collapses
  // to 2.5x on the biggest pack. Derived from the pack catalogue, not from
  // the session amount, so a Stripe-side price edit can't silently move it.
  const pack = getCreditPack(packId);
  if (pack) {
    await recordPackPurchaseRate(supabaseUserId, creditPackPriceEurPerCredit(pack));
  }
}

/**
 * Turns a paid invoice into affiliate commission, if the payer was
 * referred (salvaged from the three-bugs-landing-page branch).
 *
 * Resolving WHO paid goes through the Stripe customer's
 * `supabase_user_id` metadata — the same link syncSubscriptionToUser
 * uses — because the invoice itself carries no Supabase id. A customer
 * without that metadata predates the convention; nothing to attribute.
 *
 * Never throws: an affiliate bookkeeping failure must not stop a
 * subscription from being synced.
 */
async function recordAffiliateCommission(stripe: Stripe, invoice: Stripe.Invoice): Promise<void> {
  try {
    const amountCents = invoice.amount_paid ?? 0;
    if (amountCents <= 0 || !invoice.id) return;

    const customerRef = invoice.customer;
    const customerId = typeof customerRef === "string" ? customerRef : customerRef?.id;
    if (!customerId) return;

    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return;
    const supabaseUserId = customer.metadata?.supabase_user_id;
    if (!supabaseUserId) return;

    await recordCommissionForInvoice({
      referredUserId: supabaseUserId,
      stripeInvoiceId: invoice.id,
      amountCents,
      paidAt: new Date((invoice.status_transitions?.paid_at ?? invoice.created) * 1000),
    });
  } catch (err) {
    logApiError("/api/webhooks/stripe", err, { stage: "affiliate_commission" });
  }
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");

  // TEMPORARY diagnostic — if this line never appears in production logs
  // at all after a real checkout, Stripe isn't reaching this endpoint (a
  // dashboard webhook-URL/deploy config issue), which would explain "the
  // whole flow doesn't work" far more broadly than anything in this
  // route's own logic could.
  diagLog(`[webhook-diag] POST received hasSecret=${Boolean(webhookSecret)} hasSignature=${Boolean(signature)}`);

  if (!webhookSecret || !signature) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const stripe = createStripeClient();
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    logApiError("/api/webhooks/stripe", err, { stage: "verify_signature" });
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  diagLog(`[webhook-diag] event verified type=${event.type} id=${event.id}`);

  try {
    switch (event.type) {
      // A delayed payment that went through is the same purchase completing:
      // the same path, now with a `paid` session (sessionIsPaid).
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // IONEXA PAYMENTS: a customer paying one of our user's products.
        // Identified by the metadata the checkout put on the session.
        // Handled BEFORE the subscription/credit-pack branches because
        // those check `mode === "payment"` too and would fall through.
        if (session.metadata?.platform === "ionexa_payments") {
          // Subscription mode: record the new subscription.
          if (session.mode === "subscription" && session.subscription) {
            const { recordSubscription } = await import("@/lib/payments/subscriptions");
            const subId = typeof session.subscription === "string"
              ? session.subscription : session.subscription.id;
            const custId = typeof session.customer === "string"
              ? session.customer : session.customer?.id ?? "";
            await recordSubscription({
              userId: session.metadata.ionexa_user_id,
              accountId: session.metadata.ionexa_account_id,
              productId: session.metadata.ionexa_product_id,
              stripeSubscriptionId: subId,
              stripeCustomerId: custId,
              status: "active",
              currentPeriodStart: new Date().toISOString(),
              currentPeriodEnd: new Date().toISOString(), // updated by sub.updated
              cancelAtPeriodEnd: false,
              trialEnd: null,
              customerEmail: session.customer_details?.email ?? null,
              customerName: session.customer_details?.name ?? null,
            });
          }
          // One-time mode (or subscription first payment): record payment.
          const { recordPayment } = await import("@/lib/payments/checkout");
          await recordPayment({
            userId: session.metadata.ionexa_user_id,
            accountId: session.metadata.ionexa_account_id,
            productId: session.metadata.ionexa_product_id || null,
            stripePaymentIntentId:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent?.id ?? null,
            stripeCheckoutSessionId: session.id,
            amountCents: session.amount_total ?? 0,
            currency: session.currency ?? "eur",
            feeCents: Math.round((session.amount_total ?? 0) * 0.025),
            customerEmail: session.customer_details?.email ?? null,
            customerName: session.customer_details?.name ?? null,
            description: session.metadata.ionexa_product_id
              ? `Product ${session.metadata.ionexa_product_id}`
              : "Ionexa Payment",
          });
          break;
        }
        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          await syncSubscriptionToUser(
            stripe,
            subscriptionId,
            event.type,
            undefined,
            session.metadata?.supabase_user_id,
            event.id
          );
        } else if (session.mode === "payment" && !session.metadata?.addon_slug) {
          // A credit pack. An add-on pack is also a one-off payment, and
          // the two are told apart by the metadata the checkout put on
          // the session — not by the amount, which two products could
          // share. The add-on is granted once, below, in the one place
          // that covers both modes.
          await grantPurchasedCredits(session, event.id);
        }
        // AN ADD-ON ARRIVES IN BOTH MODES, AND IS GRANTED EXACTLY ONCE.
        // A one-off add-on is mode "payment"; a recurring one rides a
        // subscription checkout, where the branch above syncs the plan
        // and nothing else would grant it.
        //
        // IT USED TO BE GRANTED TWICE for a one-off: once inside the
        // "payment" branch and once here. Nothing was double-granted —
        // the unique constraint on account_addons.stripe_event_id
        // refused the second insert and grantCredits refused the second
        // grant on its session key — but the second pass through
        // grantAddon logged "duplicate addon credit grant suppressed" on
        // every legitimate credit add-on purchase. A diagnostic that
        // fires on the happy path is worse than none: it trains whoever
        // reads the log to scroll past the line that will one day mean
        // something.
        if (session.metadata?.addon_slug) await grantAddon(session, event.id);
        break;
      }
      case "checkout.session.async_payment_failed": {
        // The money never arrived, so nothing was granted for this session
        // and nothing is taken back. A subscription bought this way stays
        // incomplete and its own events carry it from there.
        const session = event.data.object as Stripe.Checkout.Session;
        diagLog(`[webhook-diag] delayed payment failed, nothing granted session=${session.id} event=${event.id}`);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        // IONEXA PAYMENTS: a subscription on a user's connected account.
        if (subscription.metadata?.platform === "ionexa_payments") {
          const { recordSubscription, updateSubscriptionStatus } = await import("@/lib/payments/subscriptions");
          const status = subscription.status as "active" | "past_due" | "canceled" | "trialing" | "paused" | "unpaid";
          if (event.type === "customer.subscription.deleted") {
            await updateSubscriptionStatus(subscription.id, "canceled");
          } else {
            await recordSubscription({
              userId: subscription.metadata.ionexa_user_id,
              accountId: subscription.metadata.ionexa_account_id,
              productId: subscription.metadata.ionexa_product_id,
              stripeSubscriptionId: subscription.id,
              stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
              status,
              // The Stripe API returns current_period_start/end on the subscription
              // object, but newer SDK types moved them to items. Cast to access.
              currentPeriodStart: new Date(((subscription as unknown as { current_period_start?: number }).current_period_start ?? 0) * 1000).toISOString(),
              currentPeriodEnd: new Date(((subscription as unknown as { current_period_end?: number }).current_period_end ?? 0) * 1000).toISOString(),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
              customerEmail: null, // not on the subscription object
              customerName: null,
            });
          }
          break;
        }
        await syncSubscriptionToUser(stripe, subscription.id, event.type, subscription, undefined, event.id);
        break;
      }
      case "invoice.paid": {
        // Recurring monthly renewal — a normal billing-cycle rollover
        // doesn't fire customer.subscription.updated, so this is the event
        // that actually resets credits for an unchanged subscription.
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionRef = invoice.parent?.subscription_details?.subscription;
        const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
        if (subscriptionId) {
          await syncSubscriptionToUser(
            stripe,
            subscriptionId,
            event.type,
            undefined,
            undefined,
            event.id,
            invoice.billing_reason ?? null
          );
        }
        // Affiliate commission accrues from the invoice that was actually
        // PAID, not from the plan's list price — a discounted or prorated
        // invoice settles for less than list, and paying a percentage of
        // list would send out more than came in.
        await recordAffiliateCommission(stripe, invoice);
        break;
      }
      // Money that came back has to take the commission with it.
      case "charge.refunded":
      case "charge.dispute.closed": {
        // The SDK's Charge/Dispute types do not expose `invoice`, and the
        // two events carry it in different places — a refund on the charge
        // itself, a dispute one level down under `charge`. Read both
        // shapes rather than trusting either.
        const object = event.data.object as unknown as {
          invoice?: string | { id?: string } | null;
          charge?: string | { invoice?: string | { id?: string } | null } | null;
        };
        const raw =
          object.invoice ?? (typeof object.charge === "object" ? object.charge?.invoice : null);
        const invoiceId = typeof raw === "string" ? raw : raw?.id;
        if (invoiceId) await reverseCommissionForInvoice(invoiceId);
        // ...and a pack's credits with it (ΑΣ-4.18).
        await reversePackForCharge(stripe, event);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // Still respond 200 below — Stripe retries non-2xx responses, and a bug
    // on our side in handling this specific event shouldn't cause Stripe to
    // keep hammering this endpoint for an event it will never process
    // successfully without a code fix.
    logApiError("/api/webhooks/stripe", err, { stage: "handle_event", eventType: event.type });
  }

  return NextResponse.json({ received: true });
}
