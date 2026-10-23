import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import { matchesSearch } from "@/lib/text/search-match";
import { snippetAround } from "@/lib/library/sources";
import { MY_STUFF_SOURCES, myStuffSearchableText, type MyStuffKind } from "@/lib/my-stuff/sources";

export type MyStuffItem = {
  key: string;
  kind: MyStuffKind;
  id: string;
  title: string;
  /** Why a search found it, when it was found by what it says rather than its name. */
  snippet: string | null;
  createdAt: string;
  href: string;
};

// THE SAME BOUNDS AS THE LIBRARY (lib/library/load.ts) — the newest 60 of
// each kind, at most 200 in all — for the same reason: this is the PLAIN
// SEARCH + FILTER browse mode («Αναζήτηση και φίλτρο ανά είδος, για όποιον
// θέλει να ψάξει μόνος», the owner's message), not the bounded AI context
// (lib/my-stuff/ask-store.ts has its own, smaller pool for that).
export const PER_SOURCE_LIMIT = 60;
export const MAX_ITEMS = 200;

/**
 * Everything this account has across every kind in lib/my-stuff/sources.ts
 * — optionally one kind, optionally only what matches a search in its name
 * OR in what it says. `.eq("user_id", userId)` on every query, not RLS
 * alone, for the same reason lib/library/load.ts states it: a session that
 * degraded to anonymous must be REPORTED, never read as "nothing here".
 */
export async function loadMyStuff(
  supabase: SupabaseClient,
  userId: string,
  { kind, query }: { kind: MyStuffKind | null; query: string }
): Promise<{ items: MyStuffItem[]; failed: MyStuffKind[] }> {
  const failed: MyStuffKind[] = [];
  const searching = query.trim().length > 0;
  const sources = kind ? MY_STUFF_SOURCES.filter((s) => s.kind === kind) : MY_STUFF_SOURCES;

  const perSource = await Promise.all(
    sources.map(async (source) => {
      const columns = searching && source.contentColumns ? `${source.columns}, ${source.contentColumns}` : source.columns;
      const { data, error } = await supabase
        .from(source.table)
        .select(columns)
        .eq("user_id", userId)
        .order(source.timeColumn, { ascending: false })
        .limit(PER_SOURCE_LIMIT);
      if (error || !data) {
        if (error) logApiError("my-stuff:load", error, { table: source.table });
        failed.push(source.kind);
        return [] as MyStuffItem[];
      }
      const items: MyStuffItem[] = [];
      for (const row of data as unknown as Record<string, unknown>[]) {
        if (!source.keep(row)) continue;
        const title = source.titleOf(row);
        let snippet: string | null = null;
        if (searching) {
          const haystack = myStuffSearchableText(source, row);
          if (!matchesSearch(haystack, query)) continue;
          snippet = snippetAround(haystack, query, title);
        }
        const id = String(row.id);
        items.push({
          key: `${source.table}:${id}`,
          kind: source.kind,
          id,
          title,
          snippet,
          createdAt: String(row[source.timeColumn] ?? ""),
          href: source.hrefFor(id),
        });
      }
      return items;
    })
  );

  const items = perSource
    .flat()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_ITEMS);
  return { items, failed };
}
