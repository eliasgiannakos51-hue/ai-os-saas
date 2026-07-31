import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";

// Generic rolling-window rate limiter backed by rate_limit_log. Not a hard
// security boundary (read-then-write, tolerant of races under bursty
// traffic — same "cost/abuse protection" tolerance as deductCredits in
// lib/billing/credits.ts), just enough to blunt scripted signup spam and
// checkout-session hammering. Fails OPEN on a database error: a logging
// hiccup should never be the reason a real user can't sign up or pay.
export async function checkRateLimit(options: {
  scope: string;
  identifier: string;
  maxAttempts: number;
  windowMinutes: number;
}): Promise<{ allowed: boolean }> {
  const { scope, identifier, maxAttempts, windowMinutes } = options;
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
