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

export type ModuleNarrowing<T> = {
  keep: T[];
  droppedSlugs: string[];
  mode: "all" | "narrowed";
  /** Why, in words, for the log and for a test to assert on. */
  reason: string;
};

/**
 * THE TWO SCORING PRIMITIVES, EXPORTED — because there is now a second
 * caller and there must not be a second implementation.
 *
 * Module selection asks "which of thirteen modules is this question
 * about". Cross-module context (V4 #36) asks "which of fifty past coding
 * sessions is this question about". Different policies — different
 * floors, different caps, different consequences for getting it wrong —
 * but IDENTICAL matching: fold, split into words of three characters or
 * more, count whole-word hits.
 *
 * Copying those four lines into the second caller is how the two drift:
 * a folding fix applied in one place, a minimum length changed in the
 * other, and two features that claim to use "the same relevance rule"
 * quietly stop agreeing. So the rule lives here once and the policies
 * live with their callers.
 */

/** The words of a question worth matching on. `question` must ALREADY be
 *  folded — the caller folds once and reuses it, because folding is the
 *  expensive part and doing it per candidate is doing it fifty times. */
export function questionWords(foldedQuestion: string): Set<string> {
  return new Set(foldedQuestion.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3));
}

/**
 * How many of `terms` this question mentions.
 *
 * WHOLE WORDS ONLY. A substring test makes "art" match "start", and then
 * every candidate matches every question and the whole mechanism is a
 * slower way of selecting everything. Multi-word terms are the one
 * exception and are matched against the folded question directly,
 * because "cash flow" cannot be found in a set of single words.
 */
