// Which help articles a question should be answered from — the ranking
// itself, with no database in it.
//
// KEYWORD MATCHING, ON PURPOSE. This corpus is a dozen articles, not a
// million documents. A keyword score over a dozen rows is instant, needs
// no vector extension, and — the part that matters here — is explainable:
// when the assistant answers from the wrong article, you can see exactly
// which word put it there. Embeddings would buy recall this corpus does
// not need and cost the ability to debug a wrong answer.
//
// Split from retrieve.ts (which does the query) so the ranking can be
// exercised in the BUILD GATE. scripts/tests/*.test.mjs may not touch
// node_modules, and @supabase/supabase-js is node_modules — a scoring
// function that can only be tested by a suite that runs after the build
// is a scoring function that is not really tested.

export type HelpArticle = {
  id: string;
  slug: string;
  title: string;
  body: string;
  category: string;
  keywords: string[];
};

/** How many articles go into one answer. Enough to cover a two-part
 *  question, few enough that the grounding text stays readable. */
export const MAX_ARTICLES = 4;

// Words that match everything and therefore discriminate nothing. Kept
// short and English-plus-Greek because those are the two languages the
// question is most likely to arrive in; an unlisted stop word only costs a
// little scoring noise, never a wrong answer.
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "to", "of", "in", "on",
  "for", "with", "how", "what", "why", "when", "where", "do", "does", "did", "can", "could", "i",
  "you", "my", "me", "it", "this", "that", "there", "have", "has", "get", "got", "if", "about",
  "από", "και", "για", "με", "να", "το", "τα", "τη", "την", "του", "της", "των", "στο", "στη",
  "είναι", "πώς", "πως", "τι", "γιατί", "μπορώ", "μου",
]);

export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Scores one article against one question.
 *
 * A hit in `keywords` is worth more than a hit in the body, because the
 * keyword list is the deliberate "this article is about X" statement and
 * the body inevitably mentions half the product in passing. The title sits
 * between the two.
 *
 * Exported so the test suite can pin the ranking rather than assert on a
 * live database.
 */
export function scoreArticle(article: HelpArticle, questionTokens: string[]): number {
  if (questionTokens.length === 0) return 0;
  const keywordBlob = article.keywords.join(" ").toLowerCase();
  const titleBlob = article.title.toLowerCase();
  const bodyBlob = article.body.toLowerCase();

  let score = 0;
  for (const token of questionTokens) {
    if (keywordBlob.includes(token)) score += 5;
    if (titleBlob.includes(token)) score += 3;
    if (bodyBlob.includes(token)) score += 1;
  }
  return score;
}

export function rankArticles(articles: HelpArticle[], question: string): HelpArticle[] {
  const tokens = tokenise(question);
  return articles
    .map((article) => ({ article, score: scoreArticle(article, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.article.slug.localeCompare(b.article.slug))
    .slice(0, MAX_ARTICLES)
    .map((r) => r.article);
}
