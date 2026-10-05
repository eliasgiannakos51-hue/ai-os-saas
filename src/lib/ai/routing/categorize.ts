import { classify, type ClassifyInput } from "@/lib/ai/routing/classify";
import { TIERS, type Tier } from "@/lib/ai/routing/tiers";

/**
 * KIND OF WORK, DIFFICULTY AND HOW SURE WE ARE (BUILD-SPECS 2.13 Α).
 *
 * classify.ts answers one question, "how strong a model", from the
 * feature. The router of 2.13 needs two more before it can pick the
 * cheapest model that passes the quality bar for THIS kind of work:
 *
 *   - the CATEGORY (chat, writing, code…), because a model can be cheap
 *     and good at translation and cheap and bad at code;
 *   - a CONFIDENCE, because a guess that is wrong in the cheap direction
 *     is a bad answer the user paid for. Below CONFIDENCE_FLOOR the tier
 *     goes up one, and that is the whole use of the number.
 *
 * RULES ONLY, NO MODEL CALL. The brief allows a small model "where
 * needed" and caps the classifier at 300 ms on simple requests. A model
 * call cannot meet that reliably and costs on every request; these rules
 * run in microseconds and cost nothing (scripts/tests/router-classify.test.mjs
 * measures it). Where the rules cannot tell, the answer is a LOW
 * confidence — never a guess presented as a certainty — and the tier
 * bump turns that doubt into the safe direction.
 *
 * Pure: no IO, no env, no clock.
 */

export const CATEGORIES = [
  "chat",
  "writing",
  "analysis",
  "code",
  "research",
  "image",
  "file",
  "translation",
  "summary",
  "extraction",
] as const;
export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

/** Below this, the tier goes up one rung (2.13 Α, scenario 3). */
export const CONFIDENCE_FLOOR = 0.6;

/**
 * Features whose category is a property of the feature. The caller
 * already knows it is translating a document; no reading of the
 * sentence changes that, so the confidence is 1.
 *
 * Every settlement feature string that can reach settleReservation
 * belongs here; one that is missing falls to "chat" at a confidence
 * under the floor, which is the safe direction, and the gate lists it.
 */
export const FEATURE_CATEGORIES: Record<string, Category> = {
  // A free-text box: the feature does not decide, the text does.
  chat_message: "chat",
  chat_free: "chat",
  chat_clarify: "chat",

  website_generate: "code",
  website_edit: "code",
  code_assist: "code",

  deep_research: "research",
  research_plan: "research",
  scheduled_agent_run: "research",
  agent_run: "research",
  agent_run_batch: "research",

  presentation_generate: "writing",
  presentation_edit: "writing",
  posts_generate: "writing",
  weekly_reflection: "writing",
  text_action: "writing",
  insight_narrate: "writing",
  mission_review: "writing",
  automation_run: "writing",
  agent_build: "writing",
  mission_plan: "writing",

  data_analysis: "analysis",
  data_analyse: "analysis",

  file_ask: "file",
  record_ask: "file",
  ask_ai_record: "file",

  document_translate: "translation",

  meeting_analyse: "summary",

  import_map: "extraction",
  import_paste: "extraction",
  lead_classification: "extraction",
  create_studio_detect: "extraction",
  create_precheck: "extraction",
  transition_detect: "extraction",
  clarification_check: "extraction",
  clarification_free: "extraction",
  website_generate_precheck: "extraction",
  create: "extraction",
  agent_build_precheck: "extraction",
  agent_template_fill: "extraction",
};

/**
 * The feature a settlement row is about, without the outcome suffix the
 * job runner appends (lib/jobs/run-job.ts: `${kind}_refunded`,
 * `${kind}_stopped`; agent runs: `agent_run_cannot_complete`). A stopped
 * chat is still a chat.
 */
export function baseFeature(feature: string): string {
  return feature.replace(/_(refunded|stopped|cannot_complete)$/, "");
}

/** Features where the text, not the feature, decides the category. */
const TEXT_DECIDES = new Set(["chat_message", "chat_free", "chat_clarify"]);

/**
 * Signals per category, Greek and English. Accents are stripped before
 * matching (normalize below), so the Greek patterns are written without
 * them. Each pattern is a WORD STEM, matched at a word start — "μεταφρ"
 * catches μετάφρασε, μετάφραση, μεταφράζεις.
 */
const SIGNALS: Record<Exclude<Category, "chat" | "file">, readonly string[]> = {
  translation: ["μεταφρ", "translat", "στα αγγλικα", "στα ελληνικα", "in english", "in greek", "into english", "into greek"],
  summary: ["συνοψ", "περιληψ", "summar", "tl;dr", "tldr", "σε λιγα λογια", "in short", "key points"],
  code: ["κωδικ", "function", "συναρτησ", "javascript", "typescript", "python", "sql", "regex", "bug", "error:", "stack trace", "compile", "debug", "script", "html", "css", "api"],
  analysis: ["αναλυσ", "analy", "συγκρινε", "compare", "τασεις", "trend", "στατιστ", "statistic", "ποσοστ", "percentage", "forecast", "προβλεψ"],
  research: ["ερευν", "research", "ψαξε", "βρες πηγες", "sources", "πηγες", "latest", "τελευται", "news", "ειδησ"],
  writing: ["γραψε", "write", "email", "μηνυμα για", "post", "αρθρο", "article", "κειμενο", "draft", "προσχεδι", "rewrite", "ξαναγραψ", "βελτιωσε", "improve"],
  extraction: ["εξαγ", "εξηγαγ", "σε λιστα", "into a list", "extract", "βγαλε λιστα", "list all", "pull out", "πινακα με", "table of", "json", "csv"],
  image: ["εικον", "image", "φωτογραφ", "photo", "λογοτυπ", "logo", "σχεδιασε", "draw"],
};