export function scoreTerms(
  words: ReadonlySet<string>,
  foldedQuestion: string,
  terms: readonly string[]
): number {
  // EACH DISTINCT WORD COUNTS ONCE. The vocabulary is built from a
  // module's title AND its field labels, and those overlap: Sales carries
  // both "sales" (the slug) and "Sales" (the title), which fold to the
  // same word. Counting both gave Sales a 2 for a question containing the
  // word once, and "compare my sales and my finance numbers" — a question
  // about two modules, scoring one hit each — came out as a clear 2-1
  // winner for Sales. A tie broken by a duplicate is not a tie broken by
  // evidence.
  const counted = new Set<string>();
  let score = 0;
  for (const term of terms) {
    const folded = foldForMatch(term);
    if (folded.length < 3) continue;
    if (counted.has(folded)) continue;
    if (words.has(folded)) {
      counted.add(folded);
      score += 1;
    } else if (folded.includes(" ") && foldedQuestion.includes(folded)) {
      counted.add(folded);
      score += 1;
    }
  }
  return score;
}

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
): ModuleNarrowing<T> {
  const all = (reason: string): ModuleNarrowing<T> => ({
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

  const words = questionWords(q);
  if (words.size === 0) return all("no words to match on");

  const byslug = new Map(vocabulary.map((v) => [v.slug, v]));
  const scored = summaries.map((s) => {
    const vocab = byslug.get(s.slug);
    // NO VOCABULARY IS NOT A ZERO SCORE. A module we have no words for
    // cannot be judged, so it is treated as matched rather than as
    // irrelevant — the difference between "we did not find it" and "it
    // is not there".
    if (!vocab) return { item: s, score: 1, unjudgeable: true };
    return { item: s, score: scoreTerms(words, q, vocab.terms), unjudgeable: false };
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
/**
 * Words that appear in field labels and mean nothing about which module a
 * question is about. They are dropped even when only one module uses
 * them, because "next" is not evidence about Sales however few other
 * modules happen to have a "Next Steps" field.
 */
const GENERIC_LABEL_WORDS = new Set(
  [
    "next", "steps", "step", "follow", "email", "name", "type", "date", "status",
    "notes", "note", "score", "value", "link", "url", "title", "other", "more",
    "size", "first", "last", "description", "summary", "category", "priority",
    "details", "detail", "text", "content", "list", "item", "items",
    "επομενα", "βηματα", "βημα", "ονομα", "ειδος", "τυπος", "ημερομηνια",
    "κατασταση", "σημειωσεις", "βαθμολογια", "αξια", "πρωτο", "τελευταιο",
    "περιγραφη", "συνοψη", "κατηγορια", "προτεραιοτητα", "λεπτομερειες",
    "κειμενο", "συνδεσμος", "παρακολουθησης",
    // THE PEOPLE WORDS. Competitors has a "Customers" field, so "πελάτες"
    // was a subject-weight term for Competitors and "Τι σχόλια έχω πάρει
    // από πελάτες;" — a question plainly about feedback — was read as a
    // question about competitors. A word that is true of Sales, Feedback,
    // Competitors and Products at once claims none of them. It survives
    // as an ASSOCIATED word for Sales (lib/ai/module-synonyms.ts), at
    // half weight, which is what it is actually worth.
    "customer", "customers", "client", "clients", "user", "users", "people",
    "πελατης", "πελατες", "πελατων", "πελατη", "χρηστης", "χρηστες", "ατομα",
    // Same shape: several modules have a "Company"/"Market" field.
    "company", "companies", "market", "εταιρεια", "εταιρειες", "αγορα",
  ].map((w) => foldForMatch(w))
);

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

  // TWO KINDS OF TERM, and they are not equally good evidence.
  //
  // STRONG: the module's slug and the words of its title. "finance",
  // "Οικονομικά" — a question containing one is about that module.
  //
  // WEAK: the words of its field labels. Free, plentiful, and where the
  // false matches come from, because a label is split into words and the
  // words are ordinary. Measured, before the two rules below existed:
  //   - Content's fields include a label containing "ideas", so "what
  //     ideas have I logged" scored Ideas 1 and Content 1 and the two
  //     tied — the question could not reach the module it names.
  //   - Sales has a "Next Steps" field, so "what should I do next?"
  //     scored Sales 1 and nothing else, and read the Sales module
  //     deeply for a question that is not about sales at all.
  // FOLDED FOR COMPARING, RAW FOR EMITTING. The collision rules below have
  // to compare "Πωλήσεις" with "πωλησεισ", so they work on folded forms —
  // but the terms this returns stay the words as the catalogue spells
  // them. Emitting the folded ones instead made every term unfindable in
  // the catalogue it came from, and the gate that checks no term is
  // invented went red on all thirteen modules. It was right to.
  const strong = new Map<string, Map<string, string>>();
  const weak = new Map<string, Map<string, string>>();
  for (const m of modules) {
    const st = new Map<string, string>([[foldForMatch(m.slug), m.slug]]);
    const wk = new Map<string, string>();
    for (const catalogue of catalogues) {
      const title = lookup(catalogue, m.titleKey);
      if (title) for (const w of title.split(/[^\p{L}\p{N}]+/u)) if (w.length >= 3) st.set(foldForMatch(w), w);
      for (const field of m.fields ?? []) {
        const label = lookup(catalogue, field.labelKey);
        if (label) for (const w of label.split(/[^\p{L}\p{N}]+/u)) if (w.length >= 3) wk.set(foldForMatch(w), w);
      }
    }
    strong.set(m.slug, st);
    weak.set(m.slug, wk);
  }

  // How many modules claim each weak word. A word two modules' fields
  // both use is evidence for neither.
  const weakClaims = new Map<string, number>();
  for (const wk of weak.values()) for (const folded of wk.keys()) weakClaims.set(folded, (weakClaims.get(folded) ?? 0) + 1);

  return modules.map((m) => {
    const st = strong.get(m.slug) ?? new Map<string, string>();
    const kept = new Map<string, string>(st);
    for (const [folded, raw] of weak.get(m.slug) ?? []) {
      if (st.has(folded)) continue;
      // Another module's own NAME. It belongs to that module, not to
      // whichever one happens to mention it in a field label.
      if ([...strong].some(([slug, other]) => slug !== m.slug && other.has(folded))) continue;
      // Claimed by more than one module's fields.
      if ((weakClaims.get(folded) ?? 0) > 1) continue;
      // Generic regardless of who claims it.
      if (GENERIC_LABEL_WORDS.has(folded)) continue;
      kept.set(folded, raw);
    }
    return { slug: m.slug, terms: [...kept.values()] };
  });
}
