import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { type PlanSlug } from "@/lib/billing/plans";
import { classifyTransition, monthlyEurFor } from "@/lib/billing/subscription-kind";

/**
 * WHAT CHANGED, RECORDED AT THE ONE MOMENT BOTH SIDES ARE KNOWN.
 *
 * The Stripe webhook already reads the PREVIOUS tier before overwriting
 * it — it has to, to decide whether to reset credits. That instant is the
 * only place a transition can be recorded without guessing, because a
 * second later the old value is gone from auth.users forever.
 *
 * The classification itself lives in subscription-kind.ts, which imports
 * no database.
 */

export type { SubscriptionEventKind } from "@/lib/billing/subscription-kind";

/** Records the transition. Never throws: a revenue LOG must not be able
 *  to fail a webhook whose real job is the customer's entitlement. */
export async function recordSubscriptionEvent(params: {
  userId: string;
  fromTier: string | null;
  toTier: PlanSlug | string;
  fromInterval: string | null;
  toInterval: string;
  fromSeats: number | null;
  toSeats: number;
  stripeEventId?: string | null;
}): Promise<void> {
  try {
    const kind = classifyTransition({
      fromTier: params.fromTier,
      toTier: String(params.toTier),
      fromInterval: params.fromInterval,
      toInterval: params.toInterval,
      fromSeats: params.fromSeats,
      toSeats: params.toSeats,
    });
    if (!kind) return;

    const admin = createAdminClient();
    const { error } = await admin.from("subscription_events").insert({
      user_id: params.userId,
      kind,
      from_tier: params.fromTier,
      to_tier: String(params.toTier),
      from_interval: params.fromInterval,
      to_interval: params.toInterval,
      from_seats: params.fromSeats,
      to_seats: params.toSeats,
      from_mrr_eur: monthlyEurFor(params.fromTier ?? "", params.fromInterval ?? "month", params.fromSeats ?? 1),
      to_mrr_eur: monthlyEurFor(String(params.toTier), params.toInterval, params.toSeats),
      stripe_event_id: params.stripeEventId ?? null,
    });
    // A DUPLICATE IS NOT AN ERROR. stripe_event_id is unique precisely so
    // a retried webhook cannot become a second cancellation in the churn
    // count; hitting that constraint means the guard worked.
    if (error && !String(error.message ?? "").includes("duplicate key")) throw error;
  } catch (err) {
    logApiError("billing:subscription-log", err, { userId: params.userId });
  }
}