/** Lower-case, accents off, whitespace collapsed. The matching key. */
export function normalizeForRules(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hits(normalized: string, stems: readonly string[]): number {
  let n = 0;
  for (const stem of stems) {
    // A stem at the start of a word, or anywhere for the multi-word and
    // punctuated ones. "post" must not match "compost"; "error:" may.
    const plain = /^[\p{L}\p{N}]+$/u.test(stem);
    if (plain) {
      if (new RegExp(`(?:^|[^\\p{L}\\p{N}])${stem}`, "u").test(normalized)) n += 1;
    } else if (normalized.includes(stem)) {
      n += 1;
    }
  }
  return n;
}

export type CategoryGuess = { category: Category; confidence: number; rule: string };

export function categorize(input: { feature: string; text?: string }): CategoryGuess {
  const feature = baseFeature(input.feature);
  const byFeature = FEATURE_CATEGORIES[feature];
  if (byFeature && !TEXT_DECIDES.has(feature)) {
    return { category: byFeature, confidence: 1, rule: `feature:${feature}` };
  }

  const text = normalizeForRules(input.text ?? "");
  if (!byFeature) {
    // An unknown feature: fall to chat and say we are not sure. The gate
    // lists every settlement feature this map is missing.
    return { category: "chat", confidence: 0.4, rule: "default:unknown-feature" };
  }
  if (text.length === 0) {
    return { category: "chat", confidence: 0.5, rule: "text:empty" };
  }
  // A fenced block is code whatever the words around it say.
  if (/```/.test(input.text ?? "")) {
    return { category: "code", confidence: 0.9, rule: "text:code-fence" };
  }

  const scored = (Object.keys(SIGNALS) as Array<keyof typeof SIGNALS>)
    .map((category) => ({ category, n: hits(text, SIGNALS[category]) }))
    .filter((s) => s.n > 0)
    .sort((a, b) => b.n - a.n);

  if (scored.length === 0) {
    // Nothing that names a kind of work. A short line with no signal is a
    // conversation, and we are fairly sure of that; a long one with no
    // signal is a conversation we cannot read, and we say so.
    return text.length <= 200
      ? { category: "chat", confidence: 0.8, rule: "text:no-signal-short" }
      : { category: "chat", confidence: 0.5, rule: "text:no-signal-long" };
  }

  const [top, second] = scored;
  if (second && second.n === top.n) {
    // Two kinds of work, equally named: "translate and summarise this".
    // Either could be right; the doubt is what the number is for.
    return { category: top.category, confidence: 0.5, rule: `text:tie:${top.category}+${second.category}` };
  }
  const confidence = second ? 0.65 : top.n >= 2 ? 0.95 : 0.8;
  return { category: top.category, confidence, rule: `text:signal:${top.category}` };
}

export type RequestClass = {
  category: Category;
  tier: Tier;
  confidence: number;
  /** The rule that picked the category. */
  categoryRule: string;
  /** The rule that picked the tier, before any bump. */
  tierRule: string;
  /** True when low confidence moved the tier up one rung. */
  bumped: boolean;
};

const SHORT_SIMPLE_CHARS = 280;
/** The kinds of work a short, single request can be SIMPLE for. Code,
 *  analysis, research and images stay at the feature's tier however short
 *  the sentence: "why does this crash?" is short and not simple. */
const SHORT_SIMPLE_CATEGORIES: ReadonlySet<Category> = new Set(["chat", "translation", "writing", "extraction", "summary"]);

/**
 * Category, tier and confidence for one request.
 *
 * The tier comes from classify() — feature, length, prefix, structure,
 * unattended — and one refinement for the free-text features: a short,
 * single question with no sign of code or analysis is SIMPLE, not the
 * chat feature's blanket COMPLEX. Then the confidence floor: under it,
 * one rung up.
 */
export function classifyRequest(rawInput: ClassifyInput): RequestClass {
  const input = { ...rawInput, feature: baseFeature(rawInput.feature) };
  const base = classify(input);
  const guess = categorize({ feature: input.feature, text: input.text });

  let tier: Tier = base.tier;
  let tierRule = base.rule;
  const text = input.text ?? "";
  if (
    TEXT_DECIDES.has(input.feature) &&
    base.rule === `feature:${input.feature}` &&
    text.length > 0 &&
    text.length <= SHORT_SIMPLE_CHARS &&
    SHORT_SIMPLE_CATEGORIES.has(guess.category) &&
    !/```/.test(text) &&
    (text.match(/\?/g) ?? []).length <= 1
  ) {
    tier = "simple";
    tierRule = "text:short-single";
  }

  let confidence = guess.confidence;
  if (base.needsClassifier) confidence = Math.min(confidence, 0.4);

  let bumped = false;
  if (confidence < CONFIDENCE_FLOOR) {
    const i = TIERS.indexOf(tier);
    if (i < TIERS.length - 1) {
      tier = TIERS[i + 1];
      bumped = true;
    }
  }

  return { category: guess.category, tier, confidence, categoryRule: guess.rule, tierRule, bumped };
}
