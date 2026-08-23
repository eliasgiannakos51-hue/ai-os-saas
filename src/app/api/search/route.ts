import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import {
  isSearchKind,
  MAX_QUERY_LENGTH,
  MIN_QUERY_LENGTH,
  type SearchResult,
} from "@/lib/search/unified-search";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_RESULTS = 40;

/**
 * ONE ROUND TRIP.
 *
 * WHAT THIS REPLACES: one RPC per table, twenty-four of them, fanned out
 * on every keystroke, over the headline column only. No index could have
 * fixed that — the network does not care how quick each query is — and
 * it could not see a file's contents, a website, an agent, a mission or
 * a help article at all.
 *
 * Everything now lives in one indexed table (see the 20260824 migration)
 * and this asks it once. Ranking, grouping, filters and the preview
 * snippet all come out of that single call.
 *
 * READ THROUGH THE CALLER'S OWN CLIENT. search_all is SECURITY INVOKER
 * and the RLS policy on search_index is what scopes it; an admin client
 * here would mean re-implementing that check, and a search that gets it
 * wrong returns somebody else's data with a link to it.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);
    if (q.length < MIN_QUERY_LENGTH) return NextResponse.json({ ok: true, results: [] });

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    // FILTERS ARE VALIDATED, not passed through. `kinds` reaches a SQL
    // array and `module` a text comparison; both are parameters rather
    // than interpolated, and both are checked here so a value that could
    // never match does not become a query that returns everything.
    const kinds = (url.searchParams.get("kinds") ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(isSearchKind);
    const moduleSlug = (url.searchParams.get("module") ?? "").trim().slice(0, 60) || null;
    const sinceRaw = (url.searchParams.get("since") ?? "").trim();
    const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? sinceRaw : null;

    const { data, error } = await supabase.rpc("search_all", {
      p_query: q,
      p_kinds: kinds.length > 0 ? kinds : null,
      p_module: moduleSlug,
      p_since: since,
      p_limit: MAX_RESULTS,
    });
    if (error) throw error;

    const results: SearchResult[] = ((data ?? []) as Record<string, unknown>[])
      .filter((row) => isSearchKind(row.kind))
      .map((row) => ({
        kind: row.kind as SearchResult["kind"],
        moduleSlug: row.module_slug ? String(row.module_slug) : null,
        sourceTable: String(row.source_table ?? ""),
        sourceId: String(row.source_id ?? ""),
        title: String(row.title ?? ""),
        snippet: String(row.snippet ?? ""),
        href: String(row.href ?? ""),
        occurredAt: String(row.occurred_at ?? ""),
        rank: Number(row.rank ?? 0),
      }));

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    logApiError("/api/search", err);
    return NextResponse.json({ ok: false, error: "Search failed." }, { status: 500 });
  }
}
