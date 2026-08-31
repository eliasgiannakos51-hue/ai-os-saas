/**
 * ONE SCRUBBER, REACHABLE FROM ANYWHERE — because the last one wasn't.
 *
 * This function was written for /api/health, lived in lib/health/classify.ts,
 * and was called from exactly one file. Meanwhile logApiError() — the
 * function every API route in this product calls when something goes
 * wrong — wrote the provider's raw message to three places without it:
 *
 *   1. stderr, which is Vercel Runtime Logs;
 *   2. the production_errors table, via recordProductionError();
 *   3. an email to the owner, via sendErrorAlertEmail().
 *
 * And (2) is rendered as text on /dashboard/system-health. So a message
 * that happened to carry a token — a provider SDK that echoes the
 * Authorization header it just sent, a connection string in a Postgres
 * error, a fetch failure that includes the URL — reached a log, a
 * database row, a web page and an inbox. The defence existed and was
 * correct; it was simply wired to the one caller who had needed it.
 *
 * It now lives here, at the top of lib/, so that "where is the scrubber"
 * has an answer that does not require knowing the health page exists.
 *
 * Pure and dependency-free ON PURPOSE — no "server-only", no SDK — so it
 * can be applied on either side of the boundary and unit-tested through
 * scripts/tests/load-ts.mjs's strict loader, the one that refuses any
 * external import.
 */

/**
 * WHAT THIS CATCHES, AND WHAT IT PROVABLY DOES NOT.
 *
 * Each rule below is here because this product holds a credential of that
 * shape. The shapes were read off the env variables the code actually
 * uses (see docs/api-keys.md), not guessed:
 *
 *   eyJ….….…            a JWT — SUPABASE_SERVICE_ROLE_KEY's classic form,
 *                        and the single most dangerous string in the app.
 *   sb_ sbp_             Supabase's newer publishable/secret keys.
 *   sk_ pk_ rk_ whsec_   Stripe (secret, publishable, restricted, webhook)
 *                        and ELEVENLABS_API_KEY, which is also `sk_…`.
 *   re_                  RESEND_API_KEY.
 *   <digits>:<run>       TELEGRAM_BOT_TOKEN, which is the only credential
 *                        here shaped like two fields joined by a colon.
 *   scheme://user:pass@  basic-auth credentials inside a URL, which is how
 *                        a Postgres connection string leaks.
 *   any run ≥ 40 chars   the catch-all. It is what covers ANTHROPIC_API_KEY
 *                        (sk-ant-api03-…, whose random tail is ~86 chars),
 *                        OPENAI_API_KEY, UNSPLASH_ACCESS_KEY (43),
 *                        VAPID_PRIVATE_KEY (43) and
 *                        INTEGRATION_ENCRYPTION_KEY (64 hex).
 *
 * NOT CAUGHT, said plainly rather than left to be discovered:
 *
 *   CRON_SECRET is whatever the operator typed. A secret with no shape
 *   cannot be recognised by a regex, and this function will not remove
 *   it. That is why checkCronAuth compares it and nothing ever logs it.
 *
 *   Any credential shorter than 40 characters with a prefix not listed
 *   above passes through. Adding a provider means adding its prefix here
 *   AND a case to scripts/tests/log-scrubbing.test.mjs.
 *
 * The order matters: the specific rules run first so that a recognised
 * token is labelled with what it was, and the ≥40 catch-all runs last so
 * it only sees what nothing else claimed.
 */
export function scrubSecrets(text: string): string {
  return text
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[redacted-jwt]")
    .replace(/\b(sb|sbp|re|sk|pk|rk|whsec)_[A-Za-z0-9_-]{12,}/g, "[redacted-token]")
    .replace(/\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g, "[redacted-bot-token]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+:[^/@\s]+@/gi, "$1[redacted-userinfo]@")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted-opaque]");
}

/**
 * Applies scrubSecrets to a value that may not be a string.
 *
 * Returns the input unchanged when it is not a string, so a caller can
 * pass an optional field through without a ternary at every call site —
 * the ternary is where somebody forgets one.
 */
export function scrubMaybe<T>(value: T): T {
  return (typeof value === "string" ? (scrubSecrets(value) as unknown as T) : value);
}
