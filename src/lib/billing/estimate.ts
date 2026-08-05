import { pricingForModel, WEB_SEARCH_USD_PER_QUERY } from "@/lib/billing/model-pricing";
import { creditsForRealCostOnRate, reserveAmount, usdToEur } from "@/lib/billing/credit-formula";
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
  /**
   * Extra "continue where you left off" rounds the action may need when a
   * single call's output ceiling isn't enough (Website Builder allows
   * MAX_CONTINUATION_ROUNDS = 2, see lib/website-builder.ts).
   *
   * These are not free repeats of the first call — each round re-sends
   * everything written so far as INPUT, so the input cost grows with each
   * round while the output is split across them. Ignoring them is what
   * made the first version of this estimator hold far less than the
   * generation went on to cost, which defeats the point of reserving.
   */
  continuationRounds?: number;
};

export type CostEstimate = {
  estimatedUsd: number;
  estimatedCredits: number;
  /** estimatedCredits plus the configured buffer — what gets held. */
  reserveCredits: number;
};

export function estimateActionCost(
  input: EstimateInput,
  config: PricingConfig,
  // What a credit is worth for THIS account (plan rate, or the cheapest
  // credit-pack rate they bought — see effectiveCreditPriceEurForAccount).
  // Settlement divides the real cost by this, so the estimate has to as
  // well: dividing by the list price here while charging at the plan rate
  // made an Ultimate estimate read 61 credits for a generation that then
  // charged 658, and reserved far less than it went on to cost.
  effectiveCreditPriceEur?: number
): CostEstimate {
  const p = pricingForModel(input.model);

  const userInputTokens = Math.ceil(Math.max(0, input.inputChars) / CHARS_PER_TOKEN);
  const imageTokens = Math.max(0, input.imageCount ?? 0) * TOKENS_PER_REFERENCE_IMAGE;
  const outputTokens = Math.ceil(Math.max(0, input.expectedOutputChars) / CHARS_PER_TOKEN);

  const auxInput = (input.auxiliaryCalls ?? []).reduce((s, c) => s + Math.max(0, c.inputTokens), 0);
  const auxOutput = (input.auxiliaryCalls ?? []).reduce((s, c) => s + Math.max(0, c.outputTokens), 0);

  const firstCallInputTokens =
    userInputTokens + imageTokens + Math.max(0, input.systemPromptTokens) + auxInput;

  // Continuation rounds. Round k re-sends the first call's input PLUS
  // everything generated so far, and the output is split across the
  // rounds. Modelling the extra input as (round share of the output)
  // accumulating is what makes a large generation's estimate track the
  // real cost instead of pricing it as though it were a single call.
  const rounds = Math.max(0, Math.floor(input.continuationRounds ?? 0));
  let continuationInputTokens = 0;
  if (rounds > 0) {
    const perRoundOutput = outputTokens / (rounds + 1);
    for (let k = 1; k <= rounds; k++) {
      continuationInputTokens += firstCallInputTokens + perRoundOutput * k;
    }
  }

  const totalInputTokens = firstCallInputTokens + Math.ceil(continuationInputTokens);
  const totalOutputTokens = outputTokens + auxOutput;

  const estimatedUsd =
    (totalInputTokens / 1_000_000) * p.inputPerMTok +
    (totalOutputTokens / 1_000_000) * p.outputPerMTok +
    Math.max(0, input.expectedWebSearches ?? 0) * WEB_SEARCH_USD_PER_QUERY;

  const estimatedCredits = creditsForRealCostOnRate(
    usdToEur(estimatedUsd, config),
    effectiveCreditPriceEur ?? config.creditPriceEur,
    config
  );

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
    // Generated single-file sites in this app run ~20k-60k characters,
    // and a detailed description reliably lands at the top of that range
    // rather than the bottom. The earlier low-end figures made the RESERVE
    // smaller than what settlement then charged — measured at 22 held vs
    // 26 charged on a simple site and 61 held vs 264 charged on a complex
    // one — which is precisely the case a hold exists to prevent. Sized
    // from the upper end instead: over-holding costs the user nothing
    // (the remainder is released at settlement), under-holding lets a
    // balance go negative.
    baseOutputChars: 34000,
    outputCharsPerInputChar: 9,
    // MAX_CONTINUATION_ROUNDS in lib/website-builder.ts.
    continuationRounds: 2,
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
  // Create Studio's type detection: one small forced-tool-use call that
  // returns a type, a title and a one-sentence restatement — nothing
  // longer. No auxiliary calls, because the restatement it produces IS
  // the clarification step (the user sees it and can edit it before
  // anything is created), so the separate clarification pre-check the
  // other entry points run would be asking the same question twice.
  createStudioDetect: {
    systemPromptTokens: 700,
    auxiliaryCalls: [],
    baseOutputChars: 400,
    outputCharsPerInputChar: 0,
  },
  // Creating an automation makes exactly one AI call — the clarifying-
  // questions pre-check (see api/automations/create/route.ts). The row
  // itself is written without a model call, and every future RUN is
  // charged separately by the cron. Modelling it as anything bigger would
  // quote the user for work this action does not do.
  automationCreate: {
    systemPromptTokens: 0,
    auxiliaryCalls: [{ inputTokens: 700, outputTokens: 150 }],
    baseOutputChars: 0,
    outputCharsPerInputChar: 0,
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
  config: PricingConfig,
  effectiveCreditPriceEur?: number
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
      continuationRounds: "continuationRounds" in profile ? profile.continuationRounds : 0,
    },
    config,
    effectiveCreditPriceEur
  );
}
