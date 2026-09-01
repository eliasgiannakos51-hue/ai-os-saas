import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import { materialiseSampleData, SAMPLE_ROW_COUNT } from "@/lib/sample-data/dataset";

/**
 * Loading and clearing the sample account.
 *
 * THE SAMPLE IS AN IMPORT WITH source = 'sample'. Nothing here is a new
 * mechanism: user_imports already records one row per import, every
 * module table already carries import_id, and the migration
 * 20260913000000 only adds a sixth allowed value to the source check.
 * That buys three of the brief's requirements for free — the rows are
 * flagged in the database, they can never be confused with typed-in ones,
 * and the export already reads import_id.
 *
 * EVERY WRITE GOES THROUGH THE USER'S OWN CLIENT, never the admin one.
 * The rows belong to the account and RLS is what says so; a service-role
 * insert here would be a path where the user_id came from application
 * code rather than from the session, which is the shape of the
 * cross-tenant bug this codebase has already had once.
 */

export type SampleLoadResult =
  | { ok: true; inserted: number; byTable: Record<string, number> }
  | { ok: false; reason: "already_loaded" | "failed" };

/** The one sample import this account has, or null. */
export async function findSampleImport(
  supabase: SupabaseClient,
  userId: string
): Promise<{ id: string; created_at: string } | null> {
  const { data, error } = await supabase
    .from("user_imports")
    .select("id, created_at")
    .eq("user_id", userId)
    .eq("source", "sample")
    .maybeSingle();

  if (error) {
    logApiError("sample-data:find", error);
    return null;
  }
  return data ?? null;
}

export async function loadSampleData(
  supabase: SupabaseClient,
  userId: string,
  nowMs: number
): Promise<SampleLoadResult> {
  // Checked here AND enforced by a partial unique index, because a check
  // followed by an insert is two statements and a double-click is two
  // requests.
  if (await findSampleImport(supabase, userId)) return { ok: false, reason: "already_loaded" };

  const tables = materialiseSampleData(nowMs);

  const { data: importRow, error: importError } = await supabase
    .from("user_imports")
    .insert({
      user_id: userId,
      source: "sample",
      filename: null,
      rows_imported: 0,
      rows_rejected: 0,
      modules: {},
      mapping: {},
    })
    .select("id")
    .single();

  if (importError || !importRow) {
    // The unique index is what a second concurrent request hits. That is
    // not a failure worth reporting as one — the sample is loaded, which
    // is what the caller wanted.
    if (importError?.code === "23505") return { ok: false, reason: "already_loaded" };
    logApiError("sample-data:create-import", importError ?? new Error("no row"));
    return { ok: false, reason: "failed" };
  }

  const importId = importRow.id as string;
  const byTable: Record<string, number> = {};
  let inserted = 0;

  for (const t of tables) {
    // user_id and import_id are stamped HERE, from the session and from
    // the row just created — never from the dataset, which has no
    // business knowing either and does not carry them.
    const rows = t.rows.map((r) => ({ ...r, user_id: userId, import_id: importId }));
    const { error, count } = await supabase.from(t.table).insert(rows, { count: "exact" });
    if (error) {
      logApiError("sample-data:insert", error, { table: t.table });
      continue;
    }
    const written = count ?? rows.length;
    byTable[t.table] = written;
    inserted += written;
  }

  // A PARTIAL SAMPLE IS WORSE THAN NONE. If some tables refused their
  // rows the account now has a half-populated demo it did not ask for and
  // cannot reason about, so it is rolled back rather than left.
  if (inserted < SAMPLE_ROW_COUNT) {
    logApiError("sample-data:partial", new Error(`inserted ${inserted} of ${SAMPLE_ROW_COUNT}`));
    await clearSampleData(supabase, userId);
    return { ok: false, reason: "failed" };
  }

  await supabase
    .from("user_imports")
    .update({ rows_imported: inserted, modules: byTable })
    .eq("id", importId)
    .eq("user_id", userId);

  return { ok: true, inserted, byTable };
}

export type SampleClearResult = { deleted: number; tables: Record<string, number> };

/**
 * Removes the sample and its record, ROWS FIRST.
 *
 * THE ORDER IS THE WHOLE POINT AND IS NOT AN ACCIDENT. import_id is
 * `on delete set null` on every module table, which is correct for a CSV
 * — deleting the import record must not delete a user's own data — and
 * exactly wrong here. Delete the user_imports row first and the
 * thirty-six sample rows survive with import_id = NULL, indistinguishable
 * from rows the user typed. The sample would become real, permanently,
 * and nothing downstream could tell.
 *
 * scripts/tests/sample-data.test.mjs fails the build if this order is
 * reversed.
 */
export async function clearSampleData(
  supabase: SupabaseClient,
  userId: string
): Promise<SampleClearResult> {
  const existing = await findSampleImport(supabase, userId);
  const result: SampleClearResult = { deleted: 0, tables: {} };
  if (!existing) return result;

  // Rows first.
  for (const t of materialiseSampleData(Date.now())) {
    const { error, count } = await supabase
      .from(t.table)
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("import_id", existing.id);
    if (error) {
      logApiError("sample-data:clear", error, { table: t.table });
      continue;
    }
    const removed = count ?? 0;
    if (removed > 0) result.tables[t.table] = removed;
    result.deleted += removed;
  }

  // The record last, and only once the rows are gone.
  const { error: importError } = await supabase
    .from("user_imports")
    .delete()
    .eq("id", existing.id)
    .eq("user_id", userId);
  if (importError) logApiError("sample-data:clear-import", importError);

  return result;
}
