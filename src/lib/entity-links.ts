import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LINKABLE_MODULES, moduleHref } from "@/lib/knowledge-graph";
import { logApiError } from "@/lib/log-error";
import type { ModuleTitleKey } from "@/lib/modules";

export type LinkedEntity = {
  linkId: string;
  table: string;
  id: string;
  moduleTitleKey: ModuleTitleKey;
  headline: string;
  href: string;
};

// A link is shown from both ends: if an Idea is linked to a Product, the
// Idea's row shows "Linked to: <Product>" and the Product's row shows
// "Linked to: <Idea>" — so every id in `ids` is checked both as a possible
// link source AND as a possible link target, each side resolved to the
// record on the *other* end.
//
// Batched by design: one query for "records in `ids` as a source", one for
// "as a target", then one query per distinct table the results point at
// (to resolve a human-readable headline) — never one query per record or
// per link, regardless of how many ids/links are involved.
export async function loadLinkedEntities(
  supabase: SupabaseClient,
  userId: string,
  table: string,
  ids: string[]
): Promise<Record<string, LinkedEntity[]>> {
  if (ids.length === 0) return {};

  const [{ data: asSource, error: sourceError }, { data: asTarget, error: targetError }] =
    await Promise.all([
      supabase
        .from("entity_links")
        .select("id, source_id, target_table, target_id")
        .eq("user_id", userId)
        .eq("source_table", table)
        .in("source_id", ids),
      supabase
        .from("entity_links")
        .select("id, target_id, source_table, source_id")
        .eq("user_id", userId)
        .eq("target_table", table)
        .in("target_id", ids),
    ]);

  if (sourceError || targetError) {
    logApiError("entity-links:loadLinkedEntities", sourceError ?? targetError, { table });
    return {};
  }

  type Ref = { linkId: string; otherTable: string; otherId: string };
  const refsByRecord = new Map<string, Ref[]>();
  for (const row of asSource ?? []) {
    const list = refsByRecord.get(row.source_id) ?? [];
    list.push({ linkId: row.id, otherTable: row.target_table, otherId: row.target_id });
    refsByRecord.set(row.source_id, list);
  }
  for (const row of asTarget ?? []) {
    const list = refsByRecord.get(row.target_id) ?? [];
    list.push({ linkId: row.id, otherTable: row.source_table, otherId: row.source_id });
    refsByRecord.set(row.target_id, list);
  }

  if (refsByRecord.size === 0) return {};

  const idsByTable = new Map<string, Set<string>>();
  for (const refs of refsByRecord.values()) {
    for (const ref of refs) {
      const set = idsByTable.get(ref.otherTable) ?? new Set<string>();
      set.add(ref.otherId);
      idsByTable.set(ref.otherTable, set);
    }
  }

  const headlineByKey = new Map<string, string>();
  await Promise.all(
    [...idsByTable.entries()].map(async ([otherTable, otherIds]) => {
      const config = LINKABLE_MODULES.find((m) => m.table === otherTable);
      if (!config) return;
      // select("*") rather than a dynamic `id, ${headlineKey}` string —
      // supabase-js's query builder does compile-time parsing of select
      // strings that can't resolve a runtime column name, so a plain
      // wildcard sidesteps that entirely (same reasoning as
      // api/search/route.ts, which hits this exact issue).
      const { data, error } = await supabase
        .from(otherTable)
        .select("*")
        .in("id", [...otherIds]);
      if (error || !data) return;
      for (const row of data as Record<string, unknown>[]) {
        headlineByKey.set(
          `${otherTable}:${row.id}`,
          String(row[config.headlineKey] ?? "untitled")
        );
      }
    })
  );

  const result: Record<string, LinkedEntity[]> = {};
  for (const [recordId, refs] of refsByRecord.entries()) {
    const entities: LinkedEntity[] = [];
    for (const ref of refs) {
      const headline = headlineByKey.get(`${ref.otherTable}:${ref.otherId}`);
      // Missing headline means the linked record was deleted, or
      // (defensively) belongs to someone else and RLS hid it from the
      // query above — either way, nothing sensible to show, so skip it.
      if (headline === undefined) continue;
      const config = LINKABLE_MODULES.find((m) => m.table === ref.otherTable);
      if (!config) continue;
      entities.push({
        linkId: ref.linkId,
        table: ref.otherTable,
        id: ref.otherId,
        moduleTitleKey: config.titleKey,
        headline,
        href: moduleHref(config.slug),
      });
    }
    if (entities.length > 0) result[recordId] = entities;
  }

  return result;
}
