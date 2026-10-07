-- ---------------------------------------------------------------------------
-- A RESEARCH REPORT IS WRITTEN BY THE SERVER ONLY (2026-10-05).
--
-- Fixed access control on public.research_reports: the account keeps
-- reading its own reports and deleting them, and loses INSERT and UPDATE.
-- Every write the app makes already goes through the service role:
--   src/app/api/research/route.ts            creates the report
--   src/app/api/research/[id]/run/route.ts   claims and starts it
--   src/app/api/research/[id]/route.ts       closes a stale run
--   src/lib/research/run-research.ts         everything while it runs
--   src/lib/stop-requests.ts                 the stop button
--
-- Idempotent: drop policy if exists, revoke.
-- How to check it after running: the SELF-CHECK at the end raises if the
-- signed-in role can still insert or update;
-- scripts/tests/research-reports-writes.dbtest.mjs runs it against a real
-- Postgres.
-- How to undo: grant insert, update on public.research_reports to authenticated;
--              and re-create the two policies from 20260803000000_baseline_schema.sql.
-- ---------------------------------------------------------------------------

drop policy if exists "insert_own_research_reports" on public.research_reports;
drop policy if exists "update_own_research_reports" on public.research_reports;

revoke insert, update on public.research_reports from anon;
revoke insert, update on public.research_reports from authenticated;

-- ---------------------------------------------------------------------------
-- SELF-CHECK.
-- ---------------------------------------------------------------------------
do $$
begin
  if has_table_privilege('authenticated', 'public.research_reports', 'INSERT')
     or has_table_privilege('authenticated', 'public.research_reports', 'UPDATE') then
    raise exception 'research_reports: authenticated can still write';
  end if;
  -- ANY column, not the table: 20261013000000_cost_columns_server_only.sql
  -- narrows SELECT to listed columns, and this file must still re-run.
  if not has_any_column_privilege('authenticated', 'public.research_reports', 'SELECT')
     or not has_table_privilege('authenticated', 'public.research_reports', 'DELETE') then
    raise exception 'research_reports: authenticated lost read or delete';
  end if;
end;
$$;
