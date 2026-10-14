import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitOpensAt } from "@/lib/rate-limit";
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
// The windows, as the sentences in messages/*.json say them (errors.codes.
// hourlyLimit and repeatLimit): «within the hour», «within 15 minutes».
// scripts/tests/limit-texts.test.mjs holds the two together.
export const USER_HOURLY_WINDOW_MINUTES = 60;
const IDENTICAL_CALL_MAX = 10;
export const IDENTICAL_CALL_WINDOW_MINUTES = 15;
const DEFAULT_MAX_DAILY_AI_CALLS = 5000;

// `code` names the case for a screen that translates it (lib/errors/
// error-codes.ts); `reason` stays the English prose for logs and the
// routes that still show it.
//
// EACH LIMIT BY ITS OWN NAME, AND WHEN IT OPENS AGAIN (2026-10-14). The
// three used to share `rateLimited` — «wait about a minute» in every
// language — and the platform's daily cap was `upstreamUnavailable`,
// «usually clears within a few minutes». None of the three lasts minutes:
// the hourly cap counts the last 60 minutes, the identical-request breaker
// the last 15, and the platform cap is a UTC day. `retryAt` is the instant
// each opens again when it can be known (rateLimitOpensAt in
// lib/rate-limit.ts; the next UTC midnight for the day), and
// lib/errors/use-error-text.ts says it as a time on the reader's clock. A
// route passes both on as they are (`code: breaker.code, retryAt:
// breaker.retryAt`); scripts/tests/limit-texts.test.mjs counts that every
// refusal a screen reads in its own words does.
export type CircuitBreakerRefusal = {
  allowed: false;
  reason: string;
  code: "platformLimit" | "hourlyLimit" | "repeatLimit";
  retryAt?: string;
};
export type CircuitBreakerResult = { allowed: true } | CircuitBreakerRefusal;

/** The next 00:00 UTC: the day checkDailyPlatformCap counts is the UTC date. */
export function nextUtcMidnight(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

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
      reason: "The AI service has reached today's limit for the whole platform; it opens again at 00:00 UTC.",
      code: "platformLimit",
      retryAt: nextUtcMidnight(),
    };
  }
  return { allowed: true };
}

export async function checkUserHourlyCap(userId: string): Promise<CircuitBreakerResult> {
  const limit = { scope: "ai_hourly_user", identifier: userId, maxAttempts: USER_HOURLY_MAX_CALLS, windowMinutes: USER_HOURLY_WINDOW_MINUTES };
  const { allowed } = await checkRateLimit(limit);
  if (allowed) return { allowed: true };
  const retryAt = await rateLimitOpensAt(limit);
  return {
    allowed: false,
    reason: "You've reached the limit of AI requests for the last hour; it opens again within the hour.",
    code: "hourlyLimit",
    ...(retryAt ? { retryAt } : {}),
  };
}

export async function checkIdenticalRequestBreaker(
  userId: string,
  endpoint: string,
  fingerprint: string
): Promise<CircuitBreakerResult> {
  const limit = {
    scope: "ai_identical_call",
    identifier: `${userId}:${endpoint}:${fingerprint}`,
    maxAttempts: IDENTICAL_CALL_MAX,
    windowMinutes: IDENTICAL_CALL_WINDOW_MINUTES,
  };
  const { allowed } = await checkRateLimit(limit);
  if (allowed) return { allowed: true };
  logApiError("ai-circuit-breaker", "identical-request circuit breaker tripped", { userId, endpoint });
  const retryAt = await rateLimitOpensAt(limit);
  return {
    allowed: false,
    reason: "This exact request has been repeated too many times; it opens again within 15 minutes.",
    code: "repeatLimit",
    ...(retryAt ? { retryAt } : {}),
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
// creating it on first call of the day.
//
// ATOMIC, via increment_daily_ai_spend (see
// supabase/migrations/20260813_atomic_daily_ai_spend.sql). This used to be
// a read-modify-write: SELECT total_calls, then UPDATE to
// `existing.total_calls + 1`, with the addition done in Node against a
// value read in an earlier round trip. Every call that read between
// another call's SELECT and its UPDATE wrote the same number, and the
// later write silently won — so the counter measured how many calls
// happened to be serialised, not how many happened.
//
// The old comment here waved that away as acceptable imprecision. It is
// not, for a reason specific to this counter: it is the ONLY input to
// checkDailyPlatformCap, the breaker whose entire job is to contain a
// runaway spike — the exact condition under which concurrency, and so the
// undercount, is worst. The breaker was least accurate precisely when it
// mattered, and estimated_cost drifted the same way, so today's reported
// AI spend was low by an unknown amount. Both are now single-statement
// increments evaluated by Postgres against the row it is locking.
//
// Still best-effort in the sense that a failure is logged and swallowed
// rather than thrown: this runs after the decision to make the Claude
// call, so failing here must not turn a successful request into an error.
export async function recordAiCallForDailySpend(
  estimatedCreditCost: number,
  /**
   * HOW MANY PROVIDER CALLS THIS ACTION MADE. Defaults to 1, which is
   * what every caller before this meant and still means.
   *
   * It exists because two families of work make SEVERAL calls inside one
   * settled action — a background job and a Deep Research chunk, which
   * plans, answers up to six questions and synthesises — and neither
   * called this function at all. Counting them once each would swap one
   * wrong number for another; the runners pass the accumulator's own
   * callCount, which is how many provider responses were recorded.
   */
  calls = 1
): Promise<void> {
  // Nothing to record is not an error, and must not become a row that
  // says one call happened. A settlement whose accumulator was never fed
  // is already reported by lib/billing/reservations.ts.
  if (!Number.isFinite(calls) || calls < 1) return;

  const admin = createAdminClient();
  // UTC date, matching checkDailyPlatformCap's reader above. Passed
  // explicitly rather than left to the function's default so the two can
  // never disagree about which row "today" is.
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await admin.rpc("increment_daily_ai_spend", {
    p_estimated_cost: estimatedCreditCost,
    p_date: today,
    p_calls: Math.round(calls),
  });

  if (error) {
    logApiError("ai-circuit-breaker", error, { stage: "record_daily_spend_rpc" });
  }
}
