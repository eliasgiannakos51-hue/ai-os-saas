import { pricingForModel, WEB_SEARCH_USD_PER_QUERY } from "@/lib/billing/model-pricing";
import { creditsForRealCostUsd, reserveAmount } from "@/lib/billing/credit-formula";
import type { PricingConfig } from "@/lib/billing/pricing-config";

// Pre-action cost estimation, in the same units the settlement uses, so
// the number shown before submit and the number actually charged are
// directly comparable.
//
// The estimate exists for two jobs: showing the user what they are about
// to spend, and deciding how much to reserve. It is NOT what gets
// charged — settlement always uses measured usage. That split is the
// whole point: an estimate can be wrong without costing anyone anything,
// because the difference is released.
//
// Every estimate is built from the same primitive — a token count — so
// bigger inputs mechanically produce bigger estimates. There is no
// per-feature flat number anywhere in this file.

// ~4 characters per token for English prose. Real tokenisation varies by
// content, which is exactly why this feeds an ESTIMATE and never a
// charge.
export const CHARS_PER_TOKEN = 4;

// A standard-resolution vision block. Anthropic's own guidance is
// roughly (width x height) / 750 tokens, capped around 1600 for a
// full-size image; 1600 is used so the estimate leans high rather than
// low, since an under-estimate is what would produce a failed reserve
// mid-action.
export const TOKENS_PER_REFERENCE_IMAGE = 1600;

export type EstimateInput = {
  model: string;
  /** Characters of user-supplied text (description, goal, message). */
  inputChars: number;
  /** Fixed prompt overhead: system prompt, context blocks, tool schemas. */
  systemPromptTokens: number;
  /** Reference/attachment images sent to vision. */
  imageCount?: number;
  /** Expected characters of generated output. */
  expectedOutputChars: number;
  /** Extra AI calls this action always makes (clarification check,
   *  classifier, security review...), each with its own rough token cost. */
  auxiliaryCalls?: { inputTokens: number; outputTokens: number }[];
  /** Web searches the model may run, if the tool is wired in. */
  expectedWebSearches?: number;
};

export type CostEstimate = {
  estimatedUsd: number;
  estimatedCredits: number;
  /** estimatedCredits plus the configured buffer — what gets held. */
  reserveCredits: number;
};

export function estimateActionCost(input: EstimateInput, config: PricingConfig): CostEstimate {
  const p = pricingForModel(input.model);

  const userInputTokens = Math.ceil(Math.max(0, input.inputChars) / CHARS_PER_TOKEN);
  const imageTokens = Math.max(0, input.imageCount ?? 0) * TOKENS_PER_REFERENCE_IMAGE;
  const outputTokens = Math.ceil(Math.max(0, input.expectedOutputChars) / CHARS_PER_TOKEN);

  const auxInput = (input.auxiliaryCalls ?? []).reduce((s, c) => s + Math.max(0, c.inputTokens), 0);
  const auxOutput = (input.auxiliaryCalls ?? []).reduce((s, c) => s + Math.max(0, c.outputTokens), 0);

  const totalInputTokens =
    userInputTokens + imageTokens + Math.max(0, input.systemPromptTokens) + auxInput;
  const totalOutputTokens = outputTokens + auxOutput;

  const estimatedUsd =
    (totalInputTokens / 1_000_000) * p.inputPerMTok +
    (totalOutputTokens / 1_000_000) * p.outputPerMTok +
    Math.max(0, input.expectedWebSearches ?? 0) * WEB_SEARCH_USD_PER_QUERY;

  const estimatedCredits = creditsForRealCostUsd(estimatedUsd, config);

  return {
    estimatedUsd,
    estimatedCredits,
    reserveCredits: reserveAmount(estimatedCredits, config),
  };
}

// Per-feature shapes. These describe the STRUCTURE of each action (how
// many auxiliary calls it makes, how big its system prompt is) — not a
// price. The price still comes from the token maths above, so a bigger
// request is always more expensive within every profile.
//
// System prompt sizes are measured, not guessed: the Website Builder's
// composed prompt is ~12,000 characters (see the 14/14 prompt-coverage
// check in this session), i.e. ~3,000 tokens.
export const ACTION_PROFILES = {
  websiteGenerate: {
    systemPromptTokens: 3000,
    // clarification pre-check + off-topic classifier + AI security review
    auxiliaryCalls: [
      { inputTokens: 700, outputTokens: 150 },
      { inputTokens: 500, outputTokens: 80 },
      { inputTokens: 4000, outputTokens: 300 },
    ],
    // Generated single-file sites in this app run ~20k-60k characters.
    // The estimate uses the low end and scales with description length,
    // since settlement corrects it either way.
    baseOutputChars: 22000,
    outputCharsPerInputChar: 6,
  },
  websiteEdit: {
    systemPromptTokens: 2900,
    auxiliaryCalls: [{ inputTokens: 4000, outputTokens: 300 }],
    baseOutputChars: 4000,
    outputCharsPerInputChar: 3,
  },
  chatMessage: {
    systemPromptTokens: 1000,
    auxiliaryCalls: [],
    baseOutputChars: 2000,
    outputCharsPerInputChar: 2,
  },
  createAnything: {
    systemPromptTokens: 1200,
    auxiliaryCalls: [{ inputTokens: 700, outputTokens: 150 }],
    baseOutputChars: 800,
    outputCharsPerInputChar: 1,
  },
  missionPlan: {
    systemPromptTokens: 700,
    auxiliaryCalls: [{ inputTokens: 700, outputTokens: 150 }],
    baseOutputChars: 900,
    outputCharsPerInputChar: 1,
  },
} as const;

export type ActionProfileKey = keyof typeof ACTION_PROFILES;

/**
 * Convenience wrapper: estimate a known action from its user input size
 * alone. Used by both the client (to display the estimate) and the server
 * (to size the reservation), so the two can never disagree.
 */
export function estimateForAction(
  action: ActionProfileKey,
  params: { model: string; inputChars: number; imageCount?: number; expectedWebSearches?: number },
  config: PricingConfig
): CostEstimate {
  const profile = ACTION_PROFILES[action];
  return estimateActionCost(
    {
      model: params.model,
      inputChars: params.inputChars,
      imageCount: params.imageCount,
      systemPromptTokens: profile.systemPromptTokens,
      auxiliaryCalls: [...profile.auxiliaryCalls],
      expectedOutputChars:
        profile.baseOutputChars + params.inputChars * profile.outputCharsPerInputChar,
      expectedWebSearches: params.expectedWebSearches,
    },
    config
  );
}
