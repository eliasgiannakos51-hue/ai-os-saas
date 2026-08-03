import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { fingerprintRequest } from "@/lib/request-fingerprint";

export { fingerprintRequest };

// A second, independent safety net on top of the credits system —
// credits gate COST to the user, this gates VOLUME regardless of
// balance, specifically to contain the blast radius of a bug (a client
// loop, a retried request, a cron gone wrong) rather than a well-behaved
// user who simply has a lot of credits. Three layers, checked cheapest
// first so an obviously-abusive request never reaches the expensive
// Claude call:
//   1. Per-user hourly cap — independent of credits, catches one user's
//      runaway client/script.
//   2. Identical-request breaker — catches the same exact action being
//      fired over and over (the shape a real infinite-loop bug takes).
//   3. Platform-wide daily cap — catches a coordinated or unexpectedly
//      viral spike across ALL users at once.
// Every AI-calling route in the app calls checkAiCallAllowed() right
// after auth, before its credit check, and calls
// recordAiCallForDailySpend() once it has actually decided to make the
// Claude call (mirroring credits' "check first, record once confirmed"
// shape, though here the "record" just increments a counter rather than
// deducting anything — see each route for exactly where).

const USER_HOURLY_MAX_CALLS = 20;
const IDENTICAL_CALL_MAX = 10;
const IDENTICAL_CALL_WINDOW_MINUTES = 15;
const DEFAULT_MAX_DAILY_AI_CALLS = 5000;

export type CircuitBreakerResult = { allowed: true } | { allowed: false; reason: string };

export async function checkDailyPlatformCap(): Promise<CircuitBreakerResult> {
  const maxDaily = Number(process.env.MAX_DAILY_AI_CALLS) || DEFAULT_MAX_DAILY_AI_CALLS;
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await admin
    .from("daily_ai_spend_tracking")
    .select("total_calls")
    .eq("date", today)
    .maybeSingle();

  if (error) {
    // Fails OPEN, same tolerance as checkRateLimit — a tracking-table
    // hiccup should never be the reason a real request gets blocked.
    logApiError("ai-circuit-breaker", error, { stage: "check_daily_cap" });
    return { allowed: true };
  }

  if ((data?.total_calls ?? 0) >= maxDaily) {
    return {
      allowed: false,
      reason: "Service temporarily at capacity, please try again later.",
    };
  }
  return { allowed: true };
}

export async function checkUserHourlyCap(userId: string): Promise<CircuitBreakerResult> {
  const { allowed } = await checkRateLimit({
    scope: "ai_hourly_user",
    identifier: userId,
    maxAttempts: USER_HOURLY_MAX_CALLS,
    windowMinutes: 60,
  });
  return allowed
    ? { allowed: true }
    : {
        allowed: false,
        reason: "You've made a lot of AI requests in the last hour — please wait a bit and try again.",
      };
}

export async function checkIdenticalRequestBreaker(
  userId: string,
  endpoint: string,
  fingerprint: string
): Promise<CircuitBreakerResult> {
  const identifier = `${userId}:${endpoint}:${fingerprint}`;
  const { allowed } = await checkRateLimit({
    scope: "ai_identical_call",
    identifier,
    maxAttempts: IDENTICAL_CALL_MAX,
    windowMinutes: IDENTICAL_CALL_WINDOW_MINUTES,
  });
  if (!allowed) {
    logApiError("ai-circuit-breaker", "identical-request circuit breaker tripped", { userId, endpoint });
  }
  return allowed
    ? { allowed: true }
    : {
        allowed: false,
        reason: "This exact request has been repeated too many times — please wait a few minutes and try again.",
      };
}

// The single call every AI-calling route makes, right after auth and
// before its own credit check — cheapest-first ordering (a rejected
// platform cap never needs to touch rate_limit_log at all).
export async function checkAiCallAllowed(
  userId: string,
  endpoint: string,
  fingerprint: string
): Promise<CircuitBreakerResult> {
  const daily = await checkDailyPlatformCap();
  if (!daily.allowed) return daily;

  const hourly = await checkUserHourlyCap(userId);
  if (!hourly.allowed) return hourly;

  return checkIdenticalRequestBreaker(userId, endpoint, fingerprint);
}

// Called once a route has actually decided to make the Claude call (i.e.
// checkAiCallAllowed already said yes) — increments today's row,
// creating it on first call of the day. Read-then-write, tolerant of
// races under bursty traffic, same acceptable-imprecision tolerance as
// checkRateLimit and deductCredits elsewhere in this codebase: this is
// abuse/cost containment, not a financial ledger, so an occasional
// undercount under heavy concurrency is fine — it only ever means the
// cap fires slightly later, never that real requests get wrongly
// blocked.
export async function recordAiCallForDailySpend(estimatedCreditCost: number): Promise<void> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing, error: selectError } = await admin
    .from("daily_ai_spend_tracking")
    .select("total_calls, estimated_cost")
    .eq("date", today)
    .maybeSingle();

  if (selectError) {
    logApiError("ai-circuit-breaker", selectError, { stage: "record_daily_spend_select" });
    return;
  }

  if (existing) {
    const { error: updateError } = await admin
      .from("daily_ai_spend_tracking")
      .update({
        total_calls: existing.total_calls + 1,
        estimated_cost: Number(existing.estimated_cost) + estimatedCreditCost,
        updated_at: new Date().toISOString(),
      })
      .eq("date", today);
    if (updateError) {
      logApiError("ai-circuit-breaker", updateError, { stage: "record_daily_spend_update" });
    }
  } else {
    const { error: insertError } = await admin
      .from("daily_ai_spend_tracking")
      .insert({ date: today, total_calls: 1, estimated_cost: estimatedCreditCost });
    if (insertError) {
      logApiError("ai-circuit-breaker", insertError, { stage: "record_daily_spend_insert" });
    }
  }
}
