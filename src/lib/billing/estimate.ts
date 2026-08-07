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
    // The memory-extraction call that follows every reply when chat
    // memory is on (lib/chat/memory.ts). It reads the user message plus
    // the whole assistant reply and writes a sentence or two. It is now
    // settled as part of the same turn, so the hold has to cover it —
    // otherwise the reservation is short by exactly one Claude call on
    // every message.
    auxiliaryCalls: [{ inputTokens: 1200, outputTokens: 60 }],
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
    systemPromptTokens: 1400,
    auxiliaryCalls: [
      // clarification pre-check
      { inputTokens: 700, outputTokens: 150 },
      // the Research Agent pass that now runs before planning (see
      // lib/mission-agents.ts's researchGoal) — its own prompt plus the
      // search results it reads back. The searches themselves are priced
      // separately via expectedWebSearches at the call site, since
      // Anthropic bills those per query rather than per token.
      { inputTokens: 3000, outputTokens: 400 },
    ],
    // Steps carry an outcome, a time estimate and up to 4 sub-steps each
    // now, so a plan is several times the text it used to be.
    baseOutputChars: 2600,
    outputCharsPerInputChar: 2,
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
  // Building an autonomous agent from one sentence (api/agents/build) —
  // the clarifying-questions pre-check plus one forced-tool-use call that
  // returns the configuration. Small and bounded: the tool schema caps
  // what can come back, so the output does not scale with the request the
  // way a generation does.
  agentBuild: {
    systemPromptTokens: 1400,
    auxiliaryCalls: [{ inputTokens: 700, outputTokens: 150 }],
    baseOutputChars: 900,
    outputCharsPerInputChar: 1,
  },
  // ONE execution of an agent (api/cron/agent-runs, api/agents/[id]/run).
  //
  // The auxiliary call is the research pass — modelled unconditionally
  // even though it only runs for agents with needsWebSearch, because this
  // profile sizes a RESERVATION and a hold that is too small is the one
  // failure mode a hold exists to prevent. The searches themselves are
  // priced separately through expectedWebSearches at the call site, since
  // Anthropic bills those per query rather than per token. The unused
  // remainder is released at settlement, so over-holding costs the user
  // nothing.
  agentRun: {
    systemPromptTokens: 800,
    auxiliaryCalls: [{ inputTokens: 900, outputTokens: 900 }],
    // MAX_OUTPUT_TOKENS in lib/agents/agent-runner.ts is 3,000 — ~12,000
    // characters. Sized at the ceiling rather than the typical briefing
    // for the same reason as websiteGenerate's baseOutputChars.
    baseOutputChars: 12000,
    outputCharsPerInputChar: 2,
  },
  // Ask AI about a record (api/records/ask). The user's question is
  // short; the INPUT is dominated by the record itself, which the route
  // serialises in full and passes as inputChars. That is exactly why a
  // flat 1-credit charge was wrong here — the price has to track the
  // size of the thing being asked about, and a large record is an order
  // of magnitude more input than a chat message.
  recordAsk: {
    systemPromptTokens: 900,
    auxiliaryCalls: [],
    baseOutputChars: 1200,
    outputCharsPerInputChar: 1,
  },
  // Rewrite/expand/summarise a piece of text (api/text-actions). Output
  // scales with input almost 1:1 — "expand this" can return more than it
  // was given, so the ratio is deliberately not below 1.
  textAction: {
    systemPromptTokens: 400,
    auxiliaryCalls: [],
    baseOutputChars: 400,
    outputCharsPerInputChar: 2,
  },
  // Weekly Reflection (api/reflection/generate). The input is a whole
  // week of the user's activity, assembled by the route, so like
  // recordAsk it is the context and not the prompt that sets the cost.
  weeklyReflection: {
    systemPromptTokens: 1200,
    auxiliaryCalls: [],
    baseOutputChars: 3000,
    outputCharsPerInputChar: 1,
  },
  // Ask my documents (api/files/ask). Like recordAsk, the question is
  // short and the INPUT is everything — the route passes the selected
  // documents' text as inputChars, and a 200-page contract is three
  // orders of magnitude more input than the question about it. This is
  // the profile where a flat price would be most obviously wrong.
  fileAsk: {
    systemPromptTokens: 700,
    auxiliaryCalls: [],
    baseOutputChars: 1500,
    // The answer does NOT grow with the documents — a question about a
    // 300-page manual has the same length answer as one about a memo.
    // Charging output proportional to input here would quote a user
    // hundreds of credits for a two-sentence reply.
    outputCharsPerInputChar: 0,
  },
  // One Deep Research run (api/research/process). The most expensive
  // single action in the product, and the only one whose estimate has to
  // be shown and confirmed before it starts.
  //
  // The shape: one planning call, then one call PER research question
  // that runs web searches, then one synthesis call over everything the
  // searches returned. The per-question calls are modelled as auxiliary
  // calls at the CEILING number of questions, not the typical one,
  // because this profile sizes a hold — and RESEARCH_MAX_QUESTIONS in
  // lib/research/research.ts is 6.
  deepResearch: {
    systemPromptTokens: 1600,
    auxiliaryCalls: [
      // Planning: small in, a list of questions out.
      { inputTokens: 900, outputTokens: 600 },
      // Six research passes. Each re-sends the topic and gets back a
      // summary of what its searches found; the searches themselves are
      // priced separately per query through expectedWebSearches, since
      // Anthropic bills those per search rather than per token.
      { inputTokens: 1500, outputTokens: 2500 },
      { inputTokens: 1500, outputTokens: 2500 },
      { inputTokens: 1500, outputTokens: 2500 },
      { inputTokens: 1500, outputTokens: 2500 },
      { inputTokens: 1500, outputTokens: 2500 },
      { inputTokens: 1500, outputTokens: 2500 },
    ],
    // The synthesis call's own output: a full report.
    baseOutputChars: 16000,
    outputCharsPerInputChar: 1,
  },
  // Generating one presentation (api/presentations).
  //
  // Two real calls plus the shared clarifying-questions pre-check:
  // a fact-finding pass with web search on, then one forced-tool call
  // that returns the whole deck as a structure. The searches themselves
  // are priced per query through expectedWebSearches at the call site.
  //
  // baseOutputChars is deliberately the FLOOR here, not the ceiling,
  // because the real output scales with the requested slide count and
  // that is not an input this function sees — estimateForPresentation
  // below adds the per-slide part. Calling estimateForAction with this
  // profile directly would under-hold every deck longer than the
  // minimum, so nothing does.
  presentationGenerate: {
    systemPromptTokens: 1200,
    auxiliaryCalls: [
      // Clarifying-questions pre-check.
      { inputTokens: 700, outputTokens: 150 },
      // The fact-finding pass: the brief in, sourced material out.
      { inputTokens: 1200, outputTokens: 2000 },
    ],
    baseOutputChars: 1500,
    outputCharsPerInputChar: 2,
  },
  // One AI edit of an existing deck (api/presentations/[id]/edit).
  //
  // The expensive half is the INPUT: the instruction is a sentence, and
  // the whole deck is re-sent with it. The route passes the deck's
  // character count as inputChars for exactly that reason. Output is
  // roughly the deck again, since an edit returns every slide.
  presentationEdit: {
    systemPromptTokens: 900,
    auxiliaryCalls: [],
    baseOutputChars: 800,
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

/**
 * Estimate one presentation generation.
 *
 * Its own function rather than an `estimateForAction` call because the
 * output of this action scales with something no other action has: the
 * number of slides asked for. A 30-slide deck is six times the generated
 * text of a 5-slide one, and pricing both from the same profile would
 * either quote the short deck for work it does not do or hold too little
 * for the long one — and a hold that is too small is the single failure
 * reserve/settle exists to prevent.
 *
 * CHARS_PER_SLIDE is measured against the tool schema this feature
 * actually uses (lib/presentations/slides.ts): a title up to 120 chars,
 * up to 8 bullets of up to 240, and up to 1,500 characters of speaker
 * notes, plus the JSON scaffolding around them. A full slide at those
 * ceilings is ~3,600 characters; real ones land near half that. 1,800 is
 * the working figure, and it leans toward the upper end for the same
 * reason websiteGenerate's does — over-holding is released at settlement
 * and costs the user nothing.
 *
 * Shared by the browser (to show the price before the user commits) and
 * the route (to size the reservation), so the two cannot disagree.
 */
export const CHARS_PER_SLIDE = 1800;

export function estimateForPresentation(
  params: { model: string; briefChars: number; slideCount: number; expectedWebSearches?: number },
  config: PricingConfig,
  effectiveCreditPriceEur?: number
): CostEstimate {
  const profile = ACTION_PROFILES.presentationGenerate;
  const slides = Math.max(0, params.slideCount);

  return estimateActionCost(
    {
      model: params.model,
      inputChars: params.briefChars,
      systemPromptTokens: profile.systemPromptTokens,
      auxiliaryCalls: [...profile.auxiliaryCalls],
      expectedOutputChars:
        profile.baseOutputChars +
        params.briefChars * profile.outputCharsPerInputChar +
        slides * CHARS_PER_SLIDE,
      expectedWebSearches: params.expectedWebSearches,
    },
    config,
    effectiveCreditPriceEur
  );
}
