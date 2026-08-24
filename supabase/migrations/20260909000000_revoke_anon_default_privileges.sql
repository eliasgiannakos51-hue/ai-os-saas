-- ============================================================================
-- THE DEFAULT PRIVILEGES, ALL OF THEM THIS TIME
-- ============================================================================
--
-- 20260906000000 section 2 wrote three plain statements:
--
--     alter default privileges in schema public revoke all on tables from anon;
--     alter default privileges in schema public revoke all on sequences from anon;
--     alter default privileges in schema public revoke all on functions from anon;
--
-- They ran without error and left twelve default-privilege entries in place.
-- That is not a Supabase quirk; it is what those statements mean, and the
-- shape of the mistake is worth writing down because it is easy to repeat.
--
-- A ROW IN pg_default_acl IS KEYED ON THREE THINGS: the role that will
-- create the object (defaclrole), the schema it will be created in
-- (defaclnamespace, ZERO meaning "any schema"), and the object type
-- (defaclobjtype). `ALTER DEFAULT PRIVILEGES` with no FOR ROLE targets only
-- the CURRENT role, and with `IN SCHEMA public` only that one schema. So
-- those three statements addressed exactly one of the several combinations
-- that exist in a Supabase project.
--
-- MEASURED ON PostgreSQL 16, against a reproduction of the Supabase shape —
-- seven anon defaults, then the three plain statements above:
--
--   BEFORE                                        AFTER the three statements
--   postgres       | (GLOBAL)    | tables         postgres       | (GLOBAL)    | tables   <- LEFT
--   postgres       | extensions  | tables         postgres       | extensions  | tables   <- LEFT
--   postgres       | public      | sequences      supabase_admin | public      | sequences<- LEFT
--   postgres       | public      | functions      supabase_admin | public      | tables   <- LEFT
--   postgres       | public      | tables
--   supabase_admin | public      | sequences
--   supabase_admin | public      | tables
--
-- Three of seven removed. And the consequence is not cosmetic: a table
-- created in public straight afterwards came out with
-- has_table_privilege('anon', ..., 'select') = TRUE and 'delete' = TRUE,
-- because a GLOBAL default — defaclnamespace = 0 — applies to EVERY schema
-- and was never addressed by `in schema public`. Revoking the global one
-- turned the next table's anon select to FALSE. A table created by
-- supabase_admin came out granted too, from its own surviving row.
--
-- SO THIS FILE DOES NOT GUESS THE COMBINATIONS. It reads them out of
-- pg_default_acl and issues the statement that matches each row —
-- FOR ROLE from defaclrole, IN SCHEMA from defaclnamespace (omitted when
-- it is zero), and the object-type keyword from defaclobjtype.
--
-- WHAT IT CANNOT DO, and says so rather than failing. `ALTER DEFAULT
-- PRIVILEGES FOR ROLE x` requires membership in x. In a hosted Supabase
-- project the SQL editor runs as `postgres`, which is not a member of every
-- internal role. A row it cannot touch is COUNTED AND NAMED at the end
-- rather than swallowed — an incomplete sweep that reports success is how
-- the first attempt got here.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

do $$
declare
  r record;
  kind text;
  stmt text;
  n_done int := 0;
  n_denied int := 0;
  denied text[] := '{}';
begin
  for r in
    select
      d.defaclrole::regrole::text            as owner_role,
      d.defaclnamespace                      as ns_oid,
      n.nspname                              as ns_name,
      d.defaclobjtype                        as objtype
    from pg_default_acl d
    left join pg_namespace n on n.oid = d.defaclnamespace
    -- `anon=` is how a grant to that role is spelled inside an aclitem
    -- array. Matching the role NAME anywhere in the text would also match
    -- a grantor column, which is a different thing entirely.
    where d.defaclacl::text like '%anon=%'
    order by 1, 3, 4
  loop
    kind := case r.objtype
              when 'r' then 'TABLES'
              when 'S' then 'SEQUENCES'
              when 'f' then 'FUNCTIONS'
              when 'T' then 'TYPES'
              when 'n' then 'SCHEMAS'
              else null
            end;
    -- An object type this file does not know how to spell is reported, not
    -- skipped silently. There are five in PostgreSQL 16; a sixth would make
    -- this loop quietly incomplete otherwise.
    if kind is null then
      n_denied := n_denied + 1;
      denied := denied || format('%s: unknown objtype %L', r.owner_role, r.objtype);
      continue;
    end if;

    -- SCHEMAS defaults are never schema-scoped; ns_oid is 0 for them, so
    -- the same branch below already produces the right statement.
    stmt := format(
      'alter default privileges for role %s%s revoke all on %s from anon',
      r.owner_role,
      case when r.ns_oid = 0 then '' else format(' in schema %I', r.ns_name) end,
      kind
    );

    begin
      execute stmt;
      n_done := n_done + 1;
    exception
      when insufficient_privilege then
        n_denied := n_denied + 1;
        denied := denied || format('%s / %s / %s', r.owner_role,
                                   coalesce(r.ns_name, '(any schema)'), kind);
    end;
  end loop;

  raise notice 'anon default privileges revoked on % entr(ies)', n_done;
  if n_denied > 0 then
    raise notice 'COULD NOT TOUCH % entr(ies): %', n_denied, denied;
    raise notice 'run those as a role that is a member of the owner, or from the Supabase dashboard';
  end if;
end $$;

-- ----------------------------------------------------------------------
-- Prove it, on a real table rather than on the catalogue
-- ----------------------------------------------------------------------
-- The catalogue can look clean while a default still applies — that is
-- exactly what happened the first time, where three of seven rows went and
-- the next table was still granted. So this creates a table, asks whether
-- anon can read it, and drops it again.
--
-- A temporary NAME, not a temporary TABLE: `create temp table` lands in
-- pg_temp, which has its own default privileges and would answer a
-- different question from the one being asked.
do $$
declare
  can_select boolean;
  can_insert boolean;
  leftovers int;
begin
  -- DROPPED FIRST, AND CREATED WITH IF NOT EXISTS. Caught by
  -- db-migrations.test.mjs, which is right for a reason beyond style: a run
  -- that died between the create and the drop below would leave the probe
  -- table behind, and the next run would fail on a name collision — a
  -- migration that cannot be re-run after an interrupted attempt is not
  -- idempotent. The drop also means the probe never inspects a table left
  -- over from an older run with older privileges.
  execute 'drop table if exists public.zz_anon_default_probe';
  execute 'create table if not exists public.zz_anon_default_probe (a int)';
  can_select := has_table_privilege('anon', 'public.zz_anon_default_probe', 'select');
  can_insert := has_table_privilege('anon', 'public.zz_anon_default_probe', 'insert');
  execute 'drop table if exists public.zz_anon_default_probe';

  select count(*) into leftovers
    from pg_default_acl
   where defaclacl::text like '%anon=%';

  raise notice 'probe table: anon select=%, insert=%; % anon default entr(ies) left',
    can_select, can_insert, leftovers;

  -- THE PROBE IS THE AUTHORITY, not the count. A leftover row owned by a
  -- role this connection cannot reach is a real problem to report, but it
  -- only bites if it actually grants the next table — and the probe is the
  -- only thing that answers that.
  if can_select or can_insert then
    raise exception
      'a new table in public is still reachable by anon (select=%, insert=%) — % default entr(ies) remain',
      can_select, can_insert, leftovers;
  end if;
end $$;

notify pgrst, 'reload schema';
