import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { adminMonthlyEurCeiling, betaMonthlyEurCeiling } from "@/lib/billing/bypass-ceiling-config";

export { adminMonthlyEurCeiling, betaMonthlyEurCeiling };

// THE SECOND HALF OF THE BYPASS GAP.
//
// checkAiCallAllowed (lib/ai-circuit-breaker.ts) caps VOLUME — calls per
// hour, identical-request loops, a platform-wide daily count — for
// every account, bypass or not. None of those look at what a call
// actually COST. For a normal account that is fine: credits already cap
// cost directly, in euros, per action, before the call is ever made.
//
// An admin or beta-tester account skips that check entirely
// (bypassCharge: true in lib/billing/reservations.ts) — by design, that
// is what "bypass" means. What it left unbounded was the one number
// credits exist to bound: how much real money the account can cause to
// be spent with Anthropic in a month. checkUserHourlyCap's 20 calls/hour
// times a month of hours is not a ceiling, it is a very large number.
//
// ONE CHECK, IN EUROS, NOT A COUNTER PER FEATURE. A per-feature limit
// (an agent-builds-per-month counter, a chat-messages-per-month counter,
// ...) has to be re-added by hand every time a new AI-calling route
// ships, and the history of this exact codebase is what a rule like that
// looks like in practice: reserve_credits was reachable from the code
// and from no migration at all, delivery channels lived nowhere but
// commit messages, the routine-grants file existed because "revoke
// execute on every new function" was followed in one migration out of
// fourteen. ai_cost_log.real_cost_eur is written by EVERY settlement,
// bypass or charged, for every feature this app has today and every one
// it adds tomorrow — reading it back is a rule that enforces itself
// without needing to be remembered a second time.
//
// NUMBERS. Proposed and confirmed by the user rather than picked here:
// admin €40/month, beta tester €5/month. Both are env-overridable, same
// parsing discipline as AGENT_LIMIT_* and MAX_DAILY_AI_CALLS — an
// unparseable or negative value warns and falls back to the default
// rather than being silently clamped into something that looks
// deliberate.
export type BypassCeilingResult = { allowed: true } | { allowed: false; reason: string; spentEur: number; ceilingEur: number };

/**
 * Call ONLY on a path that has already decided this account bypasses
 * credits (isAdmin || hasActiveBetaBypass) — for a normal, charging
 * account this has nothing to check and nothing to gain by running.
 *
 * Admin takes priority over beta when an account is somehow both (should
 * not happen — lib/beta.ts keeps the two mutually exclusive by
 * construction — but the wider ceiling is the safe direction to fail
 * toward if it ever does).
 */
export async function checkBypassCeiling(
  userId: string,
  isAdmin: boolean,
  isBeta: boolean
): Promise<BypassCeilingResult> {
  if (!isAdmin && !isBeta) return { allowed: true };
  const ceilingEur = isAdmin ? adminMonthlyEurCeiling() : betaMonthlyEurCeiling();

  const admin = createAdminClient();
  // SUM OF THE WHOLE MONTH'S ai_cost_log, not a bypass-flagged subset.
  // bypassCharge is a per-ACCOUNT state (set once, from isAdmin /
  // hasActiveBetaBypass), not a per-row one — while an account bypasses,
  // every row it writes this month is a bypass row, so the plain sum IS
  // the bypass spend. The one edge this is not exact for: a beta
  // account whose 30-day window expired mid-month starts being charged
  // normally, and its charged rows from later in the month would be
  // added into this same sum on its next-to-last bypass call before
  // expiry. That makes the ceiling trigger a LITTLE early, never late —
  // the safe direction for a spend cap to be wrong in.
  const { data, error } = await admin
    .from("ai_cost_log")
    .select("real_cost_eur")
    .eq("user_id", userId)
    .gte("created_at", new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).toISOString());

  if (error) {
    // Fails OPEN, same tolerance every breaker in this file's sibling
    // (ai-circuit-breaker.ts) uses: a tracking-table hiccup must never be
    // the reason a real request is blocked.
    logApiError("bypass-ceiling", error, { stage: "sum_month", userId });
    return { allowed: true };
  }

  const spentEur = (data ?? []).reduce((sum, row) => sum + Number(row.real_cost_eur ?? 0), 0);
  if (spentEur >= ceilingEur) {
    return {
      allowed: false,
      reason: "This account has reached its monthly usage ceiling. It resets at the start of next month.",
      spentEur,
      ceilingEur,
    };
  }
  return { allowed: true };
}
