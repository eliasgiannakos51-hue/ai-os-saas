import { NextResponse } from "next/server";
import { diagLog } from "@/lib/diag";
import type Stripe from "stripe";
import { createStripeClient } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanSlugFromPriceId, getTeamSeatPriceId } from "@/lib/billing/price-ids";
import { getCreditPack, creditPackPriceEurPerCredit, type PlanSlug } from "@/lib/billing/plans";
import { grantCredits, syncCreditsForPlan, recordPackPurchaseRate } from "@/lib/billing/credits";
import { logApiError } from "@/lib/log-error";

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
  subscriptionHint?: Stripe.Subscription,
  fallbackSupabaseUserId?: string
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

  if (isActive) {
    for (const item of subscription.items.data) {
      const priceId = item.price.id;
      const matchedPlan = getPlanSlugFromPriceId(priceId);
      if (matchedPlan) {
        planSlug = matchedPlan;
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

  const { error: updateError } = await admin.auth.admin.updateUserById(supabaseUserId, {
    user_metadata: {
      ...userData.user.user_metadata,
      stripe_customer_id: customerId,
      stripe_subscription_id: isActive ? subscription.id : null,
      subscription_tier: planSlug,
      seat_count: seatCount,
    },
  });
  if (updateError) {
    logApiError("/api/webhooks/stripe", updateError, { stage: "update_user", supabaseUserId });
  }
  diagLog(`[webhook-diag] syncSubscriptionToUser result supabaseUserId=${supabaseUserId} planSlug=${planSlug} isActive=${isActive} seatCount=${seatCount} updateError=${updateError?.message ?? "none"}`);

  // Resets the credit balance to the (new) plan's monthly allotment — same
  // call on a brand-new subscription, a plan change, a cancellation (falls
  // back to Free's allotment since planSlug is "free" when !isActive), and
  // a recurring renewal (see the invoice.paid handler below).
  try {
    await syncCreditsForPlan(supabaseUserId, planSlug, `Subscription ${isActive ? "active" : "ended"}: ${planSlug} plan`);
  } catch (err) {
    logApiError("/api/webhooks/stripe", err, { stage: "sync_credits", supabaseUserId });
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
    { idempotencyKey: `stripe_checkout:${session.id}` }
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
            undefined,
            session.metadata?.supabase_user_id
          );
        } else if (session.mode === "payment") {
          await grantPurchasedCredits(session, event.id);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscriptionToUser(stripe, subscription.id, subscription);
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
          await syncSubscriptionToUser(stripe, subscriptionId);
        }
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
