-- ============================================================================
-- THE authenticated HALF OF A JOB THAT WAS ONLY HALF DONE
-- ============================================================================
--
-- WHAT WAS FOUND, AND HOW. 20260906000000_revoke_anon_grants.sql removed
-- seventy-eight tables' worth of grants that Supabase's
--
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES
--         TO anon, authenticated, service_role
--
-- had handed to `anon`. It named the right defect and fixed exactly half
-- of it: the same default privilege grants the same four verbs to
-- `authenticated`, and nothing revoked those.
--
-- db_exposure_report() has counted this since 20260917 under
-- `grant_without_policy` and reported ZERO — because the local throwaway
-- database that db-exposure.dbtest.mjs runs it against was built by
-- scripts/db/bootstrap-supabase.sql, which set no default privileges at
-- all. The stub was a database far more locked down than production, so
-- the check passed for a reason production does not have. It went red the
-- moment the stub was corrected: 89 (table, verb) pairs.
--
-- WHY IT MATTERS, in the words of the anon migration, which measured it:
--
--     RLS ON,  0 policies, full grants -> select returns 0 rows
--     RLS OFF,             full grants -> select returns EVERY ROW
--
-- The grant is the loaded half and RLS is the safety catch. `user_credits`,
-- `credit_transactions`, `ai_cost_log`, `affiliate_payouts` and
-- `production_errors` are all on this list.
--
-- WHY REVOKING CANNOT BREAK ANYTHING, and this is stronger than the
-- argument the anon migration had to make. Every pair below is one where
-- NO POLICY COVERS THAT COMMAND — that is the predicate that selects it.
-- With row level security on and no policy, the operation is already
-- denied for `authenticated`; revoking the grant changes a request that
-- fails into a request that fails. Server-side paths are untouched:
-- service_role bypasses RLS and its grants, and SECURITY DEFINER functions
-- run as their owner.
--
-- WHAT IS DELIBERATELY NOT DONE. The default privilege itself is left in
-- place for `authenticated`. Removing it would silently change what every
-- future `create table` inherits; leaving it means a new table with an
-- uncovered verb turns `grant_without_policy` red, which is the behaviour
-- worth having.
--
-- Idempotent: REVOKE on a privilege the role does not hold is a no-op, and
-- the predicate re-derives the set each time. No DROP, no TRUNCATE, no
-- unqualified DELETE.
-- ============================================================================

do $$
declare
  r record;
  n_done int := 0;
begin
  for r in
    select c.relname, v.verb
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('select', 'SELECT'), ('insert', 'INSERT'),
                         ('update', 'UPDATE'), ('delete', 'DELETE')) v(verb, pcmd)
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relrowsecurity
       and has_table_privilege('authenticated', c.oid, v.verb)
       and not exists (
         select 1 from pg_policies p
          where p.schemaname = 'public'
            and p.tablename = c.relname
            and (p.cmd = v.pcmd or p.cmd = 'ALL'))
     order by c.relname, v.verb
  loop
    -- REVOKED FROM anon TOO, unconditionally. It is a no-op after
    -- 20260906000000, and the cost of writing it is one word against the
    -- cost of a table created between the two migrations.
    execute format('revoke %s on table public.%I from authenticated, anon', r.verb, r.relname);
    n_done := n_done + 1;
  end loop;
  raise notice 'revoked % (table, verb) pair(s) that no policy covered', n_done;
end $$;
