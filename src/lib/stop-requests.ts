import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";

/**
 * A STOP, FOR WORK THE BROWSER IS NOT CONNECTED TO — V4.6.
 *
 * Chat and code run inside the request and stop when the request is
 * aborted. A website generation, a background job and a research report
 * do not: they run in workers the tab is deliberately not attached to,
 * so "stop" has to be a fact in the database (`cancel_requested_at`, see
 * 20260924000000_stop_requests.sql) that the worker reads at every
 * boundary it has and acts on. This file is the two halves of that fact:
 * writing it (the cancel routes) and reading it (the workers).
 *
 * THE MONEY RULE, stated once: a stop settles for the work already done
 * — the steps that ran, the questions that were answered, the tokens
 * that were produced — and nothing else. The hold for what never ran is
 * released. Charging the whole reservation for a stopped job would be a
 * charge without delivery; charging nothing would be a delivery without
 * a charge, and a worker that had spent real tokens would show up on no
 * margin report.
 */

export const STOP_TABLES = ["ai_jobs", "user_websites", "research_reports"] as const;
export type StopTable = (typeof STOP_TABLES)[number];

/** What the row says afterwards, in the column the UI already renders. */
// The sentence itself is client-safe and lives in lib/stop-message.ts; this
// re-export keeps every worker importing it from the module it already uses.
import { STOPPED_MESSAGE } from "@/lib/stop-message";
export { STOPPED_MESSAGE };

/** Thrown inside a worker at a boundary where a stop was found. */
export class StoppedByUserError extends Error {
  constructor() {
    super(STOPPED_MESSAGE);
    this.name = "StoppedByUserError";
  }
}

/**
 * Has the owner asked this row to stop? One indexed read by primary key.
 * A read that FAILS answers "no": a database hiccup must not stop a job
 * that nobody asked to stop, and the next boundary asks again.
 */
export async function isStopRequested(
  admin: SupabaseClient,
  table: StopTable,
  id: string
): Promise<boolean> {
  const { data, error } = await admin.from(table).select("cancel_requested_at").eq("id", id).maybeSingle();
  if (error) {
    logApiError("stop-requests:read", error, { table, id });
    return false;
  }
  return Boolean(data?.cancel_requested_at);
}

/**
 * The write, from a cancel route. `owned` is the user-scoped read the
 * route already made — this never writes a row RLS did not first hand
 * to the caller. Idempotent: a second press keeps the first timestamp.
 */
export async function markStopRequested(
  admin: SupabaseClient,
  table: StopTable,
  id: string
): Promise<boolean> {
  const { error } = await admin
    .from(table)
    .update({ cancel_requested_at: new Date().toISOString() })
    .eq("id", id)
    .is("cancel_requested_at", null);
  if (error) {
    logApiError("stop-requests:write", error, { table, id });
    return false;
  }
  return true;
}
