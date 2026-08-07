import type { PlanSlug } from "@/lib/billing/plans";

// Fair use for the Presentation Builder, per plan.
//
// One ceiling, not three (unlike lib/files/limits.ts): a deck costs
// almost nothing to STORE — it is a few KB of JSON, and the photos are
// hotlinked from Unsplash rather than held in our bucket. What costs
// money is GENERATING one: a web-search pass over the topic plus a long
// structured output. So the ceiling is on generations per calendar
// month, and it is the only one that needs to be hard.
//
// Free is zero. That is the same call the agents and Deep Research
// limits made, for the same reason: this is a multi-search, long-output
// action, and it is exactly what a throwaway account would be created
// for. Free accounts can still OPEN, edit, present and export a deck
// shared with them or created before a downgrade — the cap is on
// creating new ones, not on the data.
//
// Every number is overridable per deployment, because the right cap
// depends on what a credit ends up costing in production and that is not
// knowable from here.

export const UNLIMITED = Number.POSITIVE_INFINITY;

export const DEFAULT_PRESENTATION_LIMITS: Record<PlanSlug, number> = {
  free: 0,
  starter: 5,
  growth: 20,
  professional: 100,
  ultimate: UNLIMITED,
  // Enterprise is negotiated. Unlike storage — which bills forever and
  // therefore must not be unbounded — a generation is a one-off cost the
  // account has already paid credits for, so "unlimited" here is bounded
  // by the credit balance regardless.
  enterprise: UNLIMITED,
};

export const PRESENTATION_LIMIT_ENV_VARS: Record<PlanSlug, string> = {
  free: "PRESENTATION_LIMIT_FREE",
  starter: "PRESENTATION_LIMIT_STARTER",
  growth: "PRESENTATION_LIMIT_GROWTH",
  professional: "PRESENTATION_LIMIT_PROFESSIONAL",
  ultimate: "PRESENTATION_LIMIT_ULTIMATE",
  enterprise: "PRESENTATION_LIMIT_ENTERPRISE",
};

export type PresentationLimitWarning = { variable: string; value: string; reason: string };

/**
 * Parse the per-plan overrides.
 *
 * Deliberately the same shape as lib/files/limits.ts's parseFamily,
 * including the behaviour on a bad value: WARN and fall back to the
 * default rather than throw. Refusing to boot over a typo in an optional
 * tuning variable turns a cosmetic mistake into an outage, and the
 * default is always the safe number.
 *
 * Not shared with that function on purpose — importing it would drag
 * lib/files/limits.ts (and its storage/research families) into every
 * client bundle that only wants to know how many decks a plan gets.
 */
export function parsePresentationLimits(env: Record<string, string | undefined>): {
  limits: Record<PlanSlug, number>;
  warnings: PresentationLimitWarning[];
} {
  const warnings: PresentationLimitWarning[] = [];
  const limits = { ...DEFAULT_PRESENTATION_LIMITS };

  for (const slug of Object.keys(DEFAULT_PRESENTATION_LIMITS) as PlanSlug[]) {
    const variable = PRESENTATION_LIMIT_ENV_VARS[slug];
    const raw = env[variable];
    if (raw === undefined || raw.trim() === "") continue;

    if (raw.trim().toLowerCase() === "unlimited") {
      limits[slug] = UNLIMITED;
      continue;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) {
      warnings.push({ variable, value: raw, reason: 'not a whole number (or "unlimited")' });
      continue;
    }
    // 10,000 decks a month is a fat finger, not an intention.
    if (parsed < 0 || parsed > 10_000) {
      warnings.push({ variable, value: raw, reason: "outside the allowed range 0-10000" });
      continue;
    }
    limits[slug] = parsed;
  }

  return { limits, warnings };
}

export function maxPresentationsForPlan(slug: PlanSlug | null | undefined): number {
  if (!slug) return DEFAULT_PRESENTATION_LIMITS.free;
  return parsePresentationLimits(process.env).limits[slug] ?? DEFAULT_PRESENTATION_LIMITS.free;
}

/**
 * AI edits per hour, per user.
 *
 * Separate from the monthly generation cap because it bounds a different
 * thing: an account with 99 decks left should still not be able to spend
 * them, or hammer the model, inside a minute. An edit re-sends the whole
 * deck, so it is not a cheap call even though it produces less than a
 * generation.
 */
export function maxPresentationEditsPerHour(): number {
  const raw = Number(process.env.PRESENTATION_MAX_EDITS_PER_HOUR);
  return Number.isInteger(raw) && raw > 0 && raw <= 500 ? raw : 40;
}

/**
 * Versions kept per deck.
 *
 * Every generation and every accepted AI edit appends one. The cap is
 * enforced by deleting the oldest, so history is bounded per deck rather
 * than per account — 20 is well past the point anyone scrolls back, and
 * a deck is small enough that 20 copies of one is still trivial.
 */
export const MAX_VERSIONS_PER_PRESENTATION = 20;
