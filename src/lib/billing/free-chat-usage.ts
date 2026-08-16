import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { freeChatAllowanceForAccount } from "@/lib/billing/free-chat";
import { getPlan, type PlanSlug } from "@/lib/billing/plans";
import type { LegacyEntitlements } from "@/lib/billing/legacy-entitlements";

/**
 * The allowance for one ACCOUNT: the plan's published number, or the
 * larger grandfathered one if this account carries it.
 *
 * Both entry points below take the entitlements as an argument rather than
 * loading them, so one request reads user_credits once instead of twice.
 */
function allowanceFor(planSlug: string, legacy: LegacyEntitlements | null | undefined): number {
  const slug = (getPlan(planSlug)?.slug ?? "free") as PlanSlug;
  return freeChatAllowanceForAccount(slug, legacy);
}

/**
 * The free-chat counter.
 *
 * Consumption goes through the consume_free_chat RPC rather than a
 * read-then-write here, because two messages sent at once from two tabs
 * would both read the same "used" value and both be granted. The RPC does
 * the bounds check and the increment in a single UPDATE, so the row lock
 * serialises them and the allowance cannot be overrun.
 *
 * The period is the calendar month in UTC, reset lazily inside the same
 * statement. Deliberately NOT tied to the Stripe billing anniversary:
 * that would need the subscription's current_period_start on every
 * message, and a webhook that has not landed yet would silently deny free
 * messages the user is owed. A calendar month is predictable, needs no
 * external state, and self-heals.
 */

export type FreeChatGrant =
  | { granted: true; used: number; remaining: number; limit: number }
  | { granted: false; used: number; remaining: 0; limit: number; reason: "exhausted" | "disabled" | "error" };

/**
 * Claims one free message for this user, if the plan's allowance has any
 * left this month.
 *
 * Returns granted:false rather than throwing when the RPC is missing —
 * this feature must never be able to break chat. A user whose database
 * has not had the migration applied simply pays credits as before.
 */
export async function consumeFreeChatMessage(
  userId: string,
  planSlug: string,
  legacy?: LegacyEntitlements | null
): Promise<FreeChatGrant> {
  const limit = allowanceFor(planSlug, legacy);
  if (limit <= 0) {
    return { granted: false, used: 0, remaining: 0, limit: 0, reason: "disabled" };
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("consume_free_chat", {
      p_user_id: userId,
      p_limit: limit,
    });
    if (error) throw error;

    // The RPC returns a single row as a one-element array.
    const row = (Array.isArray(data) ? data[0] : data) as
      | { granted: boolean; used: number; remaining: number }
      | undefined;
    if (!row) throw new Error("consume_free_chat returned no row");

    if (row.granted) {
      return { granted: true, used: Number(row.used), remaining: Number(row.remaining), limit };
    }
    return {
      granted: false,
      used: Number(row.used),
      remaining: 0,
      limit,
      reason: "exhausted",
    };
  } catch (err) {
    logApiError("billing:consumeFreeChatMessage", err, { userId, planSlug });
    // Falling back to the paid path is the safe failure: the user is
    // charged credits they have, rather than getting an error.
    return { granted: false, used: 0, remaining: 0, limit, reason: "error" };
  }
}

/**
 * Gives a claimed free message back.
 *
 * Called when the AI call fails after the claim — the user got nothing, so
 * the message should not count. Best-effort: a failure here costs the user
 * one message off their allowance, which is strictly better than failing
 * the request they already saw fail once.
 */
export async function releaseFreeChatMessage(userId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("release_free_chat", { p_user_id: userId });
    if (error) throw error;
  } catch (err) {
    logApiError("billing:releaseFreeChatMessage", err, { userId });
  }
}

export type FreeChatStatus = {
  limit: number;
  used: number;
  remaining: number;
};

/**
 * Read-only view of the allowance, for the UI.
 *
 * Applies the same calendar-month rule as the RPC so a counter left over
 * from last month reads as zero used, without needing a write on a page
 * load.
 */
export async function getFreeChatStatus(
  userId: string,
  planSlug: string,
  legacy?: LegacyEntitlements | null
): Promise<FreeChatStatus> {
  const limit = allowanceFor(planSlug, legacy);
  if (limit <= 0) return { limit: 0, used: 0, remaining: 0 };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_credits")
      .select("free_chat_used, free_chat_period_start")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;

    const periodStart = data?.free_chat_period_start
      ? new Date(data.free_chat_period_start as string)
      : null;
    const used = isCurrentPeriod(periodStart) ? Number(data?.free_chat_used ?? 0) : 0;

    return { limit, used, remaining: Math.max(limit - used, 0) };
  } catch (err) {
    logApiError("billing:getFreeChatStatus", err, { userId, planSlug });
    // Reporting the full allowance on a read failure would promise free
    // messages the RPC may refuse; reporting zero would hide a working
    // feature. Zero remaining is the honest one — the UI just doesn't
    // advertise free messages it cannot confirm.
    return { limit, used: limit, remaining: 0 };
  }
}

/** Same month, same year, in UTC — the rule the RPC uses. */
function isCurrentPeriod(periodStart: Date | null): boolean {
  if (!periodStart || Number.isNaN(periodStart.getTime())) return false;
  const now = new Date();
  return (
    periodStart.getUTCFullYear() === now.getUTCFullYear() &&
    periodStart.getUTCMonth() === now.getUTCMonth()
  );
}
