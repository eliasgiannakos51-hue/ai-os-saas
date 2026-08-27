-- ============================================================================
-- THE anon ROLE OWNS NOTHING IN public
-- ============================================================================
--
-- WHAT WAS FOUND. A sweep of the live database returned SEVENTY-EIGHT
-- tables carrying grants for `anon` — select, insert, update and delete on
-- nearly all of them. Not one of those grants was written by a migration
-- in this directory. They come from Supabase's own
--
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon
--
-- which every `create table` in `public` then inherits, silently, at
-- creation time.
--
-- WHY NOBODY NOTICED, and this is the whole lesson. A GRANT without a
-- POLICY is SILENT. Measured on PostgreSQL 16:
--
--     RLS ON,  0 policies, full anon grants -> select returns 0 rows,
--                                              insert raises 42501-ish RLS error
--     RLS OFF,             full anon grants -> select returns EVERY ROW,
--                                              delete removes EVERY ROW,
--                                              and both report success
--
-- So the grants were harmless only for as long as every table kept RLS
-- enabled. `alter table ... disable row level security` — one line, in one
-- future migration, for one debugging session — would have turned a
-- dormant misconfiguration into a full public read of that table. The
-- grant is the loaded half; RLS is the safety catch. This file unloads it.
--
-- WHY REVOKING IS SAFE, established by reading the code rather than
-- assuming. There are exactly three places in this app that hold an
-- anon key: src/middleware.ts, src/lib/supabase/server.ts and
-- src/lib/supabase/client.ts. Every public surface that uses one either
-- touches GoTrue only (/forgot-password, /reset-password, the social
-- buttons, the middleware's getUser) or calls auth.getUser() BEFORE any
-- table access — at which point the request carries the user's JWT and
-- PostgREST executes as `authenticated`, not as `anon`. The genuinely
-- anonymous surfaces — /s/[subdomain] and its sub-routes, the sitemap,
-- and the visitor form POST at api/websites/[id]/submit-form — all use
-- createAdminClient(), which is service_role and bypasses both grants and
-- RLS. Revoking anon breaks none of them.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

-- ----------------------------------------------------------------------
-- 1. Every relation in public, minus an explicit keep list
-- ----------------------------------------------------------------------
-- REVOKED UNCONDITIONALLY rather than only where a grant is detected.
-- has_table_privilege(...,'update') returns FALSE when the role holds only
-- a COLUMN-level update grant — measured — so filtering on it would skip
-- exactly the tables hardest to spot by hand. REVOKE on a privilege the
-- role does not hold is a no-op, so the unconditional form costs nothing
-- and cannot miss a case.
--
-- And REVOKE ALL ON TABLE clears column-level ACLs too: measured on
-- PostgreSQL 16, pg_attribute.attacl goes to NULL. One statement covers
-- both levels.
do $$
declare
  -- THE KEEP LIST. A table named here stays readable by anon. Adding to
  -- it is a deliberate decision to publish a table to the internet.
  --
  -- help_articles is the only member and it is a considered one. It
  -- carries an explicit `for select to anon using (published)` policy, so
  -- the grant and the policy agree about what is public. Worth stating
  -- plainly: the app does not actually need this grant — both readers in
  -- lib/support/help-articles.ts use createAdminClient(). It is kept
  -- because this is the one table whose grant is not an accident, and
  -- removing it would make the next reader wonder whether /help was meant
  -- to be public.
  keep constant text[] := array[
    'help_articles'
  ];
  r record;
  n_rel int := 0;
  n_seq int := 0;
begin
  -- 'r' table, 'p' partitioned table, 'v' view, 'm' materialized view,
  -- 'f' foreign table. Views and matviews are included because a view over
  -- a revoked table is still a readable object in its own right.
  for r in
    select c.oid::regclass as ref
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm', 'f')
       and not (c.relname = any(keep))
     order by 1
  loop
    execute format('revoke all on table %s from anon', r.ref);
    n_rel := n_rel + 1;
  end loop;

  -- Sequences as well. anon has no insert anywhere after the loop above,
  -- so it has no use for nextval, and USAGE on a sequence is the one
  -- privilege that survives a table revoke.
  for r in
    select c.oid::regclass as ref
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public'
       and c.relkind = 'S'
     order by 1
  loop
    execute format('revoke all on sequence %s from anon', r.ref);
    n_seq := n_seq + 1;
  end loop;

  raise notice 'anon: revoked on % relation(s), % sequence(s)', n_rel, n_seq;
end $$;

-- USAGE ON SCHEMA STAYS. Without it PostgREST cannot resolve a name at
-- all, and the one table anon is still allowed to read becomes
-- unreachable along with everything else.
grant usage on schema public to anon;

-- ----------------------------------------------------------------------
-- 2. So it does not come back
-- ----------------------------------------------------------------------
-- Section 1 cleans up what exists. This stops the next `create table` from
-- re-creating the problem: default privileges are applied at CREATE time,
-- so without this every future migration silently hands anon another
-- table and the sweep has to be run again.
--
-- Scoped to the role executing this file, which is the role that owns and
-- creates the project's tables. Measured: a table created after this runs
-- comes out with anon having no privilege at all.
--
-- WHAT THIS COSTS. A table that genuinely should be public now needs an
-- explicit `grant select on ... to anon` in its own migration. That is the
-- point — a published table becomes a line somebody wrote and a reviewer
-- can see, instead of a default nobody chose.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ----------------------------------------------------------------------
-- 3. Trigger functions
-- ----------------------------------------------------------------------
-- 20260818000000_function_grants loops over pg_proc and normalises
-- routine grants, and every migration added after it in this directory
-- carries its own revoke for the same reason. A function created OUTSIDE
-- this directory gets neither.
--
-- One had: guard_badge_removal_columns, created by a loose
-- v4_badge_removal_migration.sql from a branch that was never merged, and
-- still sitting in the live database with EXECUTE for `authenticated` —
-- the PostgreSQL default that nothing revoked.
--
-- IT WAS NOT EXPLOITABLE, and the honest version of that is worth writing
-- down rather than quietly fixing. Measured on PostgreSQL 16: a function
-- whose return type is `trigger` cannot be called directly by anybody —
--
--     select public.guard_demo();
--     ERROR:  trigger functions can only be called as triggers
--
-- not by `authenticated`, not by the superuser. PostgREST does not expose
-- one as an RPC either, because it cannot serialise a `trigger` return.
-- The grant was a privilege that could not be exercised.
--
-- IT IS REVOKED ANYWAY, and the loop is written over ALL trigger
-- functions rather than that one name. A privilege nobody can use is
-- still a privilege nobody audited, and the next function created outside
-- this directory will be covered without anybody remembering to add it.
--
-- ONLY TRIGGER FUNCTIONS. A blanket sweep over every routine would strip
-- the grants that migrations 20260824 through 20260827 deliberately give
-- `authenticated` — search_all, search_query, match_agent_templates,
-- voice_usage_this_month — and break the browser. Trigger functions are
-- the subset where "callable by nobody" is provably the correct answer.
do $$
declare
  fn record;
  n int := 0;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
      left join pg_depend d
        on d.objid = p.oid
       and d.deptype = 'e'          -- 'e' = owned by an extension
     where ns.nspname = 'public'
       and d.objid is null
       and p.prorettype = 'pg_catalog.trigger'::regtype
     order by 1
  loop
    execute format('revoke all on routine %s from public', fn.sig);
    execute format('revoke all on routine %s from anon', fn.sig);
    execute format('revoke all on routine %s from authenticated', fn.sig);
    -- service_role keeps EXECUTE so a migration or a maintenance script
    -- running as it can still attach the trigger.
    execute format('grant execute on routine %s to service_role', fn.sig);
    n := n + 1;
  end loop;

  raise notice 'trigger functions closed to public/anon/authenticated: %', n;
end $$;

-- ----------------------------------------------------------------------
-- 4. Say what the result was
-- ----------------------------------------------------------------------
-- A migration that reports "Success" and leaves the thing it was written
-- to fix half-done is the shape this whole file exists because of. This
-- counts what is left and names it.
do $$
declare
  leftovers text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
    into leftovers
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and (has_table_privilege('anon', c.oid, 'select')
       or has_table_privilege('anon', c.oid, 'insert')
       or has_table_privilege('anon', c.oid, 'update')
       or has_table_privilege('anon', c.oid, 'delete')
       or exists (select 1
                    from pg_attribute a
                   where a.attrelid = c.oid
                     and a.attnum > 0
                     and a.attacl::text like '%anon=%'));

  raise notice 'anon can still reach: %', leftovers;

  -- Loud, not silent. The keep list is one table; anything else surviving
  -- the loop above means the loop did not run over it, and finding that
  -- out from a NOTICE nobody read is how this file became necessary.
  if not (leftovers <@ array['help_articles']::text[]) then
    raise exception
      'anon still holds grants outside the keep list: %', leftovers;
  end if;
end $$;

notify pgrst, 'reload schema';
