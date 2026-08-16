import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createStripeClient } from "@/lib/stripe/server";
import { currentPeriodEndIso } from "@/lib/billing/subscription-period";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

/**
 * Undo a pending cancellation, any time before the period ends.
 *
 * Clearing cancel_at_period_end is the whole operation — nothing was
 * cancelled yet, so there is nothing to re-create and no new charge. That
 * is exactly why cancel_at_period_end is the right primitive: "changed my
 * mind" costs the user nothing and needs no support ticket.
 */
export async function POST() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const subscriptionId = user.user_metadata?.stripe_subscription_id as string | undefined;
    if (!subscriptionId) {
      return NextResponse.json(
        { ok: false, error: "No active subscription found for this account." },
        { status: 400 }
      );
    }

    const stripe = createStripeClient();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    if (customerId !== user.user_metadata?.stripe_customer_id) {
      logApiError("/api/billing/resume", new Error("subscription/customer mismatch"), {
        userId: user.id,
        subscriptionId,
      });
      return NextResponse.json({ ok: false, error: "No active subscription found for this account." }, { status: 400 });
    }

    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });

    return NextResponse.json({ ok: true, endsAt: currentPeriodEndIso(updated) });
  } catch (err) {
    logApiError("/api/billing/resume", err);
    return NextResponse.json(
      { ok: false, error: "Could not restore the subscription. Please try again." },
      { status: 500 }
    );
  }
}
