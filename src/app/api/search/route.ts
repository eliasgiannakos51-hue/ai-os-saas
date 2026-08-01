import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CLASSIFIER_MODULES, moduleHref } from "@/lib/classifier-modules";
import { BUILD_MODULES } from "@/lib/build-modules";
import { logApiError } from "@/lib/log-error";

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

// Escapes ILIKE's own wildcard characters so a literal "%" or "_" typed by
// the user is matched literally instead of acting as a wildcard.
function likePattern(q: string): string {
  return `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
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

    const moduleResultLists = await Promise.all(
      ALL_MODULES.map(async ({ config, href }) => {
        // select("*") rather than a dynamic `id, ${headlineKey}` string —
        // supabase-js's query builder does compile-time parsing of select
        // strings that can't resolve a runtime column name, so a plain
        // wildcard sidesteps that entirely; each table's row set here is
        // capped at PER_MODULE_LIMIT anyway, so the extra columns are cheap.
        const { data, error } = await supabase
          .from(config.table)
          .select("*")
          .ilike(config.headlineKey, pattern)
          .limit(PER_MODULE_LIMIT);

        if (error || !data) return [] as SearchResult[];

        return (data as Record<string, unknown>[]).map(
          (row): SearchResult => ({
            id: `${config.slug}-${row.id}`,
            type: "module",
            title: String(row[config.headlineKey] ?? "untitled"),
            subtitle: config.title,
            href,
          })
        );
      })
    );

    const { data: chatRows, error: chatError } = await supabase
      .from("chat_conversations")
      .select("id, title")
      .ilike("title", pattern)
      .limit(PER_MODULE_LIMIT);

    if (chatError) {
      logApiError("/api/search", chatError, { stage: "chat_conversations" });
    }

    const chatResults: SearchResult[] = (chatRows ?? []).map((row) => ({
      id: `chat-${row.id}`,
      type: "chat",
      title: row.title,
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
