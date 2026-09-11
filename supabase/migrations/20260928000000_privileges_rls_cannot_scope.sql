-- ============================================================================
-- THE THREE VERBS ROW LEVEL SECURITY DOES NOT COVER, AND WHO WAS HOLDING THEM
-- ============================================================================
--
-- HOW THIS WAS FOUND. Every privilege check in this repository asked a
-- yes/no question about a role somebody had thought of in advance:
-- has_function_privilege('anon', ...), grantee = 'authenticated',
-- anon_readable_relations. Asking the database the other question instead
-- — "list every grantee you hold, on every facet" — returned this, on a
-- freshly built database with all 66 migrations applied:
--
--     authenticated  TRUNCATE    on 102 relations in public
--     authenticated  TRIGGER     on 102
--     authenticated  REFERENCES  on 102
--     authenticated  UPDATE      on 2 sequences
--     anon           TRUNCATE    on public.help_articles
--     anon           TRIGGER     on public.help_articles
--     anon           REFERENCES  on public.help_articles
--
-- None of it was granted by a migration. It is the remainder of Supabase's
--
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES
--         TO anon, authenticated, service_role
--
-- after 20260906000000 swept anon and 20260926000000 swept the four verbs
-- a policy can cover. `ALL` is seven verbs. Both sweeps were written about
-- four of them, so three were never in either predicate — and 20260906's
-- keep list, which exists so `help_articles` STAYS READABLE, kept all
-- seven on that one table rather than the one it meant.
--
-- WHY THE OTHER THREE ARE NOT THE SAME KIND OF GRANT. Row level security
-- is what makes SELECT, INSERT, UPDATE and DELETE safe to grant here: the
-- policy decides which rows. It does not apply to these:
--
--     begin;
--     set local role authenticated;
--     truncate table public.chat_messages;   -- TRUNCATE TABLE
--     rollback;
--
-- Measured on PostgreSQL 16.13 against this schema on 2026-09-07, with
-- relrowsecurity = true on that table and its `user_id = auth.uid()`
-- policies in place. TRUNCATE succeeded. It is not filtered by a policy,
-- it does not fire row triggers, and it does not report which rows it
-- removed, because it removes all of them.
--
-- WHAT IS NOT CLAIMED. I could not show a path from a browser to that
-- statement. PostgREST issues SELECT, INSERT, UPDATE and DELETE, and
-- exposes functions as RPC; no function in this schema truncates
-- anything, and `truncate` is not something the REST interface can be
-- made to emit. So this is a privilege held far beyond anything the
-- product needs, on a hundred tables, that nothing in this repository was
-- able to see — not a demonstrated exploit. Both halves of that sentence
-- are the point: the reason it went unnoticed for a hundred tables is
-- exactly that every instrument was looking somewhere else.
--
-- TRIGGER and REFERENCES are the quieter two. TRIGGER lets a role attach
-- a trigger function to a table; it is unusable today only because
-- `authenticated` cannot CREATE in schema public (PostgreSQL 15 stopped
-- granting that to PUBLIC) and holds EXECUTE on no function returning
-- `trigger` — two conditions neither of which this project chose, and
-- either of which a later migration could change without anybody
-- connecting it to this. REFERENCES lets a role point a foreign key at
-- the table, which leaks the existence of values it cannot read.
--
-- UPDATE ON A SEQUENCE is the fourth. USAGE is what nextval() needs and
-- it stays; UPDATE is what setval() needs, and a role that can setval a
-- bigserial primary key backwards makes every subsequent insert collide.
-- Nothing in this product calls setval as a user.
--
-- WHY REVOKING CANNOT BREAK ANYTHING. There is no TRUNCATE, no CREATE
-- TRIGGER, no foreign key creation and no setval anywhere in src/ — the
-- application speaks to PostgREST, which emits none of them. Server-side
-- work runs as service_role, which is untouched here and bypasses RLS
-- anyway, and SECURITY DEFINER functions run as their owner. Measured
-- rather than argued: with these revokes applied, every suite
-- `npm run test:db` runs passes unchanged — including
-- user-isolation.dbtest.mjs's two-account probe over every user-owned
-- table, and nav-events/transition-suggestions, whose inserts are the two
-- that call nextval on a sequence this file touches.
--
-- WHAT KEEPS IT FROM COMING BACK. Section 3 takes the same three verbs
-- off the DEFAULT privilege, so the next `create table` does not inherit
-- them. 20260926000000 deliberately did NOT do that for its four verbs,
-- and its reason was good — a new table with an uncovered verb should
-- turn `grant_without_policy` red rather than arrive silently locked. It
-- does not apply here: no policy can ever cover TRUNCATE, so there is no
-- red to wait for.
--
-- AND WHAT WATCHES IT. scripts/tests/role-grants.dbtest.mjs asks the
-- inverted question on every `npm run test:db` and compares the answer
-- against a named list; `npm run db:grants -- --sql` is the same question
-- as one read-only query to paste into the production SQL editor.
--
-- Idempotent: REVOKE of a privilege the role does not hold is a no-op.
-- No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

-- ----------------------------------------------------------------------
-- 1. Every relation in public
-- ----------------------------------------------------------------------
-- UNCONDITIONAL, not filtered by has_table_privilege, for the reason
-- 20260906000000 wrote down: the privilege check answers FALSE for a
-- column-level grant, so filtering on it skips exactly the cases hardest
-- to see by hand. A no-op costs nothing.
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select c.oid::regclass as ref
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm', 'f')
     order by 1
  loop
    execute format('revoke truncate, references, trigger on table %s from authenticated, anon', r.ref);
    n := n + 1;
  end loop;
  raise notice 'truncate/references/trigger revoked on % relation(s)', n;
end $$;

-- ----------------------------------------------------------------------
-- 2. And the sequences
-- ----------------------------------------------------------------------
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select c.oid::regclass as ref
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public'
       and c.relkind = 'S'
     order by 1
  loop
    -- USAGE STAYS. nextval() accepts USAGE or UPDATE; setval() requires
    -- UPDATE. Revoking only UPDATE leaves every insert working and takes
    -- away the one call that can renumber a primary key.
    execute format('revoke update on sequence %s from authenticated, anon', r.ref);
    n := n + 1;
  end loop;
  raise notice 'setval closed on % sequence(s)', n;
end $$;

-- ----------------------------------------------------------------------
-- 3. So the next table does not arrive holding them
-- ----------------------------------------------------------------------
-- Scoped to the role executing this file, which is the role that owns and
-- creates this project's objects. A default privilege set by a different
-- role is not reachable from here — and is exactly what
-- scripts/tests/role-grants.dbtest.mjs's `default` facet reports, so it
-- becomes a visible row rather than a silent inheritance.
alter default privileges in schema public
  revoke truncate, references, trigger on tables from authenticated, anon;
alter default privileges in schema public
  revoke update on sequences from authenticated, anon;
