// The four model tiers every AI feature in this app draws from.
//
// ONE FILE decides which Claude model answers which kind of work, so a
// model upgrade is an edit here plus a pricing entry in
// lib/billing/model-pricing.ts — IN THE SAME COMMIT, enforced by
// scripts/tests/model-coverage.test.mjs, because a model whose price the
// margin system does not know is silently under-charged (the fallback
// prices unknown models at the most expensive known one, which protects
// margin but overcharges users — both wrong).
//
// The tiers, and the reasoning (full mapping table in ./MODELS.md):
//
//   MAX      claude-fable-5     Deep Research, complex mission planning,
//                               large/complex website builds. The work
//                               that synthesises many sources or holds a
//                               long plan together — where the strongest
//                               model's output is visibly different and
//                               the action is priced to carry it.
//   PREMIUM  claude-opus-5      Website Builder (normal), Presentations,
//                               Agents, live editing, mission execution.
//                               Deliverable-producing work: the output IS
//                               the product the user paid credits for.
//   STANDARD claude-sonnet-5    Chat, Create Anything, File Q&A, module
//                               Q&A, text actions, reflections. Fast
//                               conversational intelligence; near-Opus on
//                               these shapes at 60% of the price.
//   FAST     claude-haiku-4-5   Classification, keyword extraction,
//                               clarifying checks, lead scoring, chat
//                               memory, support. Closed-set decisions
//                               where a stronger model produces the same
//                               label at 5-10x the cost.
//
// Every tier is overridable per deployment via env var. The overrides
// are read at CALL time on the server; this module is deliberately
// client-safe (the Website Builder's pre-submit estimate prices the same
// model the server will call), and in the browser — where process.env
// only carries NEXT_PUBLIC_* — the defaults below apply. The
// authoritative reserve and charge always happen server-side, so an
// override can only make the browser preview conservative, never the
// charge wrong.
//
// FABLE CAVEATS (they shape the code, not just the choice): thinking is
// always on and must not be configured; `temperature` is rejected; its
// safety classifiers can decline a request with stop_reason "refusal"
// (HTTP 200), so every MAX call site must check stop_reason and fall
// back to PREMIUM — see callSiteRefusalFallback in MODELS.md — and
// settlement must price the model the RESPONSE names, never the one we
// asked for.

export const DEFAULT_MODEL_MAX = "claude-fable-5";
export const DEFAULT_MODEL_PREMIUM = "claude-opus-5";
export const DEFAULT_MODEL_STANDARD = "claude-sonnet-5";
export const DEFAULT_MODEL_FAST = "claude-haiku-4-5-20251001";

export type ModelTier = "max" | "premium" | "standard" | "fast";

const TIER_ENV_VARS: Record<ModelTier, string> = {
  max: "ANTHROPIC_MODEL_MAX",
  premium: "ANTHROPIC_MODEL_PREMIUM",
  standard: "ANTHROPIC_MODEL_STANDARD",
  fast: "ANTHROPIC_MODEL_FAST",
};

const TIER_DEFAULTS: Record<ModelTier, string> = {
  max: DEFAULT_MODEL_MAX,
  premium: DEFAULT_MODEL_PREMIUM,
  standard: DEFAULT_MODEL_STANDARD,
  fast: DEFAULT_MODEL_FAST,
};

export function modelForTier(
  tier: ModelTier,
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}
): string {
  const override = env[TIER_ENV_VARS[tier]]?.trim();
  return override || TIER_DEFAULTS[tier];
}

/** The tier a model id belongs to, for receipts and reporting. Resolved
 *  against the DEFAULTS (not env) so a historical cost-log row keeps its
 *  meaning even after an override changes; an overridden model id simply
 *  reports null and the receipt shows nothing special. */
export function tierForModel(model: string | null | undefined): ModelTier | null {
  if (!model) return null;
  for (const tier of Object.keys(TIER_DEFAULTS) as ModelTier[]) {
    if (TIER_DEFAULTS[tier] === model) return tier;
  }
  // Anthropic sometimes returns dated variants of an alias; match on the
  // alias prefix so "claude-opus-5-<date>" still reads as premium.
  for (const tier of Object.keys(TIER_DEFAULTS) as ModelTier[]) {
    if (model.startsWith(TIER_DEFAULTS[tier])) return tier;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dynamic selection — the ONE place complexity routing lives.
//
// Two features genuinely span the range from trivial to very hard, and
// paying Fable prices for "a simple landing page for my bakery" wastes
// the user's credits, while giving Opus a 6000-character multi-section
// brief with five reference images produces a visibly weaker site than
// Fable would. The thresholds below are the routing rule, stated once,
// tested in scripts/tests/model-coverage.test.mjs, and shared by the
// server (which calls the model) and the browser (which prices the
// estimate) so the preview can never price a different model than the
// call uses.
// ---------------------------------------------------------------------------

/** A brief longer than this reads as a specification, not a request —
 *  multiple sections, content requirements, style constraints. That is
 *  the shape where the strongest model's planning shows. */
export const WEBSITE_COMPLEX_DESCRIPTION_CHARS = 2500;
/** Each reference image is a constraint the layout must honour; three or
 *  more means the user is art-directing, which is complex work. */
export const WEBSITE_COMPLEX_IMAGE_COUNT = 3;

export function selectWebsiteBuilderModel(input: {
  descriptionChars: number;
  imageCount: number;
}): { model: string; tier: "max" | "premium" } {
  const complex =
    input.descriptionChars > WEBSITE_COMPLEX_DESCRIPTION_CHARS ||
    input.imageCount >= WEBSITE_COMPLEX_IMAGE_COUNT;
  return complex
    ? { model: modelForTier("max"), tier: "max" }
    : { model: modelForTier("premium"), tier: "premium" };
}

/** A goal longer than this carries constraints, sub-goals and context —
 *  the multi-step decomposition where the strongest planner earns its
 *  price. Short goals ("learn Spanish") plan equally well on PREMIUM. */
export const MISSION_COMPLEX_GOAL_CHARS = 600;

export function selectMissionPlannerModel(input: { goalChars: number }): {
  model: string;
  tier: "max" | "premium";
} {
  const complex = input.goalChars > MISSION_COMPLEX_GOAL_CHARS;
  return complex
    ? { model: modelForTier("max"), tier: "max" }
    : { model: modelForTier("premium"), tier: "premium" };
}
