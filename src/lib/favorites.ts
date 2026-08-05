import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FAVORITABLE, getFavoritableByTable } from "@/lib/favoritable";
import { logApiError } from "@/lib/log-error";

export type FavoriteEntry = {
  id: string;
  table: string;
  recordId: string;
  moduleSlug: string;
  moduleTitle: string;
  headline: string;
  href: string;
  createdAt: string;
};

// Which of the given record ids (all from the same table) the user has
// starred — one query, returned as a Set for O(1) lookups while rendering
// a list. Same "batched, never per-row" shape as loadLinkedEntities.
export async function loadFavoriteIds(
  supabase: SupabaseClient,
  userId: string,
  table: string,
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();

  const { data, error } = await supabase
    .from("user_favorites")
    .select("record_id")
    .eq("user_id", userId)
    .eq("table_name", table)
    .in("record_id", ids);

  if (error) {
    logApiError("favorites:loadFavoriteIds", error, { table });
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.record_id as string));
}

// Every favorite the user has, across every module, resolved to a
// human-readable headline + href — powers /dashboard/favorites. Same
// per-table batching as timeline.ts's loadTimelineEntries.
export async function loadAllFavorites(
  supabase: SupabaseClient,
  userId: string
): Promise<FavoriteEntry[]> {
  const { data: favoriteRows, error } = await supabase
    .from("user_favorites")
    .select("id, table_name, record_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !favoriteRows || favoriteRows.length === 0) {
    if (error) logApiError("favorites:loadAllFavorites", error);
    return [];
  }

  const idsByTable = new Map<string, string[]>();
  for (const row of favoriteRows) {
    const list = idsByTable.get(row.table_name) ?? [];
    list.push(row.record_id);
    idsByTable.set(row.table_name, list);
  }

  const headlineByKey = new Map<string, string>();
  await Promise.all(
    [...idsByTable.entries()].map(async ([table, ids]) => {
      const config = getFavoritableByTable(table);
      if (!config) return;
      const { data, error: rowsError } = await supabase.from(table).select("*").in("id", ids);
      if (rowsError || !data) return;
      for (const row of data as Record<string, unknown>[]) {
        headlineByKey.set(`${table}:${row.id}`, String(row[config.headlineKey] ?? "untitled"));
      }
    })
  );

  const result: FavoriteEntry[] = [];
  for (const row of favoriteRows) {
    const config = getFavoritableByTable(row.table_name);
    if (!config) continue;
    const headline = headlineByKey.get(`${row.table_name}:${row.record_id}`);
    // Missing headline means the favorited record was since deleted —
    // nothing sensible to show, so skip it rather than showing a broken
    // "untitled" link into a record that no longer exists.
    if (headline === undefined) continue;
    result.push({
      id: row.id,
      table: row.table_name,
      recordId: row.record_id,
      moduleSlug: config.slug,
      moduleTitle: config.title,
      headline,
      href: config.hrefFor(row.record_id),
      createdAt: row.created_at,
    });
  }

  return result;
}

export type FavoriteGroup = {
  moduleSlug: string;
  moduleTitle: string;
  entries: FavoriteEntry[];
};

/**
 * Splits a flat favorites list into per-module groups.
 *
 * A mixed reverse-chronological list answers "what did I star recently",
 * which is not the question anyone opens this page with — they came
 * looking for a specific thing and they remember which module it was in.
 *
 * Group order follows the FAVORITABLE registry (which follows the sidebar)
 * rather than recency, so the page doesn't reshuffle itself every time
 * something is starred. Entries inside a group keep their
 * newest-first order.
 */
export function groupFavorites(entries: FavoriteEntry[]): FavoriteGroup[] {
  const bySlug = new Map<string, FavoriteEntry[]>();
  for (const entry of entries) {
    const list = bySlug.get(entry.moduleSlug) ?? [];
    list.push(entry);
    bySlug.set(entry.moduleSlug, list);
  }

  const groups: FavoriteGroup[] = [];
  for (const config of FAVORITABLE) {
    const found = bySlug.get(config.slug);
    if (!found || found.length === 0) continue;
    groups.push({
      moduleSlug: config.slug,
      moduleTitle: config.title,
      entries: found,
    });
    // Deleted so a slug that somehow appears twice in the registry cannot
    // render its entries twice.
    bySlug.delete(config.slug);
  }

  // Anything whose module left the registry still gets shown rather than
  // silently vanishing from a page whose whole job is "things I saved".
  for (const [slug, found] of bySlug) {
    groups.push({ moduleSlug: slug, moduleTitle: slug, entries: found });
  }

  return groups;
}

/**
 * Favorite state for records spanning SEVERAL tables — the Timeline's
 * shape, where one page mixes rows from every module.
 *
 * Returns "<table>:<id>" keys because ids from different tables are
 * unrelated and could collide on a plain id set. One query per distinct
 * table, run in parallel, rather than one per row.
 */
export async function loadFavoriteKeys(
  supabase: SupabaseClient,
  userId: string,
  records: { table: string; id: string }[]
): Promise<string[]> {
  const idsByTable = new Map<string, string[]>();
  for (const record of records) {
    const list = idsByTable.get(record.table) ?? [];
    list.push(record.id);
    idsByTable.set(record.table, list);
  }

  const perTable = await Promise.all(
    [...idsByTable.entries()].map(async ([table, ids]) => {
      const found = await loadFavoriteIds(supabase, userId, table, ids);
      return [...found].map((id) => `${table}:${id}`);
    })
  );

  return perTable.flat();
}
