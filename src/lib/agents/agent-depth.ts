import { AGENT_BUILDER_MODEL } from "@/lib/agents/agent-models";

/**
 * HOW HARD AN AGENT WORKS, and what that costs.
 *
 * Every agent used to run identically: one Sonnet research call with a
 * cap of four searches, one Sonnet write. That is the right shape for a
 * competitor watch and the wrong shape at both ends — "what did the euro
 * close at" is paying for four searches it does not need, and "give me a
 * full picture of the UK heat-pump grant landscape" is being answered
 * from four.
 *
 * So there are three, and they differ in the four things that actually
 * decide cost and quality: THE MODEL, HOW MANY SEARCHES, HOW MANY
 * RESEARCH PASSES, and HOW LONG THE ANSWER MAY BE.
 *
 * PURE AND CLIENT-SAFE, deliberately. The picker in the browser shows a
 * credit figure per tier, and that figure has to be produced by the same
 * numbers the server prices and runs against. A second copy of "deep
 * means ten searches" in a component is how the estimate starts pricing
 * a tier the runner no longer runs.
 */

export const AGENT_DEPTHS = ["simple", "standard", "deep"] as const;
export type AgentDepth = (typeof AGENT_DEPTHS)[number];

export function isAgentDepth(value: unknown): value is AgentDepth {
  return typeof value === "string" && (AGENT_DEPTHS as readonly string[]).includes(value);
}

/**
 * What an agent with no depth recorded is.
 *
 * STANDARD, and it has to be: every agent that existed before this
 * workstream ran with Sonnet, four searches, one research pass and a
 * 3,000-token answer, which is exactly the standard tier. Defaulting to
 * anything else would silently change what those agents do and what they
 * cost, on a schedule, without anybody asking for it.
 */
export const DEFAULT_AGENT_DEPTH: AgentDepth = "standard";

export function parseAgentDepth(value: unknown): AgentDepth {
  return isAgentDepth(value) ? value : DEFAULT_AGENT_DEPTH;
}

export type AgentDepthSpec = {
  /** The model this tier runs on. Haiku -> Sonnet -> Opus. */
  model: string;
  /** How many model calls one run makes, at most: the research passes
   *  plus the one that writes the answer. This is the "steps" a user
   *  sees, and it is derived from researchRounds rather than typed
   *  beside it, so the two cannot disagree. */
  researchRounds: number;
  /** Total web searches across every research pass. Anthropic bills
   *  these per query, so this is the single biggest lever on price. */
  maxSearches: number;
  /** max_tokens for a research pass. */
  researchTokens: number;
  /** How much of a research pass's text is carried into the write call. */
  researchChars: number;
  /** max_tokens for the call that writes the result. */
  outputTokens: number;
};

/**
 * THE TIERS, and every number in them is a real cap the runner applies —
 * none is tuned to hit a price. The prices in the report were computed
 * FROM these, not the other way round.
 */
export const AGENT_DEPTH_SPECS: Record<AgentDepth, AgentDepthSpec> = {
  // One search, a small model, a short answer. For a question with one
  // right answer that changes daily.
  simple: {
    model: "claude-haiku-4-5",
    researchRounds: 1,
    maxSearches: 1,
    researchTokens: 1500,
    researchChars: 3000,
    outputTokens: 1500,
  },
  // EXACTLY WHAT EVERY AGENT DID BEFORE THIS EXISTED. Sonnet, four
  // searches, one research pass, 3,000 output tokens. Stated here rather
  // than "unchanged" in a comment somewhere, because it is what makes
  // the default safe for the agents already running.
  standard: {
    model: "claude-sonnet-4-6",
    researchRounds: 1,
    maxSearches: 4,
    researchTokens: 1500,
    researchChars: 6000,
    outputTokens: 3000,
  },
  // TWO research passes, not one longer one. The second pass is given
  // what the first found and asked to fill the gaps — which is the thing
  // a single pass with a bigger search budget does not do: it broadens
  // instead of following up.
  deep: {
    model: "claude-opus-4-5",
    researchRounds: 2,
    maxSearches: 10,
    researchTokens: 2500,
    researchChars: 12000,
    outputTokens: 4000,
  },
};

/** Model calls per run: one per research pass, plus the write. A run
 *  with needsWebSearch off makes only the write call, which is why this
 *  takes the flag rather than assuming it. */
export function agentMaxSteps(depth: AgentDepth, needsWebSearch: boolean): number {
  return (needsWebSearch ? AGENT_DEPTH_SPECS[depth].researchRounds : 0) + 1;
}

/** Sources a run may consult. Zero when the agent does not search — a
 *  tier's "10 sources" is a ceiling, not a promise. */
