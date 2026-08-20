/**
 * A spend limit and a circuit breaker for Unsplash, per generation.
 *
 * THE PROBLEM THIS SOLVES, which is arithmetic rather than opinion.
 * A free Unsplash "demo" application is capped at 50 requests per HOUR.
 * lib/website-image-resolver.ts resolves every PLACEHOLDER image in
 * parallel, and each one walks broadenImageQuery's ladder — up to FOUR
 * separate searches, because a specific query that returns nothing is
 * retried with a shorter one rather than dropped on the first miss.
 *
 * Four searches per photo is the right behaviour for photo quality and it
 * multiplies: a site with ten photos whose queries all miss spends forty
 * requests. Two such generations exhaust the hourly quota, and from then
 * on every search in the account returns 403 — so every photo silently
 * went unresolved (historically: became a random picsum image with no
 * relationship to the subject), which is indistinguishable from "the
 * integration was never wired up". That is exactly the report: a
 * generated site with no real photos.
 *
 * Two things are needed and neither is a retry policy.
 *
 *   A CEILING, so one generation cannot spend the whole hour's quota.
 *   A BREAKER, so that once the API says "you are out", the remaining
 *   photos stop asking. Without it, a rate-limited generation still fires
 *   one doomed request per broadening step per photo — spending nothing
 *   but latency, and keeping the account pinned at zero.
 *
 * Kept pure and free of any network import so the arithmetic can be tested
 * without a key, a socket or a fixture server.
 */

/**
 * Requests one generation may spend.
 *
 * 12 is chosen against the demo tier's 50/hour: it lets a photo-heavy site
 * resolve properly (a typical page has 3-6 photos, most of which hit on
 * the first, most specific query) while leaving room for three or four
 * more generations in the same hour. A production Unsplash application is
 * 5000/hour, where this ceiling is irrelevant and harmless.
 */
const DEFAULT_REQUESTS_PER_GENERATION = 12;

function configuredCeiling(): number {
  const raw = process.env.UNSPLASH_REQUESTS_PER_GENERATION;
  if (raw === undefined || raw.trim() === "") return DEFAULT_REQUESTS_PER_GENERATION;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
    // eslint-disable-next-line no-console
    console.warn(
      `[unsplash-budget] UNSPLASH_REQUESTS_PER_GENERATION="${raw}" ignored ` +
        `(must be a whole number between 1 and 500) — using ${DEFAULT_REQUESTS_PER_GENERATION}.`
    );
    return DEFAULT_REQUESTS_PER_GENERATION;
  }
  return parsed;
}

/**
 * Raise it ONLY with a production Unsplash application (5000/hour). On the
 * free Demo tier (50/hour) a higher ceiling does not buy more photos — it
 * spends the whole hour's quota on one generation and 403s the next
 * three, which is the failure this ceiling exists to prevent.
 */
export const UNSPLASH_REQUESTS_PER_GENERATION = configuredCeiling();

export type UnsplashHaltReason = "rate-limited" | "budget-exhausted" | "unauthorised";

export type UnsplashBudget = {
  /** False once the ceiling is reached or the breaker has tripped. */
  canSpend(): boolean;
  /** Records one request about to be made. */
  spend(): void;
  /** Trips the breaker: no further requests this generation. */
  halt(reason: UnsplashHaltReason): void;
  readonly spent: number;
  readonly halted: UnsplashHaltReason | null;
};

export function createUnsplashBudget(limit: number = UNSPLASH_REQUESTS_PER_GENERATION): UnsplashBudget {
  let spent = 0;
  let halted: UnsplashHaltReason | null = null;
  return {
    canSpend() {
      if (halted) return false;
      if (spent >= limit) {
        halted = "budget-exhausted";
        return false;
      }
      return true;
    },
    spend() {
      spent += 1;
    },
    halt(reason) {
      if (!halted) halted = reason;
    },
    get spent() {
      return spent;
    },
    get halted() {
      return halted;
    },
  };
}

/**
 * What an Unsplash response means for the rest of this generation.
 *
 * Unsplash does NOT use 429 for quota exhaustion — it answers 403 with
 * `X-Ratelimit-Remaining: 0`, which is easy to read as "the key is wrong"
 * and give up on permanently. Both are treated as fatal for this
 * generation and they are told apart, because the fix a human needs is
 * completely different: wait an hour, versus fix the key.
 *
 * A 404 or a 5xx is NOT fatal — that is one bad query or one bad minute,
 * and the next photo deserves its turn.
 */
export function classifyUnsplashResponse(
  status: number,
  headers: { get(name: string): string | null }
): UnsplashHaltReason | null {
  if (status === 429) return "rate-limited";
  if (status === 403) {
    const remaining = headers.get("x-ratelimit-remaining");
    // 403 + "0 left" is the quota. 403 with anything else is the key.
    if (remaining !== null && Number(remaining) <= 0) return "rate-limited";
    return "unauthorised";
  }
  if (status === 401) return "unauthorised";
  return null;
}

/** Human-readable, for the generation log — so "why are the photos
 *  generic" has an answer that is not a guess. */
export function describeUnsplashHalt(reason: UnsplashHaltReason, spent: number): string {
  switch (reason) {
    case "rate-limited":
      return `Unsplash quota exhausted after ${spent} request(s) — the remaining photo placeholders were removed rather than filled with unrelated images. A demo Unsplash application allows 50 requests/hour; apply for production access (5000/hour) or wait for the window to reset.`;
    case "unauthorised":
      return `Unsplash rejected the credentials after ${spent} request(s) — check UNSPLASH_ACCESS_KEY. All photo placeholders were removed.`;
    case "budget-exhausted":
      return `This generation reached its ceiling of ${UNSPLASH_REQUESTS_PER_GENERATION} Unsplash requests — the remaining photo placeholders were removed rather than filled with unrelated images.`;
  }
}
