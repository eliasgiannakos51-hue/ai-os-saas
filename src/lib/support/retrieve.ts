import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { rankArticles, type HelpArticle } from "@/lib/support/rank";

// The query half of retrieval. The scoring lives in rank.ts — see its
// header for why the two are separate files.

export type { HelpArticle };
export { rankArticles, MAX_ARTICLES, scoreArticle, tokenise } from "@/lib/support/rank";

/**
 * Loads the published corpus and returns the best matches.
 *
 * Returns [] on any failure. An empty corpus means the assistant has
 * nothing to answer from, and the route then escalates rather than
 * answering from the model's own idea of what Ionexa is — which is the
 * single worst failure mode this whole feature has.
 */
export async function findRelevantArticles(question: string): Promise<HelpArticle[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("help_articles")
      .select("id, slug, title, body, category, keywords")
      .eq("is_published", true)
      .limit(200);
    if (error) {
      logApiError("support:retrieve", error);
      return [];
    }
    return rankArticles((data as HelpArticle[] | null) ?? [], question);
  } catch (err) {
    logApiError("support:retrieve", err);
    return [];
  }
}
