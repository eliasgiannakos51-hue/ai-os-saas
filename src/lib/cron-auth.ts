import { timingSafeEqual } from "node:crypto";

// Shared authorisation guard for every scheduler-triggered route
// (api/cron/reset-credits, api/cron/scheduled-runs, api/weekly-digest).
//
// DEFECT this replaces (found in the V1+V2 audit): all three routes used
// to run the check only when CRON_SECRET happened to be set —
//
//     const secret = process.env.CRON_SECRET;
//     if (secret) { ...401 on mismatch... }
//
// — which means a deployment that simply never configured CRON_SECRET
// left the routes WIDE OPEN to anyone who could guess the path. That is
// a fail-OPEN default on the three most damaging endpoints in the app:
// reset-credits rewrites every account's balance, scheduled-runs spends
// real money on Anthropic calls on behalf of every user, and
// weekly-digest emails the entire user base. A missing environment
// variable must never be the thing standing between the public internet
// and any of that.
//
// The guard now fails CLOSED: with no secret configured the route refuses
// to run at all (503) anywhere it could be reachable from outside. The
// single exception is a local, non-deployed development process, so
// `curl localhost:3000/api/cron/...` still works while iterating.

/** True only for a developer's own machine — never for a deployment. */
function isLocalDevelopment(): boolean {
  // Vercel injects VERCEL_ENV on every deployment, including previews.
  // Its presence alone is proof this is not a local dev process.
  if (process.env.VERCEL_ENV || process.env.VERCEL) return false;
  return process.env.NODE_ENV !== "production";
}

/** Constant-time compare, so the response time can't be used to learn the secret. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, so length is compared
  // first. Length is not itself sensitive here.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type CronAuthFailure = { ok: false; status: number; error: string };
export type CronAuthResult = { ok: true } | CronAuthFailure;

/**
 * Authorise a scheduler-triggered request.
 *
 * Accepts either `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron
 * sends when the project has a cron secret configured) or the
 * `x-cron-secret` header, so a GitHub Action or an external scheduler that
 * cannot set Authorization is not forced to go without auth.
 */
export function checkCronAuth(request: Request): CronAuthResult {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (isLocalDevelopment()) return { ok: true };
    return {
      ok: false,
      status: 503,
      // Deliberately says nothing about which variable is missing: this
      // response is reachable by anyone on the internet.
      error: "This endpoint is not available.",
    };
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ") && secretsMatch(authHeader.slice(7), secret)) {
    return { ok: true };
  }

  const headerSecret = request.headers.get("x-cron-secret");
  if (headerSecret && secretsMatch(headerSecret, secret)) {
    return { ok: true };
  }

  return { ok: false, status: 401, error: "Unauthorized." };
}
