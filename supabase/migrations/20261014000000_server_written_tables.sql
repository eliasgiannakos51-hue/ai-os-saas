-- ---------------------------------------------------------------------------
-- TEAM INVITES, FILE ROWS AND PUBLISHED PAGES ARE WRITTEN BY THE SERVER ONLY
-- (2026-10-05).
--
-- Fixed access control on public.team_members, public.user_files and
-- public.published_sites: the account keeps reading its own rows and loses
-- INSERT, UPDATE and DELETE. Every write goes through a route that checks
-- first, and then writes with the service role, scoped to the caller:
--   team_members     src/app/api/team/invite/route.ts (plan, seats, rate)
--                    src/app/api/team/remove/route.ts (and takes the grant back)
--   user_files       src/lib/files/ingest.ts (count cap, storage quota, type)
--                    src/app/api/files/[id]/route.ts (the object goes first)
--   published_sites  src/app/api/websites/[id]/publish/route.ts (plan cap,
--                    script strip, pre-publish scan), and
--                    src/app/api/published/[id]/rollback/route.ts
-- The files diagnostic (src/app/api/system-health/files/route.ts) now
-- expects a direct insert to be refused.
--
-- Idempotent: drop policy if exists, revoke.
-- How to check it after running: the SELF-CHECK at the end raises if the
-- account can still write any of the three, or cannot read them;
-- scripts/tests/server-written-tables.dbtest.mjs runs it on a real Postgres.
-- How to undo: grant insert, update, delete on the three tables to
--              authenticated, and re-create the six policies from
--              20260803000000_baseline_schema.sql.
-- ---------------------------------------------------------------------------

drop policy if exists "insert_own_team_members" on public.team_members;
drop policy if exists "update_own_team_members" on public.team_members;
drop policy if exists "delete_own_team_members" on public.team_members;
revoke insert, update, delete on public.team_members from anon, authenticated;

drop policy if exists "insert_own_user_files" on public.user_files;
drop policy if exists "update_own_user_files" on public.user_files;
drop policy if exists "delete_own_user_files" on public.user_files;
revoke insert, update, delete on public.user_files from anon, authenticated;

drop policy if exists "insert_own_published_sites" on public.published_sites;
drop policy if exists "update_own_published_sites" on public.published_sites;
drop policy if exists "delete_own_published_sites" on public.published_sites;
revoke insert, update, delete on public.published_sites from anon, authenticated;

-- ---------------------------------------------------------------------------
-- SELF-CHECK.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  v text;
begin
  foreach t in array array['public.team_members', 'public.user_files', 'public.published_sites'] loop
    foreach v in array array['INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('authenticated', t, v) then
        raise exception '%: authenticated can still %', t, v;
      end if;
    end loop;
    if not has_any_column_privilege('authenticated', t, 'SELECT') then
      raise exception '%: authenticated lost read', t;
    end if;
  end loop;
end;
$$;
