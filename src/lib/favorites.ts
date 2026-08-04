import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LINKABLE_MODULES, moduleHref } from "@/lib/knowledge-graph";
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
      const config = LINKABLE_MODULES.find((m) => m.table === table);
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
    const config = LINKABLE_MODULES.find((m) => m.table === row.table_name);
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
      href: moduleHref(config.slug),
      createdAt: row.created_at,
    });
  }

  return result;
}
