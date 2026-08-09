// How long a serverless function is allowed to run here — and what the
// code does about it.
//
// WHY THIS EXISTS. Two routes declared `maxDuration = 800`, which is a
// Vercel Pro (Fluid Compute) figure. On Hobby the ceiling is 60 seconds,
// and the consequences are worse than "slower":
//
//   1. Vercel VALIDATES maxDuration against the plan at build time. A
//      route asking for 800 on Hobby is a BUILD FAILURE, not a degraded
//      deploy — the whole product stops shipping.
//   2. Even without that, a function killed at 60s runs no catch block.
//      No status is written, no settlement happens, the credit hold sits
//      there until the sweep. That is exactly the Deep Research failure
//      already fixed once for the 300s ceiling; dropping to 60 would
//      reintroduce it in a worse form.
//
// So the ceiling becomes a single configured number, and everything that
// can outrun it is written to work WITHIN it by splitting into chunks
// rather than by hoping it fits.
//
// MAX_FUNCTION_DURATION drives TWO separate things, in two different
// places, and keeping them separate is deliberate:
//
//   THE DECLARED CEILING — the `maxDuration` literal in each route. Next
//   requires a literal (see the note below resolveMaxFunctionDuration for
//   the measurements), so it is rewritten before the build by
//   scripts/apply-function-limits.mjs.
//
//   THE RUNTIME BUDGET — functionBudgetMs() below, read at request time.
//   This is the half that actually prevents a mid-work kill, and it needs
//   no static analysis at all.
//
// If the declared ceiling were ever wrong, the runtime budget still stops
// the work in time and the job still saves its state.

/** Vercel Hobby's hard ceiling. Anything above this needs Pro. */
export const HOBBY_MAX_DURATION_SECONDS = 60;

/** What the app asks for when nothing is configured — a Pro/Fluid figure. */
export const DEFAULT_MAX_DURATION_SECONDS = 800;

// Below 10s nothing in this app can finish even one chunk, and a typo like
// "6" would turn every long action into an instant failure that looks like
// a bug in the feature. Above 3600 is beyond any plan.
const MIN_ALLOWED = 10;
const MAX_ALLOWED = 3600;

function parse(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
  if (parsed < MIN_ALLOWED || parsed > MAX_ALLOWED) return null;
  return parsed;
}

/**
 * The configured ceiling, in seconds.
 *
 * Exported as a function so tests can drive it with an explicit env
 * object; the module-level constant below is what routes import.
 */
export function resolveMaxFunctionDuration(
  env: Record<string, string | undefined> = process.env
): number {
  const parsed = parse(env.MAX_FUNCTION_DURATION);
  if (parsed === null) {
    if (env.MAX_FUNCTION_DURATION !== undefined && env.MAX_FUNCTION_DURATION.trim() !== "") {
      // eslint-disable-next-line no-console
      console.warn(
        `[function-limits] MAX_FUNCTION_DURATION="${env.MAX_FUNCTION_DURATION}" ignored ` +
          `(must be a whole number between ${MIN_ALLOWED} and ${MAX_ALLOWED}) — using ${DEFAULT_MAX_DURATION_SECONDS}.`
      );
    }
    return DEFAULT_MAX_DURATION_SECONDS;
  }
  return parsed;
}

export const MAX_FUNCTION_DURATION_SECONDS = resolveMaxFunctionDuration();

// NOTE ON THE DECLARED CEILING. It is NOT set from here, and it cannot be.
//
// Next.js reads `export const maxDuration` by STATIC ANALYSIS, so it must
// be a plain numeric literal. Measured, not assumed — every alternative
// was built and rejected:
//
//   routeMaxDuration(800)                 -> Unsupported node "CallExpression"
//   Number(process.env.X) || 800          -> Unsupported node "BinaryExpression"
//   process.env.X ? 60 : 800              -> Unsupported node "ConditionalExpression"
//   +(process.env.X ?? 800)               -> Unsupported node "UnaryExpression"
//
// In every case Next warns "can't recognize the exported `config` field"
// and IGNORES the value — a build that succeeds while the setting does
// nothing, which is worse than an error.
//
// So the literal is rewritten before the build by
// scripts/apply-function-limits.mjs, from the `@function-limit` marker on
// each route. This module owns the RUNTIME half: how long the code lets
// itself work before saving state and handing on. The two read the same
// environment variable and are verified against each other by
// scripts/tests/function-limits.test.mjs.

/**
 * True when the platform cannot hold a whole long action in one
 * invocation, so the work has to be chunked and handed on.
 *
 * The threshold is not "60": it is "less than the app's default", because
 * the question is not which plan we are on but whether the budget is
 * smaller than the work was written for.
 */
export function isChunkedRuntime(): boolean {
  return MAX_FUNCTION_DURATION_SECONDS < DEFAULT_MAX_DURATION_SECONDS;
}

// How much of the budget to leave unspent. The platform kills at exactly
// maxDuration and everything in flight is lost, including the writes that
// record what was done — so a chunk must stop early enough to save its
// state, settle if it is the last one, and hand off.
//
// 20% or 8 seconds, whichever is larger: on a 60s budget that is 12s,
// which comfortably covers a few Supabase writes plus an outbound
// handoff; on 800s it is 160s, which is roughly one long model round.
const SAFETY_FRACTION = 0.2;
const MIN_SAFETY_MS = 8_000;

/**
 * Milliseconds of REAL work this invocation may start, measured from
 * `startedAt`. Everything that loops over units of work checks this
 * before starting the next one.
 */
export function functionBudgetMs(): number {
  const totalMs = MAX_FUNCTION_DURATION_SECONDS * 1000;
  const safety = Math.max(MIN_SAFETY_MS, totalMs * SAFETY_FRACTION);
  return Math.max(1_000, totalMs - safety);
}

/**
 * Whether there is still room to start a unit of work expected to take
 * `unitMs`.
 *
 * Takes the elapsed time rather than reading a clock, so it is a pure
 * function and can be tested with fixed numbers instead of by waiting.
 */
export function hasBudgetFor(elapsedMs: number, unitMs: number, budgetMs = functionBudgetMs()): boolean {
  return elapsedMs + unitMs <= budgetMs;
}

/**
 * The internal token that authorises one invocation to continue another.
 *
 * A chunked job hands off by calling its own deployment, which arrives
 * with no user session — so the continuation endpoint has to be
 * authenticated some other way, and it must not be callable by anyone who
 * can guess a report id. CRON_SECRET is reused deliberately: it is the
 * existing secret for "this request came from our own infrastructure",
 * it is already required in production (lib/cron-auth.ts), and adding a
 * second secret for the same trust boundary means two things to rotate.
 *
 * Returns null when unset, and every caller treats that as "handoff is
 * not available" rather than "handoff is unauthenticated".
 */
export function internalHandoffToken(): string | null {
  const secret = process.env.CRON_SECRET;
  return secret && secret.trim() ? secret.trim() : null;
}

export const INTERNAL_HANDOFF_HEADER = "x-ionexa-internal";
