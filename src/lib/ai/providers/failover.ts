import type { AiAttemptOutcome } from "@/lib/ai/providers/types";

/**
 * WHAT IS WORTH TRYING SOMEWHERE ELSE, AND WHAT IS NOT.
 *
 * The brief asks for automatic failover on 5xx, timeout and rate limit.
 * The interesting half of that sentence is everything it leaves out, and
 * getting the exclusions wrong is more expensive than having no failover
 * at all:
 *
 *   A 400 IS OUR BUG. A malformed tool schema, a max_tokens above the
 *   model's ceiling, an empty text block. Every provider will reject it,
 *   so failing over means paying a second vendor to tell us the same
 *   thing and turning a clear error into a confusing one. It also
 *   removes the pressure that gets it fixed: an error that "recovers" is
 *   an error nobody looks at.
 *
 *   A 404 IS OUR CATALOG. It means we asked a provider for a model it
 *   does not serve — a wrong row in catalog.ts, which will be wrong on
 *   every request forever. Failing over hides a permanent bug behind a
 *   working feature, which is the worst of both.
 *
 *   AN UNKNOWN ERROR IS NOT AN INVITATION. Anything this function cannot
 *   place stays put. Spending real money at a second provider on the
 *   strength of an error nobody has read is not resilience.
 *
 *   A 401 DOES FAIL OVER, and that is not an exception to the rule so
 *   much as the rule applied honestly: the next provider has DIFFERENT
 *   credentials, so it is genuinely a different question. A revoked key
 *   at one vendor should not take every AI feature in the product down
 *   while another vendor sits configured and idle. It is still loud in
 *   the log, because a key that stopped working needs a human.
 */

export type ErrorClassification = {
  outcome: AiAttemptOutcome;
  /** Whether the NEXT provider in the chain should be tried. */
  failover: boolean;
  status: number | null;
};

/** Pulls an HTTP status off whatever the SDK or fetch threw. */
export function statusOf(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const candidate = err as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  for (const value of [candidate.status, candidate.statusCode, candidate.response?.status]) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function isAbort(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const named = err as { name?: unknown; code?: unknown };
  return (
    named.name === "AbortError" ||
    named.name === "TimeoutError" ||
    named.code === "ETIMEDOUT" ||
    named.code === "ECONNABORTED"
  );
}

function isNetwork(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const named = err as { name?: unknown; code?: unknown; message?: unknown };
  if (typeof named.code === "string" && ["ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND", "EPIPE"].includes(named.code)) {
    return true;
  }
  // undici throws a plain TypeError("fetch failed") with the real cause
  // nested. Matching on the message is unpleasant and is what there is.
  return named.name === "TypeError" && typeof named.message === "string" && /fetch failed/i.test(named.message);
}

export function classifyError(err: unknown): ErrorClassification {
  if (isAbort(err)) return { outcome: "timeout", failover: true, status: null };
  if (isNetwork(err)) return { outcome: "network_error", failover: true, status: null };

  const status = statusOf(err);
  if (status === null) return { outcome: "unknown_error", failover: false, status: null };

  if (status === 408) return { outcome: "timeout", failover: true, status };
  if (status === 429) return { outcome: "rate_limited", failover: true, status };
  // Anthropic's "overloaded" — a 529, which is not a standard code and is
  // not a 5xx as far as most range checks are concerned. Named separately
  // because "the vendor is saturated" and "the vendor is broken" are
  // different operational facts even though both fail over.
  if (status === 529) return { outcome: "overloaded", failover: true, status };
  if (status >= 500) return { outcome: "server_error", failover: true, status };
  if (status === 401 || status === 403) return { outcome: "auth_error", failover: true, status };
  if (status >= 400) return { outcome: "bad_request", failover: false, status };

  return { outcome: "unknown_error", failover: false, status };
}

/**
 * How long one attempt gets before it counts as a timeout.
 *
 * PER ATTEMPT, NOT PER REQUEST, and the difference matters on a chain of
 * three: a single budget shared across the chain means the last provider
 * gets whatever the first two left it, which is usually nothing — the
 * failover exists precisely because the earlier ones were slow.
 *
 * Long, because these are generation calls and a website build genuinely
 * takes minutes. The route's own maxDuration is the real ceiling; this
 * is here so a provider that accepts a connection and then says nothing
 * cannot hold the whole request until the platform kills it, which
 * produces no log line at all.
 */
export const ATTEMPT_TIMEOUT_MS = 120_000;

/** Batch submission is a small control-plane call, not a generation. A
 *  two-minute budget for a request that returns an id in under a second
 *  just delays the discovery that the vendor is down. */
export const CONTROL_TIMEOUT_MS = 20_000;
