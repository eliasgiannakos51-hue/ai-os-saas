import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * IS THE MIGRATION LEDGER ACTUALLY BEING WRITTEN TO? (security audit,
 * 2026-10-21)
 *
 * supabase/migrations/20261026000000_migration_ledger.sql creates
 * public.schema_migrations and has every migration from it on register
 * its own filename there, at its own end. lib/health/schema-canaries.ts
 * already asks whether the TABLE exists; this asks the sharper question
 * the canary cannot — has anything actually registered, i.e. is the
 * convention being followed by whoever pastes the file, not just whether
 * CREATE TABLE once ran.
 *
 * REPORTED, NOT GATED, the same shape as derived-data.ts: `verdict` is
 * what a human reads, never `ok` or the status code, because EMPTY on a
 * database that predates the ledger (every migration before this one)
 * says nothing about whether anything is wrong today.
 */
export type MigrationLedgerHealth = {
  /** Rows in public.schema_migrations. */
  registered: number | null;
  /** The most recently registered file, if any. */
  newest: { filename: string; appliedAt: string } | null;
  /**
   * "ok"        — the ledger holds at least one row.
   * "EMPTY"     — the table exists (the schema sweep says so) but holds
   *               nothing — this migration did not even register
   *               itself, which means it was pasted with its trailing
   *               INSERT cut off, or run against a connection without
   *               the INSERT privilege the migration itself needs.
   * "unchecked" — the question could not be asked.
   */
  verdict: "ok" | "EMPTY" | "unchecked";
};

/** THE VERDICT AS A PURE FUNCTION, for the reason navVerdict gives about
 *  itself: a test that re-implements the branches it is checking agrees
 *  with its own copy for ever. */
export function ledgerVerdict(registered: number | null): MigrationLedgerHealth["verdict"] {
  if (registered === null) return "unchecked";
  return registered > 0 ? "ok" : "EMPTY";
}

export async function migrationLedgerHealth(): Promise<MigrationLedgerHealth> {
  try {
    const { data, count, error } = await createAdminClient()
      .from("schema_migrations")
      .select("filename, applied_at", { count: "exact" })
      .order("applied_at", { ascending: false })
      .limit(1);
    if (error) return { registered: null, newest: null, verdict: "unchecked" };
    const row = (data as { filename?: string; applied_at?: string }[] | null)?.[0];
    const registered = count ?? null;
    return {
      registered,
      newest: row?.filename ? { filename: row.filename, appliedAt: row.applied_at ?? "" } : null,
      verdict: ledgerVerdict(registered),
    };
  } catch {
    return { registered: null, newest: null, verdict: "unchecked" };
  }
}
