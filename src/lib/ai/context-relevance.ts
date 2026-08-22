import { foldForMatch } from "@/lib/text/unicode-patterns";

/**
 * SENDING LESS CONTEXT, WITHOUT LOSING THE THING THAT MAKES IT USEFUL.
 *
 * WHAT THIS IS FOR. Measured with scripts/measure-context.mjs, the AI
 * Life Context is 4,817 characters on every chat message — every module
 * the user has ever written in, whatever they asked about. Asking about
 * a sales pipeline ships the trading journal too.
 *
 * AND WHY IT IS OFF BY DEFAULT. The value of a cross-module assistant IS
 * the cross-module part: the answer that notices a competitor note while
 * you are asking about pricing. Narrowing the context is the one change
 * in this workstream that can make an answer WORSE, and quality has not
 * been measured — that needs an ANTHROPIC_API_KEY this environment does
 * not have, and the brief's own rule is to revert on a >10% drop. A
 * quality change shipped on the strength of a token count is a
 * regression nobody is looking for.
 *
 * So this is built, tested and wired, and DEFAULT_SELECTION_CONFIG.enabled
 * is false. scripts/context-quality.mjs is the harness that decides
 * whether it may be turned on.
 *
 * EVERY RULE HERE FAILS TOWARDS SENDING MORE. A question it cannot judge,
 * a question nothing matches, a match that would drop too much — all of
 * them return everything. "If in doubt, send it" is not a comment on this
 * file, it is the only branch that has no conditions on it.
 */

export type ModuleVocabulary = {
  slug: string;
  /** Every word that means this module, in every language the app
   *  speaks — its title and its field labels, from the message
   *  catalogues. */
  terms: string[];
};

export type SelectionConfig = {
  /** OFF until quality is measured. See the file comment. */
  enabled: boolean;
  /** Never send fewer than this many modules, however narrow the
   *  question looks. A question that mentions one module is still asked
   *  by somebody whose business is all of them. */
  minKeep: number;
  /** Never drop more than this share of what there is. A rule that can
   *  remove nine modules out of ten is a rule that will. */
  maxDropShare: number;
  /** Below this many characters a question carries too little to judge
   *  — "what should I do today?" is not about one module. */
  minQuestionChars: number;
};

export const DEFAULT_SELECTION_CONFIG: SelectionConfig = {
  enabled: false,
  minKeep: 6,
  maxDropShare: 0.5,
  minQuestionChars: 25,
};

export function resolveSelectionConfig(): SelectionConfig {
  const d = DEFAULT_SELECTION_CONFIG;
  // The flag is opt-IN and spelled positively: an unset variable, an
  // empty one and a typo all mean "send everything", which is the
  // behaviour that cannot be a regression.
  const enabled = (process.env.CONTEXT_RELEVANCE ?? "").trim().toLowerCase() === "on";
  return { ...d, enabled };
}

export type Selection<T> = {
  keep: T[];
  droppedSlugs: string[];
  mode: "all" | "narrowed";
  /** Why, in words, for the log and for a test to assert on. */
  reason: string;
};

/**
 * Which of a user's modules this question is about.
 *
 * `summaries` are matched to `vocabulary` by slug; anything with no
 * vocabulary entry is never dropped, because "we have no words for this
 * module" is not evidence that the question is not about it.
 */
