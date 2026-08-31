import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";

/**
 * Rolling-window rate limiter backed by rate_limit_log.
 *
 * WHAT CHANGED AND WHY. This used to be a read-then-write across two
 * round trips — SELECT count(*), decide in Node, INSERT — and that is
 * enforcement against serial traffic only. Fifty concurrent requests all
 * run their SELECT before any INSERT commits, all fifty read the same
 * number, all fifty are under the limit, and all fifty are allowed.
 *
 * That is not a detail here, because lib/ai-circuit-breaker.ts is built
 * on this function. Its per-user cap of 20 AI calls an hour is the only
 * thing that stops one account from consuming MAX_DAILY_AI_CALLS
 * (default 5000) — the budget every user shares. Enforced, one account
 * reaches at most 20 x 24 = 480 calls a day and cannot exhaust the
 * platform. Unenforced, one account with a loop and some concurrency can.
 *
 * The count and the insert now happen inside one Postgres function,
 * consume_rate_limit(), under an advisory lock keyed on
 * (scope, identifier) — see supabase/migrations/20260919000000.
 *
 * STILL NOT A HARD SECURITY BOUNDARY, and still deliberately tolerant:
 * it FAILS OPEN on a database error, because a logging hiccup should
 * never be the reason a real user cannot sign up or pay. What it is now
 * is a limit that means the same thing whether the requests arrive one at
 * a time or all at once.
 */
export async function checkRateLimit(options: {
  scope: string;
  identifier: string;
  maxAttempts: number;
  windowMinutes: number;
}): Promise<{ allowed: boolean }> {
  const { scope, identifier, maxAttempts, windowMinutes } = options;
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_scope: scope,
    p_identifier: identifier,
    p_max_attempts: maxAttempts,
    p_window_minutes: windowMinutes,
  });

  if (!error) {
    // The function returns a boolean. Anything else means the deployed
    // signature is not the one this file expects, and guessing which way
    // to fail is worse than saying so and falling back.
    if (typeof data === "boolean") return { allowed: data };
    logApiError("rate-limit", "consume_rate_limit returned a non-boolean", { scope, got: typeof data });
    return legacyCheck(scope, identifier, maxAttempts, windowMinutes);
  }

  // THE MIGRATION MAY NOT HAVE RUN YET. PostgREST answers PGRST202 for a
  // function it cannot find, and on that answer the choice is between a
  // limiter that is silently absent and one that is merely racy. Racy is
  // the behaviour this file had for its whole life, so the fallback is
  // never worse than yesterday — and it is loud, so "the migration is
  // unrun" does not become the permanent state by going unnoticed.
  logApiError("rate-limit", error, { scope, stage: "consume_rate_limit" });
  return legacyCheck(scope, identifier, maxAttempts, windowMinutes);
}

/**
 * The pre-migration path, kept ONLY as the fallback above.
 *
 * Nothing else may call this. It is the racy read-then-write, and it is
 * here so that an unrun migration degrades to the old behaviour instead
 * of to no limiting at all.
 */
async function legacyCheck(
  scope: string,
  identifier: string,
  maxAttempts: number,
  windowMinutes: number
): Promise<{ allowed: boolean }> {
  const admin = createAdminClient();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { count, error } = await admin
    .from("rate_limit_log")
    .select("id", { count: "exact", head: true })
    .eq("scope", scope)
    .eq("identifier", identifier)
    .gte("created_at", windowStart);

  if (error) {
    logApiError("rate-limit", error, { scope, stage: "count" });
    return { allowed: true };
  }

  if ((count ?? 0) >= maxAttempts) {
    return { allowed: false };
  }

  const { error: insertError } = await admin.from("rate_limit_log").insert({ scope, identifier });
  if (insertError) {
    logApiError("rate-limit", insertError, { scope, stage: "insert" });
  }

  return { allowed: true };
}

/**
 * Counts hits in the window WITHOUT recording one.
 *
 * For the one limiter whose shape is not "spend a token per attempt":
 * /api/auth/login counts FAILED attempts, and records only after the
 * sign-in has actually failed, so that a busy legitimate user is never
 * blocked by their own successful logins. That cannot be folded into
 * consume_rate_limit(), which decides and records in the same statement.
 *
 * It is therefore still a read-then-write, and deliberately so: closing
 * that window would mean holding a lock across a call to Supabase's auth
 * API. What concurrency buys an attacker there is more guesses inside one
 * window, not a way past the password — the bound that matters is the
 * password, not the counter.
 *
 * These two exist so the login route stops carrying its own copy of the
 * table access. It had one, with its own window arithmetic and its own
 * fails-open branch, which is how two limiters drift into meaning
 * different things.
 */
export async function countRateLimitHits(options: {
  scope: string;
  identifier: string;
  windowMinutes: number;
}): Promise<{ count: number; ok: boolean }> {
  const { scope, identifier, windowMinutes } = options;
  const admin = createAdminClient();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { count, error } = await admin
    .from("rate_limit_log")
    .select("id", { count: "exact", head: true })
    .eq("scope", scope)
    .eq("identifier", identifier)
    .gte("created_at", windowStart);

  if (error) {
    // ok:false, not count:0. A caller that cannot tell "no hits" from "the
    // query failed" will treat a broken database as a clean record.
    logApiError("rate-limit", error, { scope, stage: "count_only" });
    return { count: 0, ok: false };
  }
  return { count: count ?? 0, ok: true };
}

/** Records one hit. Never throws; a failure to record is logged, not raised. */
export async function recordRateLimitHit(options: { scope: string; identifier: string }): Promise<void> {
  const { scope, identifier } = options;
  const admin = createAdminClient();
  const { error } = await admin.from("rate_limit_log").insert({ scope, identifier });
  if (error) logApiError("rate-limit", error, { scope, stage: "record_only" });
}
