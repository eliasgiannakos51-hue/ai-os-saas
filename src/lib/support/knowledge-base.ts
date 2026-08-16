// The questions that do not need a model.
//
// A large share of support traffic is the same handful of questions with
// stable, factual answers: what does it cost, how do I cancel, what are
// credits, how do I make a website. Every one of those currently costs a
// full Claude call — reserve, stream, settle, log — to reproduce a
// sentence that has not changed in months. That is the cheapest cost line
// in the product to remove, because removing it makes the answer BETTER:
// a fixed answer cannot hallucinate a price.
//
// TWO RULES THIS FILE EXISTS TO ENFORCE.
//
// 1. NO NUMBERS THAT MOVE. Not one answer states a price, a credit cost,
//    an allowance or a plan limit. Those live in lib/billing/plans.ts and
//    on /pricing, they change, and a stale number in a canned answer is
//    worse than no answer at all — it is a quote the user will hold us
//    to. Every money question routes to /pricing instead. The test
//    enforces this with a digit scan, so it cannot rot.
//
// 2. NOTHING PERSONAL. A canned answer is identical for every user, so it
//    may only ever answer a question about the PRODUCT. "How many credits
//    do I have left" looks like a FAQ and is not one — it is a question
//    about this account, and it must reach the real path. See
//    isAccountSpecific().

/**
 * The parts of an article the MATCHER needs, and nothing else.
 *
 * Declared here rather than imported from help-articles.ts on purpose.
 * That module is `server-only` and reaches the database; this one is
 * pure string arithmetic with no I/O, which is what lets it be tested
 * directly. Importing the row type would drag a Supabase client into
 * every consumer of a scoring function, and would make the matcher
 * untestable without a database — the tail wagging the dog.
 *
 * HelpArticle satisfies this structurally, so loadCannedArticles() rows
 * can be passed straight in with no adapter and no cast.
 */
export type KnowledgeArticle = {
  slug: string;
  locale: string;
  title: string;
  body: string;
  category: string;
  triggers: string[];
  href: string | null;
};


export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Questions that LOOK like FAQs but are about this account.
 *
 * "How many credits does a website cost" is a product question with one
 * true answer. "How many credits do I have left" is the same words plus a
 * first person, and answering it from a fixed string would be a lie. Any
 * possessive or first-person marker disqualifies the message outright —
 * the canned path is not allowed to guess about a specific user.
 */
const ACCOUNT_SPECIFIC_MARKERS = [
  "μου", "εχω", "ειμαι", "εγω", "εμενα", "δικο μου", "δικα μου", "μας",
  "χρεωθηκα", "πληρωσα", "αγορασα", "εφτιαξα", "εκανα",
  "my", "i have", "i am", "i was", "me", "mine", "my account", "my credits",
];

export function isAccountSpecific(message: string): boolean {
  const n = normalize(message);
  return ACCOUNT_SPECIFIC_MARKERS.some((m) => n.includes(normalize(m)));
}

export type CannedMatch = {
  article: KnowledgeArticle;
  confidence: number;
};

const CONFIDENCE_THRESHOLD = 0.85;

/**
 * Best canned answer for a message, or null to fall through to the model.
 *
 * Scoring is deliberately conservative. A trigger only counts when it
 * appears as a whole phrase, and confidence is scaled by how much of the
 * message the trigger accounts for — so "πόσο κοστίζει;" scores high while
 * a 300-word message that happens to contain "τιμή" somewhere does not.
 * Anything under 0.85 goes to the model, because a wrong canned answer is
 * far more expensive than the call it saved.
 */
/**
 * THE LANGUAGE GUARD IS GONE, AND THAT IS THE FIX.
 *
 * There used to be `CANNED_ANSWER_LOCALE = "el"` here and a
 * `if (locale !== CANNED_ANSWER_LOCALE) return null` at the top of the
 * matcher. It was correct, and it was a workaround: there was exactly one
 * set of articles and they were all Greek, so every other language had to
 * be refused wholesale — a real answer withheld from nine locales to
 * avoid answering them in the wrong one.
 *
 * The articles have a locale column now and the caller passes the rows
 * for the user's own language, so the constraint is structural rather
 * than a check that can be forgotten: a French message is matched only
 * against French triggers, because French triggers are the only ones in
 * scope. Locales that have no articles yet match nothing and fall through
 * to the model, exactly as before.
 */

export function matchCannedAnswer(
  message: string,
  /**
   * The articles for THIS USER'S LANGUAGE, and nothing else.
   *
   * REQUIRED, and deliberately in second position: every existing call
   * site had to be edited to compile, so the language cannot be forgotten
   * by a caller that predates this argument.
   *
   * This used to be `locale: string` guarded by
   * `if (locale !== CANNED_ANSWER_LOCALE) return null` — a whole language
   * check standing in for the fact that there was only ever one set of
   * articles, in Greek. Passing the articles instead makes the guarantee
   * structural: a French caller loads French rows
   * (loadCannedArticles("fr")), so there is no Greek trigger in scope for
   * a French message to match against. An empty array matches nothing and
   * falls through to the model, which is the safe direction and what a
   * locale with no articles should do.
   */
  articles: readonly KnowledgeArticle[],
  threshold: number = CONFIDENCE_THRESHOLD
): CannedMatch | null {
  const n = normalize(message);
  if (!n) return null;
  // A long message is a conversation, not a lookup.
  if (n.split(" ").length > 40) return null;
  if (isAccountSpecific(message)) return null;

  let best: CannedMatch | null = null;

  for (const article of articles) {
    for (const trigger of article.triggers) {
      const t = normalize(trigger);
      if (!t || !n.includes(t)) continue;

      // How much of what the user wrote is this trigger? A short question
      // that IS the trigger scores 1; a long one scores proportionally
      // less. Multi-word triggers get a bonus: "πως ακυρωνω" is a much
      // stronger signal than "τιμη".
      const coverage = t.length / n.length;
      const specificity = Math.min(1, t.split(" ").length / 2);
      const confidence = Math.min(1, coverage * 0.75 + specificity * 0.45);

      if (!best || confidence > best.confidence) {
        best = { article, confidence: Number(confidence.toFixed(4)) };
      }
    }
  }

  return best && best.confidence >= threshold ? best : null;
}

/** Groups articles for /help. Takes what it is given rather than reading
 *  a global, because "which articles" is now a question with an answer
 *  that depends on the reader's language. */
// Generic, so a caller holding full rows gets full rows back. Narrowing
// to the matcher's subset here would strip `isFallback` on the way
// through — which /help needs precisely to say that an article is the
// English stand-in.
export function articlesByCategory<T extends KnowledgeArticle>(
  articles: readonly T[]
): Map<string, T[]> {
  const byCat = new Map<string, T[]>();
  for (const a of articles) {
    const list = byCat.get(a.category) ?? [];
    list.push(a);
    byCat.set(a.category, list);
  }
  return byCat;
}