export function selectRelevantModules<T extends { slug: string; lastActivityMs?: number | null }>(
  question: string,
  summaries: T[],
  vocabulary: ModuleVocabulary[],
  config: SelectionConfig = DEFAULT_SELECTION_CONFIG
): Selection<T> {
  const all = (reason: string): Selection<T> => ({
    keep: summaries,
    droppedSlugs: [],
    mode: "all",
    reason,
  });

  if (!config.enabled) return all("relevance selection is off");
  if (summaries.length === 0) return all("nothing to select from");
  // THE FLOOR IS DERIVED, not a second constant that can disagree with
  // the first.
  //
  // With minKeep 6 and maxDropShare 0.5 over thirteen modules, the rule
  // could never fire: filling to six means dropping seven, and seven of
  // thirteen is over half, so every narrowing was refused by the cap that
  // was supposed to bound it. A feature whose two thresholds contradict
  // each other is inert, and it looks exactly like a feature that is
  // simply cautious — which is how it survived a first read.
  const floor = Math.max(config.minKeep, Math.ceil(summaries.length * (1 - config.maxDropShare)));
  if (summaries.length <= floor) return all("already at or under the floor");

  const q = foldForMatch(question ?? "");
  if (q.length < config.minQuestionChars) return all("question too short to judge");

  const words = new Set(q.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3));
  if (words.size === 0) return all("no words to match on");

  const byslug = new Map(vocabulary.map((v) => [v.slug, v]));
  const scored = summaries.map((s) => {
    const vocab = byslug.get(s.slug);
    // NO VOCABULARY IS NOT A ZERO SCORE. A module we have no words for
    // cannot be judged, so it is treated as matched rather than as
    // irrelevant — the difference between "we did not find it" and "it
    // is not there".
    if (!vocab) return { item: s, score: 1, unjudgeable: true };
    let score = 0;
    for (const term of vocab.terms) {
      const folded = foldForMatch(term);
      if (folded.length < 3) continue;
      // Whole words only. A substring test makes "art" match "start"
      // and every module matches every question.
      if (words.has(folded)) score += 1;
      else if (folded.includes(" ") && q.includes(folded)) score += 1;
    }
    return { item: s, score, unjudgeable: false };
  });

  const matched = scored.filter((s) => s.score > 0);
  if (matched.length === 0) return all("nothing matched the question");
  if (matched.length === summaries.length) return all("every module matched");

  // FILL UP TO THE FLOOR BY RECENT ACTIVITY, not by list order.
  //
  // The first version filled in the order the modules arrive, which is
  // the order of a config array — so a question about SALES kept the
  // trading journal and dropped products and feedback, purely because
  // "trading" is declared earlier. That is not relevance, it is
  // alphabetical luck wearing the word "relevant".
  //
  // Recency is a real signal and it is already measured: a module the
  // user wrote in this morning is likelier to matter to any question
  // than one they have not touched since March. It does not make the
  // choice SEMANTIC — a daily trader asking about sales still keeps
  // their trading module, and that is the right answer under this
  // brief's own rule rather than a failure of it.
  const keep = [...matched];
  if (keep.length < floor) {
    const rest = scored
      .filter((s) => !keep.includes(s))
      .sort((a, b) => (b.item.lastActivityMs ?? -1) - (a.item.lastActivityMs ?? -1));
    for (const s of rest) {
      if (keep.length >= floor) break;
      keep.push(s);
    }
  }

  // THE CAP IS ENFORCED BY THE FLOOR, not by a second check after the
  // fact. Once `floor` is derived from maxDropShare, the number dropped
  // is at most `summaries.length - floor`, which is at most
  // `maxDropShare * summaries.length` by construction — so a check here
  // could never fire. It was there, and it was dead code that read as a
  // safety net; a mutation run removing it changed nothing, which is how
  // it was found.
  const dropped = scored.filter((s) => !keep.includes(s));

  // Preserve the caller's order, so the prompt reads the same way it
  // always did minus some entries, rather than re-sorted by a score the
  // model never sees.
  const kept = new Set(keep.map((k) => k.item));
  return {
    keep: summaries.filter((s) => kept.has(s)),
    droppedSlugs: dropped.map((d) => d.item.slug),
    mode: "narrowed",
    reason: `${matched.length} module(s) matched the question`,
  };
}

/**
 * The words that mean each module, in every language the app speaks.
 *
 * BUILT FROM THE MESSAGE CATALOGUES, not from a hand-written keyword
 * list. A second list is a second thing to keep in step with the first,
 * and the failure — a module renamed in the UI while the matcher still
 * looks for the old word — is silent: the module simply stops being
 * recognised and quietly falls out of every narrowed context.
 *
 * Titles AND field labels, because a question rarely uses the module's
 * name. "How much did I charge for that?" is about Finance because of
 * "amount", not because of the word "finance".
 */
export function buildModuleVocabulary(
  modules: { slug: string; titleKey: string; fields?: { labelKey: string }[] }[],
  catalogues: Record<string, unknown>[]
): ModuleVocabulary[] {
  const lookup = (catalogue: Record<string, unknown>, key: string): string => {
    let node: unknown = catalogue;
    for (const part of key.split(".")) {
      if (!node || typeof node !== "object") return "";
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === "string" ? node : "";
  };

  return modules.map((m) => {
    const terms = new Set<string>([m.slug]);
    for (const catalogue of catalogues) {
      const title = lookup(catalogue, m.titleKey);
      if (title) for (const word of title.split(/[^\p{L}\p{N}]+/u)) if (word.length >= 3) terms.add(word);
      for (const field of m.fields ?? []) {
        const label = lookup(catalogue, field.labelKey);
        if (label) for (const word of label.split(/[^\p{L}\p{N}]+/u)) if (word.length >= 3) terms.add(word);
      }
    }
    return { slug: m.slug, terms: [...terms] };
  });
}
