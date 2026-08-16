import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/server";
import { currentPeriodEndIso } from "@/lib/billing/subscription-period";
import { sendSubscriptionCancelledEmail } from "@/lib/email/send-subscription-cancelled-email";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

/** The four fixed reasons the exit survey offers. Free text goes in `note`. */
const SURVEY_REASONS = new Set(["too_expensive", "missing_feature", "not_using", "found_alternative"]);
const MAX_NOTE_LENGTH = 1000;

/**
 * Cancel at the END of the paid period. Never immediately.
 *
 * The customer paid for this month; taking it away the moment they click
 * Cancel is charging for something and then withholding it. Stripe keeps
 * `status: "active"` until the period actually ends, so every plan gate in
 * the app keeps passing on its own — nothing else has to know about this.
 *
 * ONE CLICK, ONE CONFIRMATION, NO SURVEY WALL. EU consumer law aside, a
 * cancel flow that is harder than the signup flow is a dark pattern; the
 * survey below is optional and is recorded AFTER the cancellation has
 * already been requested, so a failure to record it can never block the
 * cancellation itself.
 */
export async function POST(request: Request) {
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

    // Ownership check. The subscription id comes from this user's own
    // metadata, but the customer on it is verified against the customer id
    // we also hold — so a stale or tampered metadata value cannot cancel
    // somebody else's subscription.
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    if (customerId !== user.user_metadata?.stripe_customer_id) {
      logApiError("/api/billing/cancel", new Error("subscription/customer mismatch"), {
        userId: user.id,
        subscriptionId,
      });
      return NextResponse.json({ ok: false, error: "No active subscription found for this account." }, { status: 400 });
    }

    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    const endsAt = currentPeriodEndIso(updated);

    // The survey is optional and skippable, and it is written after the
    // cancellation has already succeeded. Nothing here may fail the
    // request: a broken table must not trap somebody in a subscription.
    let body: { reason?: unknown; note?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      // No body at all is the "skipped" case.
    }
    const reason = typeof body.reason === "string" && SURVEY_REASONS.has(body.reason) ? body.reason : null;
    const note =
      typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, MAX_NOTE_LENGTH) : null;
    if (reason || note) {
      try {
        await createAdminClient()
          .from("subscription_cancellations")
          .insert({ user_id: user.id, plan_tier: user.user_metadata?.subscription_tier ?? null, reason, note });
      } catch (err) {
        logApiError("/api/billing/cancel", err, { stage: "record_survey", userId: user.id });
      }
    }

    // Best-effort, for the same reason: the confirmation is a courtesy, not
    // part of cancelling.
    try {
      await sendSubscriptionCancelledEmail({ to: user.email ?? "", endsAt });
    } catch (err) {
      logApiError("/api/billing/cancel", err, { stage: "send_email", userId: user.id });
    }

    return NextResponse.json({ ok: true, endsAt });
  } catch (err) {
    logApiError("/api/billing/cancel", err);
    return NextResponse.json(
      { ok: false, error: "Could not cancel the subscription. Please try again." },
      { status: 500 }
    );
  }
}
