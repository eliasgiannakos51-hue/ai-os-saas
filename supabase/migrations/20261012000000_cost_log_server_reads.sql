-- ---------------------------------------------------------------------------
-- THE COST LOG AND THE PROVIDER LOG ARE READ BY THE SERVER ONLY (2026-10-05).
--
-- Fixed access control on public.ai_cost_log and public.ai_provider_log:
-- the account no longer reads them directly. What a screen needs from them
-- is read by the server, the account's own rows only:
--   src/app/dashboard/layout.tsx            Recent tools (feature, created_at)
--   src/app/dashboard/settings/page.tsx     free actions, bypass total
--   src/app/api/websites/status/route.ts    the "used N credits" receipt
--   src/app/api/account/export/route.ts     the export, listed columns only
--                                           (src/lib/gdpr/user-data-registry.ts)
--
-- Idempotent: drop policy if exists, revoke.
-- How to check it after running: the SELF-CHECK at the end raises if the
-- signed-in role can still read either table;
-- scripts/tests/cost-log-reads.dbtest.mjs runs it against a real Postgres.
-- How to undo: grant select on public.ai_cost_log, public.ai_provider_log
--              to authenticated; and re-create the two select policies from
--              20260803000000_baseline_schema.sql and
--              20260828000000_ai_provider_log.sql.
-- ---------------------------------------------------------------------------

drop policy if exists "select_own_ai_cost_log" on public.ai_cost_log;
drop policy if exists "ai_provider_log_select_own" on public.ai_provider_log;

revoke select on public.ai_cost_log from anon, authenticated;
revoke select on public.ai_provider_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- SELF-CHECK.
-- ---------------------------------------------------------------------------
do $$
begin
  if has_table_privilege('authenticated', 'public.ai_cost_log', 'SELECT')
     or has_table_privilege('authenticated', 'public.ai_provider_log', 'SELECT') then
    raise exception 'cost logs: authenticated can still read';
  end if;
end;
$$;
