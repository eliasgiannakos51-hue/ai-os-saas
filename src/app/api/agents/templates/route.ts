import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { MIN_MATCH_SCORE } from "@/lib/agents/agent-templates";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_QUERY = 300;
const MAX_RESULTS = 5;

/**
 * "I FOUND ONE THAT ALREADY DOES THIS."
 *
 * Called as the user types their request on the create screen, BEFORE
 * anything is built and before anything is charged. It costs no AI call
 * at all: the ranking is Postgres full-text over the template library
 * (see the 20260826 migration).
 *
 * NOT SEMANTIC MATCHING, and this route does not claim to be. Embeddings
 * are not in the product yet; this ranks by word overlap on a folded,
 * accent-blind form, so a Greek user's "ανταγωνιστες" reaches a template
 * whose keywords include "ανταγωνιστής". A near-miss returns nothing,
 * which is the right answer — "we found one that does this" has to be
 * true or the offer is worse than no offer.
 *
 * READ THROUGH THE CALLER'S OWN CLIENT. match_agent_templates is SECURITY
 * INVOKER and the select policy is what scopes it.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    // Below this a match is a coincidence. Returning nothing is not a
    // failure: "build a new one" is always the other option and is never
    // withheld.
    if (q.length < 3) return NextResponse.json({ ok: true, matches: [] });

    const { data, error } = await supabase.rpc("match_agent_templates", {
      p_query: q,
      p_limit: MAX_RESULTS,
    });
    if (error) throw error;

    const matches = ((data ?? []) as Record<string, unknown>[])
      .map((row) => ({
        slug: String(row.slug ?? ""),
        title: String(row.title ?? ""),
        description: String(row.description ?? ""),
        taskPattern: String(row.task_pattern ?? ""),
        scheduleCron: String(row.schedule_cron ?? ""),
        depth: String(row.depth ?? "standard"),
        needsWebSearch: row.needs_web_search === true,
        outputFormat: String(row.output_format ?? "summary"),
        useCount: Number(row.use_count ?? 0),
        rank: Number(row.rank ?? 0),
      }))
      .filter((m) => m.slug.length > 0);

    return NextResponse.json({ ok: true, matches, minScore: MIN_MATCH_SCORE });
  } catch (err) {
    logApiError("/api/agents/templates", err);
    // An empty list, not a 500. A broken library must not stop somebody
    // building an agent — the "build a new one" path does not depend on
    // this route having worked.
    return NextResponse.json({ ok: true, matches: [] });
  }
}