export function agentMaxSources(depth: AgentDepth, needsWebSearch: boolean): number {
  return needsWebSearch ? AGENT_DEPTH_SPECS[depth].maxSearches : 0;
}

/**
 * Searches allowed in one particular research pass.
 *
 * Divided across the passes rather than handed to each in full: `deep`
 * has ten searches TOTAL, and giving both passes ten would double the
 * most expensive line in the run against an estimate sized for ten. The
 * first pass gets the larger half, because a follow-up pass has a
 * narrower job.
 */
export function searchesForRound(depth: AgentDepth, round: number): number {
  const spec = AGENT_DEPTH_SPECS[depth];
  if (spec.researchRounds <= 1) return spec.maxSearches;
  const perRound = Math.floor(spec.maxSearches / spec.researchRounds);
  const remainder = spec.maxSearches - perRound * spec.researchRounds;
  // Round 0 absorbs the remainder, so the total is exactly maxSearches.
  return round === 0 ? perRound + remainder : perRound;
}

/** Roughly how long a run takes, in seconds, for the UI to say something
 *  truthful about waiting. A range rather than a figure, because it is
 *  dominated by how long the searches take. */
export const AGENT_DEPTH_SECONDS: Record<AgentDepth, [number, number]> = {
  simple: [10, 25],
  standard: [25, 60],
  deep: [60, 180],
};

/**
 * THE SUGGESTION, when the builder did not make one.
 *
 * The builder model is asked for a depth and usually gives one (see
 * agent-builder.ts). This is the fallback for a malformed answer, for an
 * agent created before the field existed, and for the pre-check the
 * create screen runs before any model call has happened.
 *
 * DELIBERATELY CONSERVATIVE IN THE EXPENSIVE DIRECTION. It never
 * suggests `deep` — a heuristic over keywords is not evidence that
 * somebody wants to spend twelve times as much on every run, forever,
 * and the user can choose it in one click. It suggests `simple` only
 * when the task plainly has one answer, and `standard` otherwise.
 */
const SIMPLE_SIGNALS = [
  "price", "τιμή", "precio", "prix", "preis", "prezzo", "preço",
  "rate", "ισοτιμία", "weather", "καιρός", "clima", "météo", "wetter",
  "score", "σκορ", "headline", "τίτλο", "one line", "μία γραμμή",
  "quick", "γρήγορ", "rápido", "schnell", "veloce",
];
const DEEP_SIGNALS = [
  "landscape", "τοπίο", "in depth", "σε βάθος", "comprehensive", "εκτενή",
  "full report", "πλήρη αναφορά", "analysis of", "ανάλυση", "compare all",
  "market research", "έρευνα αγοράς", "competitors", "ανταγωνιστ",
];

export type DepthSuggestion = { depth: AgentDepth; reason: "simple_signal" | "deep_signal" | "default" };

/**
 * `text` is the user's own request plus the task prompt; `fold` is the
 * caller's case/accent folding function so this module stays free of any
 * import that is not pure (see lib/text/unicode-patterns.ts).
 */
export function suggestAgentDepth(text: string, fold: (s: string) => string): DepthSuggestion {
  const folded = fold(text);
  const hasDeep = DEEP_SIGNALS.some((signal) => folded.includes(fold(signal)));
  // DEEP SIGNALS ARE CHECKED FIRST AND STILL DO NOT PRODUCE `deep`. A
  // request that says "in depth" gets `standard` — the tier that can
  // answer most things — and the user is shown `deep` beside it with its
  // price. Suggesting the 12x tier from a keyword is how a heuristic
  // spends somebody's month.
  if (hasDeep) return { depth: "standard", reason: "deep_signal" };
  if (SIMPLE_SIGNALS.some((signal) => folded.includes(fold(signal)))) {
    return { depth: "simple", reason: "simple_signal" };
  }
  return { depth: DEFAULT_AGENT_DEPTH, reason: "default" };
}

/**
 * The model used to fill a TEMPLATE's slots (see #22 and
 * lib/agents/agent-templates.ts).
 *
 * The smallest one, because the job is small: take the user's sentence
 * and a task pattern with a {subject} slot in it, and return the subject
 * plus a name in the user's language. A tenth of the work the full
 * builder does, on a model that costs a third as much — which is what
 * makes adopting a template cheap rather than merely feeling cheap.
 */
export const TEMPLATE_FILL_MODEL = "claude-haiku-4-5";

/** Re-exported so a component pricing "build a new agent" beside "use
 *  this template" prices both from one import. */
export { AGENT_BUILDER_MODEL };
