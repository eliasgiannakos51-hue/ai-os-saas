import { KNOWLEDGE_BASE, type KnowledgeArticle } from "@/lib/support/knowledge-base";

/**
 * The article behind a screen's "?".
 *
 * The 27 articles in the knowledge base already answer the questions people
 * ask, and they are already rendered — on /help, which is a separate page
 * you have to know exists, leave the thing you were doing, and come back
 * from. Somebody stuck on the Agents screen wondering what an agent even
 * is does not go looking for a help centre. They leave.
 *
 * So the article comes to them: one paragraph, behind a "?" next to the
 * page title, from the SAME source /help and the support bot answer from.
 * One source, three surfaces — a help page, a bot and a tooltip that
 * disagree about the same question is worse than having only one of them.
 *
 * WHY THERE IS NO PATH -> ARTICLE MAP HERE. There was one, for about an
 * hour: a `PAGE_HELP` record listing every route and its article. It was a
 * second copy of a mapping the pages already express by passing
 * `helpArticleId` to PageHeader, and it went stale immediately — it named
 * three screens that render no help button at all. A registry nothing
 * reads is not documentation, it is a claim that happens to be false, and
 * it is the same defect class this audit was looking for elsewhere.
 *
 * The pages are the mapping. scripts/tests/canned-wiring.test.mjs checks
 * that every id they pass resolves to a real article, so a typo or a
 * deleted article fails a build instead of rendering nothing.
 */
export function helpArticle(id: string | undefined): KnowledgeArticle | null {
  if (!id) return null;
  return KNOWLEDGE_BASE.find((a) => a.id === id) ?? null;
}
