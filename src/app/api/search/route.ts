import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CLASSIFIER_MODULES, moduleHref } from "@/lib/classifier-modules";
import { BUILD_MODULES } from "@/lib/build-modules";
import { logApiError } from "@/lib/log-error";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 100;
const PER_MODULE_LIMIT = 4;
const MAX_TOTAL_RESULTS = 20;

type SearchResult = {
  id: string;
  type: "module" | "chat";
  title: string;
  subtitle: string;
  href: string;
};

// Every module with a ModuleConfig, same union the AI Memory page
// (dashboard/memory/page.tsx) searches over — the 13 classic business
// modules plus the 10 Build modules. Search is scoped to just the
// headline field per table (one ilike per table, run in parallel) rather
// than every field, keeping this a single fast query fan-out instead of
// N queries per module.
const ALL_MODULES = [
  ...CLASSIFIER_MODULES.map((config) => ({ config, href: moduleHref(config.slug) })),
  ...BUILD_MODULES.map((config) => ({ config, href: `/dashboard/${config.slug}` })),
];

// Escapes LIKE's own wildcard characters so a literal "%" or "_" typed by
// the user is matched literally instead of acting as a wildcard. Survives
// search_fold, which only touches letters.
function likePattern(q: string): string {
  return `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
}

type HeadlineRow = { id: string; headline: string };

// One table, searched with BOTH SIDES accent-folded.
//
// WHAT WAS WRONG. This used to be `.ilike(headlineKey, pattern)`. `ilike`
// folds case and nothing else, so a Greek user searching "καφε" got no
// result for "Καφές" — and because upper-case Greek is written without
// accents ("ΚΑΦΕΣ") while lower case keeps them, one word typed two
// ordinary ways failed to match itself. Verified on PostgreSQL 16:
// `'Καφές' ilike '%καφε%'` is false; `unaccent('Καφές') ilike '%καφε%'`
// is true.
//
// PostgREST cannot express a function call on the left-hand side of a
// filter, so the comparison moved into search_headline (see
// supabase/migrations/20260813_accent_insensitive_search.sql). That
// function is SECURITY INVOKER, so RLS still scopes every row to the
// caller exactly as the old query builder did.
//
// FALLS BACK to the old ilike on RPC failure rather than returning
// nothing: on a deployment where the migration has not been applied yet,
// degraded (accent-sensitive) search beats a search box that silently
// returns zero results for everything. The failure is logged so the
// missing migration is visible rather than merely survivable.
async function searchTable(
  supabase: ReturnType<typeof createClient>,
  table: string,
  column: string,
  pattern: string
): Promise<HeadlineRow[]> {
  const { data, error } = await supabase.rpc("search_headline", {
    p_table: table,
    p_column: column,
    p_pattern: pattern,
    p_limit: PER_MODULE_LIMIT,
  });

  if (!error) {
    return ((data ?? []) as HeadlineRow[]).map((row) => ({
      id: String(row.id),
      headline: String(row.headline ?? ""),
    }));
  }

  logApiError("/api/search", error, { stage: "search_headline_rpc", table });

  const { data: fallback, error: fallbackError } = await supabase
    .from(table)
    // select("*") rather than a dynamic `id, ${column}` string —
    // supabase-js's query builder does compile-time parsing of select
    // strings that can't resolve a runtime column name, so a plain
    // wildcard sidesteps that entirely; the row set is capped at
    // PER_MODULE_LIMIT anyway, so the extra columns are cheap.
    .select("*")
    .ilike(column, pattern)
    .limit(PER_MODULE_LIMIT);

  if (fallbackError || !fallback) return [];

  return (fallback as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    headline: String(row[column] ?? ""),
  }));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);

    if (q.length < 2) {
      return NextResponse.json({ ok: true, results: [] });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const pattern = likePattern(q);
    // The module name is a key on the config. This route answers a
    // signed-in browser, so it resolves it in that request's locale.
    const t = await getTranslations();

    const moduleResultLists = await Promise.all(
      ALL_MODULES.map(async ({ config, href }) => {
        const rows = await searchTable(supabase, config.table, config.headlineKey, pattern);
        return rows.map(
          (row): SearchResult => ({
            id: `${config.slug}-${row.id}`,
            type: "module",
            title: row.headline || "untitled",
            subtitle: t(config.titleKey),
            href,
          })
        );
      })
    );

    const chatRows = await searchTable(supabase, "chat_conversations", "title", pattern);

    const chatResults: SearchResult[] = chatRows.map((row) => ({
      id: `chat-${row.id}`,
      type: "chat",
      title: row.headline,
      subtitle: "Ionexa Chat",
      href: "/dashboard/chat",
    }));

    const results = [...moduleResultLists.flat(), ...chatResults].slice(0, MAX_TOTAL_RESULTS);

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    logApiError("/api/search", err);
    return NextResponse.json({ ok: false, error: "Search failed." }, { status: 500 });
  }
}
