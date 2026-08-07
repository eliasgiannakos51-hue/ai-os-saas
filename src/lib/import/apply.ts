import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import { getImportTarget } from "@/lib/import/targets";
import type { BuiltRow } from "@/lib/import/build-rows";

/**
 * Write imported rows.
 *
 * Two rules, both enforced here rather than trusted from the caller:
 *
 * OWNERSHIP. `user_id` is stamped onto every row from the SESSION, and
 * any `user_id` present on an incoming row is discarded first. The rows
 * originate from a model's output and a user's file, and neither is
 * allowed a say in whose account they land in.
 *
 * SHAPE. Only keys the target actually declares survive. A row carrying
 * `id`, `created_at` or anything else would otherwise become an insert
 * that either fails loudly or — worse — succeeds and overwrites
 * something.
 */

/** Rows per insert call. Large enough that a 5,000-row file is ten round
 *  trips, small enough that one failure does not lose the whole import. */
const BATCH_SIZE = 500;

/** Rows one import may write, across all targets. The plan caps are
 *  about ongoing cost; this is about a single request not being able to
 *  write a million rows. */
export const MAX_ROWS_PER_IMPORT = 5000;

export type ApplyResult = {
  inserted: number;
  /** Rows the database refused, by table. */
  failed: Record<string, number>;
  /** Rows written per table, for the import record. */
  byTable: Record<string, number>;
};

export async function applyRows(params: {
  supabase: SupabaseClient;
  userId: string;
  importId: string;
  /** Target slug to the rows destined for it. */
  batches: { targetSlug: string; rows: BuiltRow[] }[];
}): Promise<ApplyResult> {
  const { supabase, userId, importId } = params;
  const result: ApplyResult = { inserted: 0, failed: {}, byTable: {} };

  let budget = MAX_ROWS_PER_IMPORT;

  for (const batch of params.batches) {
    const target = getImportTarget(batch.targetSlug);
    if (!target) continue;

    const allowedKeys = new Set(target.fields.map((f) => f.key));

    const prepared = batch.rows.slice(0, budget).map((row) => {
      const clean: Record<string, string | number | null> = {};
      for (const [key, value] of Object.entries(row)) {
        // The allowlist is the defence. `user_id`, `id` and `import_id`
        // are not declared fields on any target, so a row that tried to
        // carry one loses it here — before the object is ever built,
        // rather than being overwritten afterwards and depending on key
        // ordering to win.
        if (!allowedKeys.has(key)) continue;
        clean[key] = value;
      }
      // Stamped last, from the session. Not from the row, not from the
      // request body, not from anything the model produced.
      return { ...clean, user_id: userId, import_id: importId };
    });

    budget -= prepared.length;

    for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
      const chunk = prepared.slice(i, i + BATCH_SIZE);
      const { error, count } = await supabase
        .from(target.table)
        .insert(chunk, { count: "exact" });

      if (error) {
        // One bad chunk does not abandon the import: the rest of the
        // file is still the user's data and still worth having. The
        // failure is counted and reported.
        logApiError("import:apply", error, { stage: "insert", table: target.table });
        result.failed[target.table] = (result.failed[target.table] ?? 0) + chunk.length;
        continue;
      }
      const written = count ?? chunk.length;
      result.inserted += written;
      result.byTable[target.table] = (result.byTable[target.table] ?? 0) + written;
    }

    if (budget <= 0) break;
  }

  return result;
}
