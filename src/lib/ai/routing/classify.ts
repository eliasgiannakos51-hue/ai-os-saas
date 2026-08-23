import { type Tier } from "@/lib/ai/routing/tiers";

/**
 * WHICH TIER, DECIDED WITHOUT A MODEL CALL WHERE POSSIBLE (V4 #35).
 *
 * DETERMINISTIC RULES FIRST. A classifier that itself needs a model call
 * costs money and latency on EVERY request in order to save money on
 * some of them, and at the cheap end it costs more than it saves: a
 * trivial request is worth a fraction of a cent, and asking a model
 * which tier it belongs to doubles the round trips to find that out.
 *
 * So the rules below decide first, from the FEATURE (which the caller
 * already knows) and from cheap, local properties of the request. Only
 * when nothing matches does `needsClassifier` come back true, and the
 * caller may then spend a small call on it — or take the default, which
 * is deliberately the safe direction.
 *
 * WHEN IN DOUBT, GO UP. An under-routed request produces a bad answer the
 * user paid for; an over-routed one costs us a fraction of a cent. Those
 * are not symmetric, and every default here leans on the expensive side.
 *
 * Pure, and measured: the build gate asserts the whole decision runs in
 * well under the 50ms budget the brief sets.
 */

export type ClassifyInput = {
  /** The settlement feature string, e.g. "chat_message", "agent_run". */
  feature: string;
  /** The user's text, if there is any. Length and shape are signals. */
  text?: string;
  /** Tokens of system prefix. A large prefix means the work is big
   *  whatever the user's sentence looks like. */
  systemTokens?: number;
  /** True when the caller needs parseable structure back. Structured
   *  output is where weak models fail in the way that costs a retry. */
  structured?: boolean;
  /** True when the answer will be acted on without a human reading it
   *  first — a scheduled agent, an automation step. */
  unattended?: boolean;
};

export type Classification = {
  tier: Tier;
  /** Which rule decided, so a routing dashboard can show WHY rather than
   *  just what. An unexplained routing decision cannot be tuned. */
  rule: string;
  /** True when no deterministic rule applied and the caller may spend a
   *  model call to decide. The tier returned is still usable — it is the
   *  safe default, not a placeholder. */
  needsClassifier: boolean;
};

/**
 * Features whose tier is a property of the feature itself, not of the
 * request. These are the cases where a rule beats any classifier: the
 * caller already knows it is generating a website, and no amount of
 * looking at the sentence changes that.
 */
export const FEATURE_TIERS: Record<string, Tier> = {
  // Expert: long, structured, expensive to get wrong, and the output is
  // the product rather than a step toward it.
  website_generate: "expert",
  deep_research: "expert",
  agent_build: "expert",
  mission_plan: "expert",

  // Complex: real reasoning, but bounded and usually reviewed.
  chat_message: "complex",
  agent_run: "complex",
  data_analyse: "complex",
  code_assist: "complex",
  website_edit: "complex",
  research_plan: "complex",
  file_ask: "complex",
  record_ask: "complex",
  weekly_reflection: "complex",

  // Simple: short, well-specified, one right answer.
  create_studio_detect: "simple",
  create_precheck: "simple",
  import_map: "simple",
  text_action: "simple",
  insight_narrate: "simple",

  // Trivial: mechanical transforms where a strong model is pure waste.
  agent_template_fill: "trivial",
};

const LONG_TEXT_CHARS = 4_000;
const HUGE_PREFIX_TOKENS = 8_000;

export function classify(input: ClassifyInput): Classification {
  const text = input.text ?? "";

  // 1. THE FEATURE, WHERE IT DECIDES. Cheapest possible rule and the one
  //    that covers most traffic.
  const byFeature = FEATURE_TIERS[input.feature];

  // 2. UNATTENDED WORK NEVER RUNS TRIVIAL. Nobody is going to read a bad
  //    answer and try again — it goes straight into a report, an email or
  //    a database row, and the mistake is discovered later or never.
  if (input.unattended && (byFeature === "trivial" || byFeature === "simple")) {
    return { tier: "complex", rule: "unattended:floor-complex", needsClassifier: false };
  }

  // 3. A BIG PREFIX IS BIG WORK. Eight thousand tokens of context is not
  //    a trivial request however short the question is, and a weak model
  //    with a large context is where the quiet wrong answers come from.
  if ((input.systemTokens ?? 0) >= HUGE_PREFIX_TOKENS) {
    return { tier: byFeature === "expert" ? "expert" : "complex", rule: "prefix:large", needsClassifier: false };
  }

  // 4. LONG INPUT IS COMPLEX INPUT, unless the feature already says more.
  if (text.length >= LONG_TEXT_CHARS) {
    return { tier: byFeature === "expert" ? "expert" : "complex", rule: "text:long", needsClassifier: false };
  }

  if (byFeature) {
    // 5. STRUCTURED OUTPUT LIFTS THE FLOOR. Malformed JSON is the failure
    //    that costs a whole second call, so the saving from the cheapest
    //    rung is illusory exactly where structure is required.
    if (input.structured && byFeature === "trivial") {
      return { tier: "simple", rule: "structured:floor-simple", needsClassifier: false };
    }
    return { tier: byFeature, rule: `feature:${input.feature}`, needsClassifier: false };
  }

  // 6. NOTHING MATCHED. The caller may spend a classifier call — and
  //    until it does, the answer is `complex`, not `trivial`. An unknown
  //    feature routed to the weakest model is a silent quality cut on
  //    whatever ships next.
  return { tier: "complex", rule: "default:unknown-feature", needsClassifier: true };
}
