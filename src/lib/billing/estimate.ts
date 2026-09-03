import { pricingForModel, WEB_SEARCH_USD_PER_QUERY } from "@/lib/billing/model-pricing";
import { creditsForRealCostOnRate, reserveAmount, usdToEur } from "@/lib/billing/credit-formula";
import { resolveMarginFor, ACTION_TO_FEATURE } from "@/lib/billing/margin-policy";
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
   * MAX_CONTINUATION_ROUNDS = 4, see lib/website-builder.ts).
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
  effectiveCreditPriceEur?: number,
  // The resolved per-feature/per-plan margin (lib/billing/margin-policy.ts).
  // Settlement multiplies the real cost by this, so the estimate has to as
  // well — a Free-plan action settles at 6x, and an estimate stuck on the
  // general 4x would reserve a third short on every one of them.
  marginMultiplier?: number
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
    config,
    marginMultiplier
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
    // MAX_CONTINUATION_ROUNDS in lib/website-builder.ts, which is 4 — and
    // its loop is `for (round = 0; round <= MAX_CONTINUATION_ROUNDS)`, so
    // one initial call plus up to FOUR continuations.
    //
    // This said 2, with a comment asserting MAX_CONTINUATION_ROUNDS was 2.
    // It has been 4. The hold was therefore short of what a full-length
    // generation can cost by a measured 26-32%, across every plan:
    //
    //   plan        input chars   held (2)   needed (4)   short by
    //   free               1200         87          114     27 (+31%)
    //   starter            1200         73           95     22 (+30%)
    //   pro                3000         74           95     21 (+28%)
    //
    // A hold that is short is not a smaller charge — settlement bills the
    // real usage either way. It is a balance that can go negative on the
    // longest generations, which is the one thing a reservation exists to
    // prevent, and the same failure the baseOutputChars note above this
    // was written to fix.
    //
    // The two numbers are kept in step by
    // scripts/tests/module-charges.test.mjs, which reads both files: a
    // comment claiming they agree is what let them disagree.
    continuationRounds: 4,
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
  // THREE PROFILES, ONE PER DEPTH TIER (lib/agents/agent-depth.ts).
  //
  // `agentRun` was one profile because every agent ran identically. It
  // still exists, unchanged, and is still what an agent with no depth
  // recorded is priced at — which is correct, because the standard tier
  // IS what those agents do.
  //
  // Each number below is read off the tier's real caps rather than
  // chosen: the auxiliary call is that tier's research pass at its
  // research-token ceiling, there is one per research round, and
  // baseOutputChars is the tier's output ceiling in characters
  // (outputTokens x CHARS_PER_TOKEN). A profile tuned to hit a price
  // instead would be a hold that does not cover what the run does.
  agentRun: {
    systemPromptTokens: 800,
    auxiliaryCalls: [{ inputTokens: 900, outputTokens: 900 }],
    // MAX_OUTPUT_TOKENS in lib/agents/agent-runner.ts is 3,000 — ~12,000
    // characters. Sized at the ceiling rather than the typical briefing
    // for the same reason as websiteGenerate's baseOutputChars.
    baseOutputChars: 12000,
    outputCharsPerInputChar: 2,
  },
  // simple: 1 research pass at 1,500 tokens, 1,500-token answer.
  agentRunSimple: {
    systemPromptTokens: 800,
    auxiliaryCalls: [{ inputTokens: 400, outputTokens: 1500 }],
    baseOutputChars: 6000,
    outputCharsPerInputChar: 2,
  },
  // standard: 1 research pass at 1,500 tokens, 3,000-token answer.
  agentRunStandard: {
    systemPromptTokens: 800,
    auxiliaryCalls: [{ inputTokens: 400, outputTokens: 1500 }],
    baseOutputChars: 12000,
    outputCharsPerInputChar: 2,
  },
  // deep: TWO research passes at 2,500 tokens each — the second is given
  // the first's findings, which is why its input allowance is larger —
  // and a 4,000-token answer.
  agentRunDeep: {
    systemPromptTokens: 1000,
    auxiliaryCalls: [
      { inputTokens: 600, outputTokens: 2500 },
      { inputTokens: 900, outputTokens: 2500 },
    ],
    baseOutputChars: 16000,
    outputCharsPerInputChar: 2,
  },
  // Filling a TEMPLATE's slots from the user's own sentence
  // (api/agents/templates/adopt). One small call on the smallest model:
  // read a request and a pattern, return the subject and a name. This is
  // what makes "use this one" genuinely cheaper than "build a new one"
  // rather than merely priced as if it were.
  agentTemplateFill: {
    systemPromptTokens: 500,
    auxiliaryCalls: [],
    baseOutputChars: 600,
    outputCharsPerInputChar: 0,
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
  // Downloading a document as a PDF in ANOTHER language
  // (api/documents/[id]/pdf?lang=). The input is the whole document's
  // HTML and the output is the same HTML translated, so output tracks
  // input at about one-to-one — a Chinese translation of a Greek text is
  // shorter in characters and longer in tokens, and 1.2 covers both. The
  // dialog quotes THIS estimate before the download, which is the whole
  // point: a translation charges, and it says the amount first.
  documentTranslate: {
    systemPromptTokens: 250,
    auxiliaryCalls: [],
    baseOutputChars: 200,
    outputCharsPerInputChar: 1.2,
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
  // Mapping a spreadsheet's columns (api/import/csv/analyse). The model
  // sees the HEADERS and a dozen sample rows, never the whole file, so
  // the input is bounded by the sample and not by the upload — a 5,000-
  // row file and a 20-row file cost the same to map, which is why this
  // profile does not scale with the file size.
  importMap: {
    systemPromptTokens: 1800,
    auxiliaryCalls: [],
    baseOutputChars: 1200,
    outputCharsPerInputChar: 0,
  },
  // Extracting entries from pasted text (api/import/paste). The output
  // genuinely scales with the input here — a longer business plan
  // contains more entries — so unlike the mapper this one is
  // proportional.
  importPaste: {
    systemPromptTokens: 1800,
    auxiliaryCalls: [],
    baseOutputChars: 800,
    outputCharsPerInputChar: 1,
  },
  // Phrasing findings the detectors already computed
  // (api/insights/generate). Small and bounded: the model is handed a
  // handful of facts and asked for grammar, so the cost is set by the
  // number of findings and not by how much data they were computed from.
  insightNarrate: {
    systemPromptTokens: 700,
    auxiliaryCalls: [],
    baseOutputChars: 1500,
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
  // Reading a dataset's PROFILE and saying what it means
  // (api/data-analysis/[id]/analyse). The model never sees a row — it is
  // handed the column types, the statistics and the correlations that
  // lib/data-analysis/profile.ts computed, plus a handful of sample rows
  // for flavour. So the input is bounded by the number of COLUMNS, not by
  // the size of the upload: a 50,000-row file and a 200-row file with the
  // same columns cost the same to analyse, which is the honest shape for
  // a price and the reason this profile does not scale with rows.
  dataAnalyse: {
    systemPromptTokens: 1600,
    auxiliaryCalls: [],
    baseOutputChars: 4000,
    outputCharsPerInputChar: 1,
  },
  // One question about a dataset (api/data-analysis/[id]/ask). The
  // question is short; the context is the profile again. The ANSWER does
  // not grow with the file — "which region sold most" is one sentence
  // whatever the row count — so output does not scale with input, for the
  // same reason fileAsk's does not.
  dataQuestion: {
    systemPromptTokens: 1400,
    auxiliaryCalls: [],
    baseOutputChars: 1200,
    outputCharsPerInputChar: 0,
  },
  // One coding operation (api/coding/run): generate, explain, find bugs,
  // convert or write tests.
  //
  // OUTPUT SCALES WITH INPUT ABOVE 1, and that is not padding. Two of the
  // five operations RE-EMIT the input: converting a file to another
  // language returns something the same size or larger, and "write tests
  // for this" reliably returns more code than it was given. A ratio at or
  // below 1 would under-reserve exactly the two operations people use on
  // their longest files.
  codeAssist: {
    systemPromptTokens: 1200,
    auxiliaryCalls: [],
    baseOutputChars: 1500,
    outputCharsPerInputChar: 2,
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
  params: {
    model: string;
    inputChars: number;
    imageCount?: number;
    expectedWebSearches?: number;
    /** The user's plan slug — lets the estimate resolve the same
     *  per-feature/per-plan margin the settlement will apply. Omitted,
     *  the estimate uses the general multiplier, which under-reserves on
     *  plans with a higher margin — so server call sites pass it. */
    planSlug?: string | null;
  },
  config: PricingConfig,
  effectiveCreditPriceEur?: number,
  marginMultiplier?: number
): CostEstimate {
  const profile = ACTION_PROFILES[action];
  const margin =
    marginMultiplier ??
    resolveMarginFor(ACTION_TO_FEATURE[action] ?? null, params.planSlug ?? null, config).margin;
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
    effectiveCreditPriceEur,
    margin
  );
}
