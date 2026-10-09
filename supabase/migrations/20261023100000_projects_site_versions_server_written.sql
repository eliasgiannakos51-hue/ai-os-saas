-- ---------------------------------------------------------------------------
-- A PROJECT IS CREATED, AND A PUBLISHED SITE'S HISTORY IS WRITTEN, BY THE
-- SERVER ONLY (2026-10-08).
--
-- Fixed access control on public.projects and public.site_versions
-- (docs/SECURITY-AUDIT.md, ΑΣ-4.11 and ΑΣ-1.14).
--   projects       the account keeps reading, renaming and deleting its own
--                  projects and loses INSERT. A project is created only by
--                  src/app/api/projects/route.ts and src/app/api/flows/route.ts,
--                  which check the plan's project cap
--                  (src/lib/projects/project-limits.ts) first and then
--                  write with the service role, user_id from the session.
--   site_versions  the account keeps reading its sites' history and loses
--                  INSERT, UPDATE and DELETE. A version is written only by
--                  src/app/api/websites/[id]/publish/route.ts and
--                  src/app/api/published/[id]/rollback/route.ts, after their
--                  checks, with the service role, user_id from the session.
--
-- RUN IT AFTER THE CODE IS LIVE, not before: the code before this pull
-- request writes both tables with the account's own client, and would stop
-- creating projects and recording versions until it is replaced.
--
-- Idempotent: drop policy if exists, revoke. No row is changed or removed.
-- How to check it after running: the SELF-CHECK at the end raises if the
-- account can still write what it should not, or lost what it keeps;
-- scripts/tests/server-written-tables.dbtest.mjs runs it on a real Postgres.
-- How to undo: grant insert on public.projects to authenticated, and
--              re-create projects_insert_own from 20261001000000_projects.sql;
--              grant insert, delete on public.site_versions to authenticated,
--              and re-create "insert_own_site_versions" and
--              "delete_own_site_versions" from 20260803000000_baseline_schema.sql.
-- ---------------------------------------------------------------------------

drop policy if exists projects_insert_own on public.projects;
revoke insert on public.projects from anon, authenticated;

drop policy if exists "insert_own_site_versions" on public.site_versions;
drop policy if exists "update_own_site_versions" on public.site_versions;
drop policy if exists "delete_own_site_versions" on public.site_versions;
revoke insert, update, delete on public.site_versions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- SELF-CHECK.
-- ---------------------------------------------------------------------------
do $$
declare
  v text;
begin
  if has_table_privilege('authenticated', 'public.projects', 'INSERT') then
    raise exception 'projects: authenticated can still INSERT';
  end if;
  foreach v in array array['UPDATE', 'DELETE'] loop
    if not has_table_privilege('authenticated', 'public.projects', v) then
      raise exception 'projects: authenticated lost %', v;
    end if;
  end loop;
  foreach v in array array['INSERT', 'UPDATE', 'DELETE'] loop
    if has_table_privilege('authenticated', 'public.site_versions', v) then
      raise exception 'site_versions: authenticated can still %', v;
    end if;
  end loop;
  if not has_any_column_privilege('authenticated', 'public.projects', 'SELECT')
     or not has_any_column_privilege('authenticated', 'public.site_versions', 'SELECT') then
    raise exception 'projects and site versions: authenticated lost read';
  end if;
end;
$$;
