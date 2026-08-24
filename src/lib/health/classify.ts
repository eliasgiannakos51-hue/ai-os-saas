/**
 * WHICH STEP FAILED, AND WHY — as a closed vocabulary, not as prose.
 *
 * THE REPORT THIS EXISTS FOR. /api/health answered
 * {"ok":false,"db":false,"ms":529} in production. Every word of that is
 * true and none of it is useful: 529ms says a round trip HAPPENED, so the
 * network and the host are fine, and "db:false" then covers a missing
 * table, a rejected key, a stale schema cache and a dead database with
 * one indistinguishable word. Somebody woken by that alert has to guess.
 *
 * WHY A CLOSED SET AND NOT THE REAL MESSAGE. The route is public and
 * unauthenticated by design, and a public endpoint that echoes database
 * errors hands a stranger the schema one 404 at a time — table names,
 * column names, and the shape of what exists. So the classification below
 * is the ONLY thing that reaches an anonymous caller. The underlying
 * error still goes to the server log in full, where the person on call
 * can read it.
 *
 * NEVER A CREDENTIAL, and that is enforced rather than intended: nothing
 * here is derived from an environment VALUE. `hasUrl`/`hasKey` are
 * booleans computed by the caller; this function never sees a key, a
 * connection string or a host, so there is no path by which one could be
 * returned. scrubSecrets() below is the second line for the authenticated
 * verbose mode, where a real message is allowed through.
 *
 * Pure and dependency-free on purpose — no "server-only", no SDK — so the
 * mapping is unit-testable through scripts/tests/load-ts.mjs's strict
 * loader, the one that refuses any external import.
 */

/** The step that failed. Ordered as the probe performs them. */
export const HEALTH_STAGES = ["config", "client", "query", "none"] as const;
export type HealthStage = (typeof HEALTH_STAGES)[number];

/** Why it failed. Every value is safe to show a stranger. */
export const HEALTH_REASONS = [
  "ok",
  /** An environment variable the client needs is absent. */
  "misconfigured",
  /** The table is not there, or PostgREST's schema cache has not seen it. */
  "schema_missing",
  /** The service key was rejected, or the role lacks the privilege. */
  "unauthorized",
  /** Nothing answered: DNS, connection refused, TLS. */
  "unreachable",
  /** Something answered, too late. */
  "timeout",
  /** Reached the database and it said no, in a way not listed above. */
  "query_failed",
  /** Classified nothing — kept so the caller never has to invent a value. */
  "unknown",
] as const;
export type HealthReason = (typeof HEALTH_REASONS)[number];

/**
 * Postgres and PostgREST codes this maps, and why each one is here:
 *
 *   PGRST205  PostgREST could not find the table in its SCHEMA CACHE.
 *             The commonest cause in this project is a migration that has
 *             not run; the second commonest is a migration that HAS run
 *             while PostgREST still holds the old cache. Both are
 *             "the schema is behind", not "the database is down", and
 *             conflating them is what sends somebody to check the wrong
 *             thing first.
 *   42P01     undefined_table, straight from Postgres.
 *   42703     undefined_column — the table exists, the column moved.
 *   PGRST202  function not found in the schema cache (same family).
 *   PGRST301  JWT problems.
 *   42501     insufficient_privilege — a GRANT is missing.
 *   28000/28P01  invalid_authorization / invalid_password.
 *   57014     query_canceled, which is a statement timeout.
 */
const SCHEMA_CODES = new Set(["PGRST205", "PGRST202", "42P01", "42703"]);
const AUTH_CODES = new Set(["PGRST301", "42501", "28000", "28P01"]);
const TIMEOUT_CODES = new Set(["57014", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT"]);
const UNREACHABLE_CODES = new Set(["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "EAI_AGAIN", "UND_ERR_SOCKET"]);

/** The shape supabase-js returns on a failed query. */
export type ProbeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  status?: number | null;
};

/**
 * MATCHED ON CODE FIRST, message only as a fallback.
 *
 * A message is prose written by somebody else's software: it is
 * translated, reworded between versions, and in this project it has
 * already changed once. The code is the contract. The message check
 * below exists only for the errors that carry no code at all — a raw
 * fetch failure — and is deliberately narrow.
 */
export function classifyProbeError(error: ProbeError | null | undefined): HealthReason {
  if (!error) return "ok";
  const code = String(error.code ?? "").trim();
  if (code) {
    if (SCHEMA_CODES.has(code)) return "schema_missing";
    if (AUTH_CODES.has(code)) return "unauthorized";
    if (TIMEOUT_CODES.has(code)) return "timeout";
    if (UNREACHABLE_CODES.has(code)) return "unreachable";
  }
  if (error.status === 401 || error.status === 403) return "unauthorized";
  if (error.status === 404) return "schema_missing";

  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  if (!text.trim()) return code ? "query_failed" : "unknown";
  // CASE-INSENSITIVE REGEXES, not a lower-cased copy compared elsewhere.
  //
  // The obvious way to write this is `text.toLowerCase().includes(...)`,
  // and scripts/tests/accent-search.test.mjs refuses it — correctly. That
  // gate exists because lower-casing text into a variable and matching it
  // somewhere else is how this project's search stopped working for Greek:
  // case folding is not locale-neutral, and the copy silently stops being
  // the text it came from. The message here is machine-written English
  // rather than a person's search query, so the bug could not bite; the
  // SHAPE is what the gate forbids, and a rule with a "but not here"
  // carve-out is a rule that erodes. The `i` flag does the same job at the
  // point of comparison, with no second copy of the string in existence.
  //
  // NARROW ON PURPOSE. "not found" alone would swallow half of Postgres.
  if (/schema cache|does not exist/i.test(text)) return "schema_missing";
  if (/fetch failed|network/i.test(text)) return "unreachable";
  if (/timeout|timed out/i.test(text)) return "timeout";
  if (/\bjwt\b|api key|unauthorized/i.test(text)) return "unauthorized";
  return "query_failed";
}

/** Is this reason the database's fault, or the deployment's? Reported so a
 *  monitor can page for one and open a ticket for the other. */
export function isDatabaseReachable(reason: HealthReason): boolean {
  // schema_missing and unauthorized both mean SOMETHING ANSWERED. The
  // database is alive; the deployment is wrong. Saying "db down" for
  // those sends the on-call engineer to the database dashboard, which
  // will be entirely green, and costs them the first ten minutes.
  return reason === "ok" || reason === "schema_missing" || reason === "unauthorized" || reason === "query_failed";
}

/**
 * Last line before a real message is shown to an AUTHENTICATED caller.
 *
 * A Postgres error should never contain a key. "Should never" is not a
 * guarantee, and this endpoint is the one place a message crosses from
 * the log into an HTTP response, so anything shaped like a credential is
 * removed on the way out. JWTs (three dot-separated base64url runs),
 * long opaque tokens, and basic-auth credentials inside a URL.
 */
export function scrubSecrets(text: string): string {
  return text
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[redacted-jwt]")
    .replace(/\b(sb|sbp|re|sk|pk)_[A-Za-z0-9_-]{12,}/g, "[redacted-token]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+:[^/@\s]+@/gi, "$1[redacted-userinfo]@")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted-opaque]");
}
