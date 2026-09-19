import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * DOES THE DERIVED TABLE ACTUALLY HAVE ROWS?
 *
 * THE INCIDENT, 2026-09-19. ⌘K found no content for an account with 88
 * records. Every check about the search index passed: the triggers are
 * declared, the sync function is right, the RPC exists, the route calls
 * it, the schema canary finds it, 29 tables are wired. The table was
 * empty. Not one of those checks asked the only question that mattered.
 *
 * `search_index` is not data anybody enters. Its rows exist ONLY because
 * something else was copied into them — by a trigger on the next edit,
 * or by a backfill that runs once inside a migration. So being correctly
 * wired is a statement about the FUTURE, and being backfilled is a
 * statement about ONE MOMENT that may never have happened. Between
 * those two, an empty index and a healthy one are identical from the
 * code.
 *
 * The only thing that tells them apart is a row count from the live
 * database, which is why this lives beside navFreshness: the same shape,
 * for the same reason — api/nav/track swallowed every error and
 * nav_events stopped filling with nothing anywhere saying so.
 *
 * REPORTED, NOT GATED. An empty index on a brand-new project is correct.
 * `verdict` is the field to watch: EMPTY means the index has never been
 * filled while the product has accounts, which is the failure.
 */
export type DerivedDataHealth = {
  /** Rows in public.search_index. */
  searchIndexRows: number | null;
  /** Distinct accounts with at least one indexed row. */
  searchIndexAccounts: number | null;
  /** Distinct source tables that contributed at least one row. */
  searchIndexSources: number | null;
  /**
   * "ok"        — the index holds rows.
   * "quiet"     — no rows and no accounts: a new project, not a fault.
   * "EMPTY"     — accounts exist and the index holds nothing. Run
   *               supabase/migrations/20260919000000_search_index_backfill.sql.
   * "unchecked" — the question could not be asked.
   */
  verdict: "ok" | "quiet" | "EMPTY" | "unchecked";
};

/**
 * THE VERDICT AS A PURE FUNCTION, for the reason navVerdict gives about
 * itself: a test that re-implements the branches it is checking agrees
 * with its own copy for ever.
 */
export function derivedVerdict(
  rows: number | null,
  accounts: number | null
): DerivedDataHealth["verdict"] {
  if (rows === null) return "unchecked";
  if (rows > 0) return "ok";
  // No rows. Whether that is a fault depends on whether anybody has
  // ever put anything in — and `accounts` here counts accounts in the
  // index, which is zero by definition when rows is zero. So the caller
  // passes the ACCOUNT count from auth instead; see derivedDataHealth.
  if (accounts === null) return "unchecked";
  return accounts > 0 ? "EMPTY" : "quiet";
}

async function countOf(supabase: SupabaseClient, table: string): Promise<number | null> {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) return null;
  return count ?? null;
}

export async function derivedDataHealth(supabase: SupabaseClient): Promise<DerivedDataHealth> {
  try {
    const rows = await countOf(supabase, "search_index");
    if (rows === null) {
      return {
        searchIndexRows: null,
        searchIndexAccounts: null,
        searchIndexSources: null,
        verdict: "unchecked",
      };
    }

    // DISTINCT counts are not something PostgREST does, so the shape of
    // the index is read once and reduced here. Capped: this runs on a
    // health check, and the question is "which sources are represented",
    // not "how many rows does each have".
    const { data } = await supabase
      .from("search_index")
      .select("user_id, source_table")
      .limit(5000);
    const accounts = new Set((data ?? []).map((r) => r.user_id).filter(Boolean)).size;
    const sources = new Set((data ?? []).map((r) => r.source_table)).size;

    // WHETHER AN EMPTY INDEX IS A FAULT depends on whether the product
    // has users at all, and the index cannot answer that about itself.
    let peopleExist: number | null = null;
    if (rows === 0) {
      peopleExist = await countOf(supabase, "user_credits");
    }

    return {
      searchIndexRows: rows,
      searchIndexAccounts: rows === 0 ? 0 : accounts,
      searchIndexSources: rows === 0 ? 0 : sources,
      verdict: derivedVerdict(rows, rows === 0 ? peopleExist : 1),
    };
  } catch {
    return {
      searchIndexRows: null,
      searchIndexAccounts: null,
      searchIndexSources: null,
      verdict: "unchecked",
    };
  }
}
