import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlan, type PlanSlug } from "@/lib/billing/plans";
import { logApiError } from "@/lib/log-error";

/**
 * The owner's CURRENT plan, read on the public serve path (V4 #25).
 *
 * ============================================================================
 * WHY user_credits.plan_tier AND NOT auth user_metadata
 * ============================================================================
 * The authoritative tier lives in user_metadata.subscription_tier, and
 * resolveEffectivePlanSlug() layers beta expiry on top of it. Reading that
 * from /s/[subdomain] would mean calling auth.admin.getUserById on every
 * anonymous page view — an Auth API round trip, per visitor, on the one
 * route in the app that serves strangers at whatever rate they arrive.
 *
 * user_credits.plan_tier is the same fact, already denormalised, already
 * indexed by user_id, and — crucially — it is written by the SAME code that
 * charges money: deduct_credits_atomic upserts it with the EFFECTIVE plan
 * on every deduction, syncCreditsForPlan overwrites it on every Stripe
 * subscription event, and getOrInitCredits seeds it. If this column were
 * ever wrong, the account would also be billed at the wrong rate — so it
 * cannot drift silently in a way that only affects badges.
 *
 * Anything unreadable, missing, or unrecognised resolves to "free", which
 * SHOWS the badge. Failing closed here means a database blip costs a
 * customer a badge on their page for a minute; failing open would mean
 * handing the paid feature to everyone on the platform for the duration of
 * the incident, with nothing in any log to say it happened.
 */
export async function loadOwnerPlanSlug(
  admin: SupabaseClient,
  userId: string
): Promise<PlanSlug> {
  try {
    const { data, error } = await admin
      .from("user_credits")
      .select("plan_tier")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      logApiError("publishing:loadOwnerPlanSlug", error, { userId });
      return "free";
    }

    const raw = (data as { plan_tier?: string | null } | null)?.plan_tier;
    if (typeof raw === "string" && getPlan(raw)) return raw as PlanSlug;
    return "free";
  } catch (err) {
    logApiError("publishing:loadOwnerPlanSlug", err, { userId, stage: "unhandled" });
    return "free";
  }
}
