/**
 * WHAT THE ACCOUNT MAY READ OF ITS OWN JOBS AND REPORTS (2026-10-05).
 *
 * supabase/migrations/20261013000000_cost_columns_server_only.sql grants
 * the signed-in role SELECT on exactly these columns. The rest — the
 * per-call model and cost record, the credit hold, the worker's flags —
 * are read by the server only, through the admin client, after a read of
 * these has shown the row is the caller's own.
 *
 * ONE LIST, TWO READERS. The migration spells the same names, and
 * scripts/tests/entitlement-trust.test.mjs §11 holds the two equal and
 * requires every column the migrations give these tables to be on one of
 * the two lists here — so a new column is a decision, not an accident.
 */
export const JOB_CLIENT_COLUMNS =
  "id, user_id, kind, status, input, result, error, step, step_total, step_label, credits_charged, attempts, started_at, finished_at, created_at, updated_at, consumed_at, cancel_requested_at";

export const JOB_SERVER_ONLY_COLUMNS = ["reservation_id", "usage_entries", "running", "timeline"] as const;

export const RESEARCH_CLIENT_COLUMNS =
  "id, user_id, topic, language, status, questions, sections, sources, document_id, credits_charged, error, created_at, updated_at, completed_at, processing_started_at, questions_done, questions_total, current_question, partial_findings, chunk_running, chunk_started_at, chunk_count, cancel_requested_at";

export const RESEARCH_SERVER_ONLY_COLUMNS = ["usage_entries", "reservation_id"] as const;
