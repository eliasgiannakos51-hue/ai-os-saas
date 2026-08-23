/**
 * THE FOUR TIERS AND THE LADDER (V4 #34).
 *
 * A request is trivial, simple, complex or expert, and each tier names
 * the CHEAPEST model believed able to do it. That belief is the whole
 * point: it is a hypothesis, it is measured by the eval suite
 * (scripts/evals/), and it is rolled back automatically when quality
 * drops more than 10% (see regressions() in lib/evals/scoring.ts).
 *
 * THE LADDER IS NOT A PREFERENCE ORDER, IT IS AN ESCALATION PATH. When a
 * tier's model fails in a way that a stronger model could fix, the router
 * climbs one rung — and the user is charged ONCE, for the attempt that
 * succeeded. Charging for both would mean a routing decision the user
 * never made cost them money.
 *
 * Pure — no SDK, no env, no clock — so every branch is exercised by the
 * build gate with no API key.
 */

export const TIERS = ["trivial", "simple", "complex", "expert"] as const;
export type Tier = (typeof TIERS)[number];

export function isTier(value: unknown): value is Tier {
  return typeof value === "string" && (TIERS as readonly string[]).includes(value);
}

/**
 * The ladder, cheapest first.
 *
 * IDS ARE CATALOG IDS. A model named here that is not in
 * lib/ai/providers/catalog.ts cannot be priced, cannot have its cache
 * minimum read, and would be routed to blind — so the build gate asserts
 * every one of these resolves.
 */
export const TIER_MODELS: Record<Tier, string> = {
  trivial: "claude-haiku-4-5",
  simple: "claude-haiku-4-5",
  complex: "claude-sonnet-4-6",
  expert: "claude-opus-4-6",
};

/** Cheapest to strongest. The escalation path and the only order in which
 *  a request may move between models. */
export const LADDER = ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6"] as const;

/** One rung up, or null at the top. Never two rungs: an escalation that
 *  skipped to the most expensive model on any failure would make the
 *  cheap tiers a liability rather than a saving. */
export function nextRung(modelId: string): string | null {
  const i = (LADDER as readonly string[]).indexOf(modelId);
  if (i === -1 || i === LADDER.length - 1) return null;
  return LADDER[i + 1];
}

/**
 * WHAT MAY ESCALATE, AND WHAT MAY NOT.
 *
 * A refusal, a rate limit and an authentication error are not
 * "the model was too weak" — retrying them on a stronger model spends
 * more money for the same answer, and in the refusal case it is an
 * attempt to launder a decision the first model made correctly.
 *
 * Only these four are evidence that a stronger model would do better.
 */
export const ESCALATABLE = [
  /** The response did not satisfy the caller's own structural check
   *  (invalid JSON, missing required field). */
  "malformed_output",
  /** The model said it could not do the task. */
  "capability_declined",
  /** Output was truncated at max_tokens mid-structure. */
  "truncated",
  /** The caller's verification step rejected the answer. */
  "verification_failed",
] as const;
export type EscalationReason = (typeof ESCALATABLE)[number];

export function canEscalate(reason: string): reason is EscalationReason {
  return (ESCALATABLE as readonly string[]).includes(reason);
}
