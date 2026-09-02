-- REPAIR 5.1 — db_exposure_report
-- Source: supabase/migrations/20260917000000_db_exposure_report.sql
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- Run the numbered files IN ORDER. Each is safe to run twice.

-- ============================================================================
-- WHAT THIS DATABASE EXPOSES, ASKED OF THE DATABASE
-- ============================================================================
--
-- WHY A FUNCTION AND NOT A QUERY IN A DOCUMENT. The header of
-- 20260916000000_extension_functions_not_anon ends by handing the reader
-- a query to run by hand, because that migration cannot know whether
-- pgcrypto lives in `public` (where CREATE EXTENSION puts it on a plain
-- PostgreSQL) or in `extensions` (where a real Supabase project usually
-- already has it). A query in a comment gets run once, by whoever read
-- the comment, on the day they read it.
--
-- This is the same six checks as a function, so /dashboard/system-health
-- can ask them on every load, against the database that is actually
-- running. The answer stops being something somebody remembers to check.
--
-- WHAT IT REPORTS, and every row is a count with a verdict rather than a
-- list, because the list would be the thing that leaks:
--
--   extensions_in_public       extensions whose functions PostgREST can
--                              route to, because `public` is an exposed
--                              schema and `extensions` is not
--   anon_executable_functions  functions in public that anon may EXECUTE
--   anon_readable_relations    relations anon may SELECT (help_articles
--                              is the one argued-for exception)
--   public_granted_relations   relations carrying a bare PUBLIC grant
--   tables_without_rls         tables in public with RLS off
--   grant_without_policy       (table, verb) pairs granted to
--                              authenticated with no policy for that verb
--   secdef_without_search_path SECURITY DEFINER functions that do not
--                              pin one
--   default_acl_for_anon       ALTER DEFAULT PRIVILEGES rows mentioning
--                              anon, which is how 78 tables acquired
--                              grants nobody wrote
--
-- SECURITY DEFINER because it reads pg_class, pg_proc and pg_default_acl,
-- and the caller is service_role rather than a superuser. STABLE, and it
-- writes nothing. Executable by service_role alone: the counts are a map
-- of where to attack this database, so they belong on the owner's screen
-- and nowhere else.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

create or replace function public.db_exposure_report()
returns table (check_key text, found bigint, expected bigint, ok boolean, detail text)
language sql
stable
security definer
set search_path = public, pg_catalog
as $exposure$
  -- WHERE THE EXTENSIONS LIVE.
  --
  -- AND THE VERDICT IS NOT "count = 0", which is what the first version
  -- of this row said. Being in `public` is only a problem while anon can
  -- CALL them: 20260916000000 takes their grants off PUBLIC and hands
  -- them back to authenticated and service_role by name, after which
  -- three extensions sitting in `public` expose nothing. A row that went
  -- red anyway would be permanently red on every plain-PostgreSQL
  -- deployment while the actual exposure was closed — a check that cries
  -- wolf is a check somebody learns to scroll past.
  --
  -- So the count is reported, because it is the fact that decides whether
  -- that migration did anything, and the VERDICT is the property:
  -- nothing in public is reachable by anon.
  select 'extensions_in_public'::text,
         count(*)::bigint,
         0::bigint,
         count(*) = 0 or not exists (
           select 1 from pg_proc p
             join pg_namespace pn on pn.oid = p.pronamespace
            where pn.nspname = 'public'
              and has_function_privilege('anon', p.oid, 'execute')),
         case
           when count(*) = 0 then 'none in public'
           else coalesce(string_agg(e.extname, ', ' order by e.extname), '')
                || ' (in public; anon can execute '
                || (select count(*)::text from pg_proc p
                      join pg_namespace pn on pn.oid = p.pronamespace
                     where pn.nspname = 'public'
                       and has_function_privilege('anon', p.oid, 'execute'))
                || ' of their functions)'
         end
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
   where n.nspname = 'public'

  union all
  -- THE ONE THAT MATTERS. PostgREST exposes `public` as an RPC surface,
  -- so anything here is reachable by a holder of the anon key — which
  -- ships in the browser bundle by design.
  select 'anon_executable_functions',
         count(*)::bigint, 0::bigint, count(*) = 0,
         coalesce(string_agg(p.proname, ', ' order by p.proname)
                  filter (where p.proname in ('crypt', 'gen_salt', 'pgp_sym_encrypt')),
                  '')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and has_function_privilege('anon', p.oid, 'execute')

  union all
  -- help_articles is the argued-for one; see
  -- 20260906000000_revoke_anon_grants for why it is the only member.
  select 'anon_readable_relations',
         count(*)::bigint, 1::bigint, count(*) <= 1,
         coalesce(string_agg(c.relname, ', ' order by c.relname), 'none')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'v', 'm', 'p', 'f')
     and has_table_privilege('anon', c.oid, 'select')

  union all
  select 'public_granted_relations',
         count(*)::bigint, 0::bigint, count(*) = 0, ''
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'v', 'm')
     and c.relacl::text ~ '(^|,)\{?='

  union all
  -- A GRANT IS SILENT WITHOUT A POLICY ONLY WHILE RLS IS ON. One
  -- `alter table ... disable row level security`, in one migration, for
  -- one debugging session, turns a dormant misconfiguration into a full
  -- public read. This is that catch, counted.
  select 'tables_without_rls',
         count(*)::bigint, 0::bigint, count(*) = 0,
         coalesce(string_agg(c.relname, ', ' order by c.relname), 'none')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity

  union all
  select 'grant_without_policy',
         count(*)::bigint, 0::bigint, count(*) = 0, ''
    from (
      select c.relname, v.verb
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        cross join (values ('select', 'SELECT'), ('insert', 'INSERT'),
                           ('update', 'UPDATE'), ('delete', 'DELETE')) v(verb, pcmd)
       where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
         and has_table_privilege('authenticated', c.oid, v.verb)
         and not exists (
           select 1 from pg_policies p
            where p.schemaname = 'public' and p.tablename = c.relname
              and (p.cmd = v.pcmd or p.cmd = 'ALL'))
    ) gaps

  union all
  select 'secdef_without_search_path',
         count(*)::bigint, 0::bigint, count(*) = 0,
         coalesce(string_agg(p.proname, ', ' order by p.proname), 'none')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=%'

  union all
  select 'default_acl_for_anon',
         count(*)::bigint, 0::bigint, count(*) = 0, ''
    from pg_default_acl
   where defaclacl::text like '%anon%';
$exposure$;