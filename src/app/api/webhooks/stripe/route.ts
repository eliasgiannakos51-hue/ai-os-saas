import { NextResponse } from "next/server";
import { creditSyncDecision } from "@/lib/billing/subscription-sync";
import { diagLog } from "@/lib/diag";
import type Stripe from "stripe";
import { createStripeClient } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordSubscriptionEvent } from "@/lib/billing/subscription-log";
import { ADDONS, isAddonSlug } from "@/lib/billing/addons";
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
  recordPackPurchaseRate,
} from "@/lib/billing/credits";
import { logApiError } from "@/lib/log-error";
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
  stripeEventId?: string
) {
  const subscription =
    subscriptionHint ?? (await stripe.subscriptions.retrieve(subscriptionId));

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

  const { error: updateError } = await admin.auth.admin.updateUserById(supabaseUserId, {
    user_metadata: {
      ...userData.user.user_metadata,
      stripe_customer_id: customerId,
      stripe_subscription_id: isActive ? subscription.id : null,
      subscription_tier: planSlug,
      seat_count: seatCount,
      // Reset to "month" when the subscription ends, so a lapsed annual
      // customer is not left being priced at the annual credit rate.
      billing_interval: isActive ? interval : "month",
    },
  });
  if (updateError) {
    logApiError("/api/webhooks/stripe", updateError, { stage: "update_user", supabaseUserId });
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

  const decision = creditSyncDecision({ eventType, previousTier, nextTier: planSlug });
  if (decision === "reset") {
    try {
      if (isActive && interval === "year") {
        await grantMonthlyPlanCredits(supabaseUserId, planSlug);
      } else {
        await syncCreditsForPlan(
          supabaseUserId,
          planSlug,
          `Subscription ${isActive ? "active" : "ended"}: ${planSlug} plan`
        );
      }
    } catch (err) {
      logApiError("/api/webhooks/stripe", err, { stage: "sync_credits", supabaseUserId });
    }
  }
  diagLog(`[webhook-diag] creditSync decision=${decision} eventType=${eventType} previousTier=${previousTier ?? "none"} nextTier=${planSlug}`);
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
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
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
        } else if (session.mode === "payment") {
          // An add-on pack and a credit pack are both one-off payments,
          // and they are told apart by the metadata the checkout put on
          // the session — not by the amount, which two products could
          // share.
          if (session.metadata?.addon_slug) await grantAddon(session, event.id);
          else await grantPurchasedCredits(session, event.id);
        }
        // A SUBSCRIPTION CHECKOUT CAN ALSO BE AN ADD-ON. The branch above
        // syncs the plan; a session carrying addon_slug is a recurring
        // add-on bought on top of it, and without this it would be paid
        // for and never granted.
        if (session.metadata?.addon_slug) await grantAddon(session, event.id);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
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
          await syncSubscriptionToUser(stripe, subscriptionId, event.type, undefined, undefined, event.id);
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
