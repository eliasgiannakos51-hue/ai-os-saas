import { KNOWLEDGE_BASE, type KnowledgeArticle } from "@/lib/support/knowledge-base";

/**
 * Which help article belongs to which screen.
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
 * disagree about the same question is worse than having only one of them,
 * and that is what happens the moment the text is copied.
 *
 * Not every screen is here. A screen with no article gets no "?" rather
 * than an invented paragraph — an empty answer is better than a made-up
 * one, and the gap is visible in this map instead of hidden in prose.
 */
export const PAGE_HELP: Record<string, string> = {
  "/dashboard/agents": "create-agent",
  "/dashboard/website-builder": "create-website",
  "/dashboard/published": "publish-website",
  "/dashboard/mission": "create-mission",
  "/dashboard/files": "upload-files",
  "/dashboard/integrations": "connect-gmail",
  "/dashboard/chat": "chat-memory",
  "/dashboard/memory": "chat-memory",
  "/dashboard/team": "team-members",
  "/dashboard/settings": "export-data",
  "/dashboard/overview": "what-is-ionexa",
  "/onboarding": "what-is-ionexa",
};

export function helpArticle(id: string | undefined): KnowledgeArticle | null {
  if (!id) return null;
  return KNOWLEDGE_BASE.find((a) => a.id === id) ?? null;
}

export function helpArticleForPath(pathname: string): KnowledgeArticle | null {
  return helpArticle(PAGE_HELP[pathname]);
}
