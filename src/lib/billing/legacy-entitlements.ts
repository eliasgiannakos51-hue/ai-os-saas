import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";

// GRANDFATHERING.
//
// The combined-ceiling change lowered what a plan grants: free chat went
// from 120/300/600/1,200 messages to 43/107/215/430, and the envelope each
// message runs in got smaller (history 6 -> 2 turns, replies 800 -> 600
// tokens). Nobody who was already paying should lose either.
//
// STATE THE UNCOMFORTABLE PART PLAINLY: grandfathering is a deliberate,
// bounded breach of the ceiling. A Professional account keeping 600
// messages at the old envelope costs EUR 18.82/month against a EUR 20.00
// budget for credits + quotas combined — 38.8% of revenue, a combined
// 2.58x. That is the price of not taking something back, and it is worth
// paying; what is NOT acceptable is paying it invisibly. So:
//
//   1. It is per-ROW, never a branch in the pricing logic. An account
//      without these columns set is on the published numbers, full stop.
//   2. It is DATA, not a reference to old constants. The envelope numbers
//      are stored, so the exception keeps meaning the same thing after the
//      next envelope change instead of silently tracking it.
//   3. It EXPIRES, optionally, on the same mechanism beta access already
//      uses (user_credits.beta_expires_at). Null means "until they change
//      plan", which is the default the migration writes.
//   4. It is CLEARED on any plan change. Without this, an Ultimate account
//      that downgrades to Starter keeps 1,200 free messages on a EUR 20
//      plan — EUR 37.63 of worst-case spend against EUR 20 of revenue,
//      which is not grandfathering, it is a hole.
//   5. It is COUNTABLE. The cohort's cost is a SQL query away (see the
//      migration's header), so it can be watched shrinking rather than
//      assumed away.

export type LegacyEntitlements = {
  /**
   * The plan the entitlement was granted FOR. It applies only while the
   * account is still on that plan.
   *
   * This column is what stops the exception outliving its reason. Plan
   * changes normally clear the row (clearLegacyEntitlements, below), but
   * not every tier change is a Stripe event: a beta account carries
   * plan_tier 'ultimate' and silently collapses to Free when
   * beta_expires_at passes, with no webhook and therefore no clear. Without
   * this check that account would keep Ultimate's 1,200 free messages —
   * EUR 37.63/month — on a plan that pays nothing.
   */
  planTier: string | null;
  /** The free-chat allowance this account keeps, if any. */
  freeChatMessages: number | null;
  /** The free-chat envelope it keeps, stored as data rather than inferred. */
  freeChatHistoryLimit: number | null;
  freeChatMaxOutputTokens: number | null;
  /** When the exception lapses. Null means "until the plan changes". */
  until: Date | null;
};

export const NO_LEGACY_ENTITLEMENTS: LegacyEntitlements = {
  planTier: null,
  freeChatMessages: null,
  freeChatHistoryLimit: null,
  freeChatMaxOutputTokens: null,
  until: null,
};

// WHETHER AN ENTITLEMENT IS IN FORCE is decided in ONE place —
// `legacyInForce` in lib/billing/free-chat.ts, which every consumer of
// this data already goes through. A second copy of the rule lived here
// briefly and was deleted unused: two implementations of "is this still
// valid" is exactly the shape that lets a plan check be added to one and
// not the other, which is the bug (a beta account keeping Ultimate's
// allowance on the free tier) this whole mechanism exists to avoid.

function parseRow(row: Record<string, unknown> | null | undefined): LegacyEntitlements {
  if (!row) return NO_LEGACY_ENTITLEMENTS;
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  };
  const rawUntil = row.legacy_entitlements_until;
  const until = typeof rawUntil === "string" ? new Date(rawUntil) : null;
  return {
    planTier: typeof row.legacy_plan_tier === "string" ? row.legacy_plan_tier : null,
    freeChatMessages: num(row.legacy_free_chat_messages),
    freeChatHistoryLimit: num(row.legacy_free_chat_history_limit),
    freeChatMaxOutputTokens: num(row.legacy_free_chat_max_output_tokens),
    until: until && !Number.isNaN(until.getTime()) ? until : null,
  };
}

/**
 * Reads an account's grandfathered entitlements.
 *
 * Never throws and never blocks chat: a database that has not had the
 * migration applied simply reports no entitlements, which puts the account
 * on the published numbers — the safe direction, since the published
 * numbers are the ones the ceiling is proven against.
 */
export async function loadLegacyEntitlements(userId: string): Promise<LegacyEntitlements> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_credits")
      .select(
        "legacy_plan_tier, legacy_free_chat_messages, legacy_free_chat_history_limit, legacy_free_chat_max_output_tokens, legacy_entitlements_until"
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return parseRow(data as Record<string, unknown> | null);
  } catch (err) {
    logApiError("billing:loadLegacyEntitlements", err, { userId });
    return NO_LEGACY_ENTITLEMENTS;
  }
}

/**
 * Drops an account's grandfathered entitlements.
 *
 * Called from syncCreditsForPlan, i.e. on every subscription change Stripe
 * reports — upgrade, downgrade, cancellation. A new plan is a new
 * agreement; carrying the old plan's allowances into it is how a downgrade
 * becomes the cheapest way to buy the expensive plan's quota.
 *
 * Best-effort by design: failing here must not fail the webhook that is
 * also updating the user's tier and credits. The worst case is one account
 * keeping an allowance one billing period longer, which the runtime cohort
 * query will show.
 */
export async function clearLegacyEntitlements(userId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("user_credits")
      .update({
        legacy_plan_tier: null,
        legacy_free_chat_messages: null,
        legacy_free_chat_history_limit: null,
        legacy_free_chat_max_output_tokens: null,
        legacy_entitlements_until: null,
      })
      .eq("user_id", userId);
    if (error) throw error;
  } catch (err) {
    logApiError("billing:clearLegacyEntitlements", err, { userId });
  }
}
