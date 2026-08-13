/**
 * A spend limit and a circuit breaker for Unsplash, per generation.
 *
 * THE PROBLEM THIS SOLVES, which is arithmetic rather than opinion.
 * A free Unsplash "demo" application is capped at 50 requests per HOUR.
 * lib/website-image-resolver.ts resolves every PLACEHOLDER image in
 * parallel, and each one walks broadenImageQuery's ladder — up to FOUR
 * separate searches, because a specific query that returns nothing is
 * retried with a shorter one rather than dropped straight to picsum.
 *
 * Four searches per photo is the right behaviour for photo quality and it
 * multiplies: a site with ten photos whose queries all miss spends forty
 * requests. Two such generations exhaust the hourly quota, and from then
 * on every search in the account returns 403 — so every photo silently
 * becomes a picsum image with no relationship to the subject, which is
 * indistinguishable from "the integration was never wired up". That is
 * exactly the report: a generated site with no real photos.
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
export const UNSPLASH_REQUESTS_PER_GENERATION = 12;

/**
 * The ceiling any one generation may reach, however many photos it wants.
 *
 * A `gallery` page ("IMAGES: the maximum") legitimately asks for fifteen or
 * twenty photographs. Letting one such page spend eighty requests would put
 * a demo-tier account at zero for the rest of the hour and make every
 * subsequent site's photos generic — the failure this file already exists
 * to prevent, arriving by a different route.
 */
export const UNSPLASH_MAX_REQUESTS_PER_GENERATION = 40;

/**
 * How many requests a generation with `placeholderCount` photos may spend.
 *
 * THE BUG THIS REPLACES, which is arithmetic and was measurable.
 *
 * The budget was a flat 12 shared by every photo, and every photo walked a
 * ladder of up to four broadening searches concurrently. Simulated over the
 * real control flow: at 14 photos, two of them never got a SINGLE search
 * before the ceiling was reached; at 20 photos, eight of them never did.
 * Those photos went straight to a seeded placeholder without the library
 * ever being asked about them — which on a portfolio site, the exact shape
 * that asks for the most photographs, is most of the page.
 *
 * A photo that was never searched for is strictly worse than a photo whose
 * search was shallow, so the first search per photo is guaranteed and the
 * broadening allowance is what is shared. The old flat 12 becomes that
 * shared allowance, which is what it was always really for: broadening is
 * the multiplier, not the first attempt.
 */
export function unsplashBudgetForPlaceholders(placeholderCount: number): number {
  const guaranteedFirstPass = Math.max(0, placeholderCount);
  return Math.min(
    guaranteedFirstPass + UNSPLASH_REQUESTS_PER_GENERATION,
    UNSPLASH_MAX_REQUESTS_PER_GENERATION
  );
}

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
  /** The ceiling this budget was created with — so a message about
   *  exhausting it can name the real number rather than a constant that is
   *  now only one term of it. */
  readonly limit: number;
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
    get limit() {
      return limit;
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
export function describeUnsplashHalt(reason: UnsplashHaltReason, spent: number, limit?: number): string {
  switch (reason) {
    case "rate-limited":
      return `Unsplash quota exhausted after ${spent} request(s) — remaining photos fell back to picsum. A demo Unsplash application allows 50 requests/hour; apply for production access (5000/hour) or wait for the window to reset.`;
    case "unauthorised":
      return `Unsplash rejected the credentials after ${spent} request(s) — check UNSPLASH_ACCESS_KEY. All photos fell back to picsum.`;
    case "budget-exhausted":
      // The ceiling is per-generation and scales with the photo count now,
      // so quoting the shared broadening allowance would name a number this
      // run never had.
      return `This generation reached its ceiling of ${limit ?? UNSPLASH_REQUESTS_PER_GENERATION} Unsplash requests — remaining photos fell back to picsum.`;
  }
}
