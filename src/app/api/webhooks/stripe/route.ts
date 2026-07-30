import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createStripeClient } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanSlugFromPriceId, getTeamSeatPriceId } from "@/lib/billing/price-ids";
import type { PlanSlug } from "@/lib/billing/plans";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

// Re-derives the user's tier + seat count from the live subscription state
// (rather than trusting the specific event payload) so
// checkout.session.completed and every later subscription.updated event
// converge on the same result regardless of what changed.
async function syncSubscriptionToUser(
  stripe: Stripe,
  subscriptionId: string,
  subscriptionHint?: Stripe.Subscription
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

  const supabaseUserId = customer.metadata?.supabase_user_id;
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
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");

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

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          await syncSubscriptionToUser(stripe, subscriptionId);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscriptionToUser(stripe, subscription.id, subscription);
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
