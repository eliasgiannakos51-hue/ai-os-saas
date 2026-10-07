-- ---------------------------------------------------------------------------
-- THE COST COLUMNS OF A JOB AND A REPORT ARE READ BY THE SERVER ONLY
-- (2026-10-05).
--
-- Fixed access control on public.ai_jobs and public.research_reports: the
-- account keeps reading its own rows, but only the columns a screen shows.
-- The per-call model and cost record (usage_entries), the step timeline
-- with its provider cost (ai_jobs.timeline), the credit hold
-- (reservation_id) and the worker's flag (ai_jobs.running) are read by the
-- server, after a read of the listed columns has shown the row is the
-- caller's own:
--   src/app/api/jobs/route.ts, src/app/api/jobs/[id]/route.ts
--   src/app/api/research/[id]/route.ts
--   src/app/api/account/export/route.ts (src/lib/gdpr/user-data-registry.ts)
--
-- The lists are src/lib/billing/client-columns.ts, name for name;
-- scripts/tests/entitlement-trust.test.mjs §11 holds the two equal. A
-- column added to either table later is NOT readable by the account until
-- a migration grants it — which is the point: that is a decision.
--
-- Idempotent: revoke, then grant the same columns.
-- How to check it after running: the SELF-CHECK at the end raises if the
-- account can read a server-only column or cannot read a listed one;
-- scripts/tests/cost-columns.dbtest.mjs runs it against a real Postgres.
-- How to undo: grant select on public.ai_jobs, public.research_reports to authenticated;
-- ---------------------------------------------------------------------------

revoke select on public.ai_jobs from anon, authenticated;
grant select (id, user_id, kind, status, input, result, error, step, step_total, step_label, credits_charged, attempts, started_at, finished_at, created_at, updated_at, consumed_at, cancel_requested_at) on public.ai_jobs to authenticated;

revoke select on public.research_reports from anon, authenticated;
grant select (id, user_id, topic, language, status, questions, sections, sources, document_id, credits_charged, error, created_at, updated_at, completed_at, processing_started_at, questions_done, questions_total, current_question, partial_findings, chunk_running, chunk_started_at, chunk_count, cancel_requested_at) on public.research_reports to authenticated;

-- ---------------------------------------------------------------------------
-- SELF-CHECK.
-- ---------------------------------------------------------------------------
do $$
declare
  c text;
begin
  foreach c in array array['usage_entries', 'timeline', 'reservation_id', 'running'] loop
    if has_column_privilege('authenticated', 'public.ai_jobs', c, 'SELECT') then
      raise exception 'ai_jobs: authenticated can still read %', c;
    end if;
  end loop;
  foreach c in array array['usage_entries', 'reservation_id'] loop
    if has_column_privilege('authenticated', 'public.research_reports', c, 'SELECT') then
      raise exception 'research_reports: authenticated can still read %', c;
    end if;
  end loop;
  if not has_column_privilege('authenticated', 'public.ai_jobs', 'result', 'SELECT')
     or not has_column_privilege('authenticated', 'public.research_reports', 'sections', 'SELECT') then
    raise exception 'cost columns: authenticated lost a column a screen reads';
  end if;
end;
$$;
