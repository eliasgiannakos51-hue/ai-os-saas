-- ============================================================================
-- THE EXTENSION FUNCTIONS ARE NOT anon's EITHER
-- ============================================================================
--
-- WHAT WAS MEASURED. A fresh database built from bootstrap-supabase.sql
-- plus every migration was asked which functions in `public` the `anon`
-- role may execute. The answer was SEVENTY-ONE.
--
-- None of them is ours — that number was asked again with extension-owned
-- functions excluded and came back ZERO, which is what
-- 20260818000000_function_grants and every migration since have kept
-- true. All seventy-one belong to pgcrypto (36), pg_trgm (31) and
-- unaccent (4), and they are executable by anon for a reason that has
-- nothing to do with this schema: CREATE EXTENSION grants EXECUTE on its
-- functions to PUBLIC, and `anon` is a member of PUBLIC like every other
-- role.
--
-- WHY IT MATTERS, and it is not the encryption. `crypt` and `hmac` are
-- pure computation over arguments the caller supplies; there is no key in
-- this database for them to leak. The exposure is CPU:
--
--     select crypt('x', gen_salt('bf', 31))
--
-- is 2^31 bcrypt rounds and will hold a connection for effectively ever.
-- PostgREST exposes `public` as an RPC surface, so anybody holding the
-- ANON key — which ships in the browser bundle, by design — can send
-- that. One request, one pinned worker, no authentication, nothing in any
-- rate limit this app owns because it never reaches this app.
--
-- WHAT THIS FILE DOES NOT KNOW, said plainly. On a real Supabase project
-- these extensions are usually already installed in the `extensions`
-- schema, and `create extension if not exists pgcrypto` in
-- 20260803000000_baseline_schema is then a no-op that leaves them there —
-- in which case the loop below finds nothing and this migration changes
-- nothing. It was measured on a plain PostgreSQL 16, where they land in
-- `public`. Which of the two the production database is, is a question
-- only the production database can answer:
--
--     select e.extname, n.nspname
--       from pg_extension e join pg_namespace n on n.oid = e.extnamespace
--      where e.extname in ('pgcrypto','pg_trgm','unaccent');
--
-- The migration is correct either way, which is the reason to ship it
-- rather than to go and look first.
--
-- WHY NOT `revoke ... from anon`. A privilege held through PUBLIC cannot
-- be revoked from one member of PUBLIC — PostgreSQL has no such
-- statement, and `revoke execute ... from anon` on a PUBLIC grant is a
-- silent no-op that leaves the privilege exactly where it was. The grant
-- has to come off PUBLIC and go back to the named roles that need it.
--
-- WHO NEEDS IT BACK, and why the list is exactly two:
--
--   authenticated  because gen_random_uuid() is the DEFAULT on most
--                  primary keys here, and a DEFAULT is evaluated as the
--                  INSERTING role. Without this grant every insert by a
--                  signed-in user fails with a permission error on a
--                  function they never named. That is the one way this
--                  migration could break the product, so it is the first
--                  thing granted.
--   service_role   every admin write, for the same reason. bypassrls
--                  bypasses row-level security and nothing else:
--                  function EXECUTE is still checked.
--
-- The owner keeps its own privilege regardless — revoking from PUBLIC
-- does not touch it — so migrations and the SQL editor are unaffected.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

do $extfns$
declare
  r record;
  n_revoked int := 0;
begin
  for r in
    select p.oid::regprocedure as ref
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
      -- deptype 'e' is "this object belongs to an extension". It is what
      -- separates the seventy-one from ours, and it is the difference
      -- between hardening an upstream default and quietly revoking a
      -- grant this schema made on purpose.
      join pg_depend d on d.objid = p.oid
                      and d.classid = 'pg_proc'::regclass
                      and d.deptype = 'e'
      join pg_extension e on e.oid = d.refobjid
     where ns.nspname = 'public'
       and e.extname in ('pgcrypto', 'pg_trgm', 'unaccent')
     order by 1
  loop
    execute format('revoke execute on function %s from public', r.ref);
    execute format('grant execute on function %s to authenticated', r.ref);
    execute format('grant execute on function %s to service_role', r.ref);
    n_revoked := n_revoked + 1;
  end loop;

  raise notice 'extension functions in public taken off PUBLIC: %', n_revoked;
end $extfns$;
