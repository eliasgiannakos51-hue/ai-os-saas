import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import { matchesSearch } from "@/lib/text/search-match";
import { isFavoritableTable } from "@/lib/favoritable";
import { loadFavoriteKeys } from "@/lib/favorites";
import {
  LIBRARY_SOURCES,
  searchableText,
  snippetAround,
  type LibraryKind,
} from "@/lib/library/sources";

export type LibraryItem = {
  key: string;
  kind: LibraryKind;
  id: string;
  title: string;
  /** Why a search found it, when it was found by what it says rather than its name. */
  snippet: string | null;
  createdAt: string;
  href: string;
  /**
   * Whether this item is starred — read from user_favorites, the same
   * table the Favorites page and every star button already use
   * (lib/favorites.ts). Only 3 of the 7 kinds (site, slides, document)
   * are in the FAVORITABLE registry today (lib/favoritable.ts); the
   * other 4 (posts, research, analysis, file) are deliberately
   * LINK_ONLY_MODULES — this is always `false` for them, not a gap this
   * file invents a fix for.
   */
  favorited: boolean;
};

/** The kinds a star can actually be put on, right now. */
export const FAVORITABLE_LIBRARY_KINDS: readonly LibraryKind[] = LIBRARY_SOURCES.filter((s) =>
  isFavoritableTable(s.table)
).map((s) => s.kind);

// THE NEWEST 60 OF EACH TOOL, AT MOST 200 IN ALL — the Timeline's bounds
// (lib/timeline.ts), for the same reason: the page stays fast however much
// an account has made. A search reads the same 60 per tool, with their
// text; the page says so under the field (dashboard.library.searchScope).
export const PER_SOURCE_LIMIT = 60;
export const MAX_ITEMS = 200;

/**
 * Everything this account made, newest first, across every tool in
 * lib/library/sources.ts — optionally one kind, optionally only what
 * matches a search in its name OR in what it says.
 *
 * `.eq("user_id", userId)` ON EVERY QUERY, not RLS alone: lib/timeline.ts
 * carries the history of a session that degraded to anonymous and drew an
 * empty page with no error. A table that fails is reported back, never
 * read as "nothing made".
 */
export async function loadLibrary(
  supabase: SupabaseClient,
  userId: string,
  { kind, query, favoriteOnly = false }: { kind: LibraryKind | null; query: string; favoriteOnly?: boolean }
): Promise<{ items: LibraryItem[]; failed: LibraryKind[] }> {
  const failed: LibraryKind[] = [];
  const searching = query.trim().length > 0;
  const sources = kind ? LIBRARY_SOURCES.filter((s) => s.kind === kind) : LIBRARY_SOURCES;
  const tableOfKind = new Map(LIBRARY_SOURCES.map((s) => [s.kind, s.table]));

  const perSource = await Promise.all(
    sources.map(async (source) => {
      const columns = searching ? `${source.columns}, ${source.contentColumns}` : source.columns;
      const { data, error } = await supabase
        .from(source.table)
        .select(columns)
        .eq("user_id", userId)
        .order(source.timeColumn, { ascending: false })
        .limit(PER_SOURCE_LIMIT);
      if (error || !data) {
        if (error) logApiError("library:load", error, { table: source.table });
        failed.push(source.kind);
        return [] as Omit<LibraryItem, "favorited">[];
      }
      const items: Omit<LibraryItem, "favorited">[] = [];
      for (const row of data as unknown as Record<string, unknown>[]) {
        if (!source.keep(row)) continue;
        const title = source.titleOf(row);
        let snippet: string | null = null;
        if (searching) {
          const haystack = searchableText(source, row);
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

  const sorted = perSource
    .flat()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Starred state: one query per distinct table among the kinds that are
  // actually favoritable (lib/favoritable.ts) — the other kinds never
  // reach loadFavoriteKeys at all, so they stay `favorited: false` without
  // asking user_favorites a question it has no rows to answer.
  const candidates = sorted.filter((it) => isFavoritableTable(tableOfKind.get(it.kind) ?? ""));
  const favoriteKeys =
    candidates.length > 0
      ? new Set(
          await loadFavoriteKeys(
            supabase,
            userId,
            candidates.map((it) => ({ table: tableOfKind.get(it.kind) as string, id: it.id }))
          )
        )
      : new Set<string>();

  const withFavorites: LibraryItem[] = sorted.map((it) => ({ ...it, favorited: favoriteKeys.has(it.key) }));
  const filtered = favoriteOnly ? withFavorites.filter((it) => it.favorited) : withFavorites;
  const items = filtered.slice(0, MAX_ITEMS);
  return { items, failed };
}
