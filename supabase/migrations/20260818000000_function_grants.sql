-- ============================================================================
-- EVERY FUNCTION: revoked from anon and authenticated, granted to
-- service_role. Applied in one place, over the whole schema.
--
-- WHY THIS IS NOT WRITTEN PER-MIGRATION
-- The standing rule is "always revoke execute from anon/authenticated on
-- every new function". It was being followed in ONE migration out of
-- fourteen. That is not a discipline problem to solve with more
-- discipline: a rule that has to be remembered thirteen more times will
-- be missed a fourteenth. This loops over pg_proc instead, so a function
-- added tomorrow by somebody who never read the rule is still covered the
-- next time migrations run.
--
-- WHAT POSTGRES DOES BY DEFAULT, and why it matters
-- EXECUTE on a new function is granted to PUBLIC automatically. In a
-- Supabase project PUBLIC includes anon — an unauthenticated visitor —
-- so every SECURITY DEFINER function is callable over PostgREST by
-- anybody who knows its name until something revokes it. That is exactly
-- how grant_credits ended up reachable by anon.
--
-- SCOPE. public schema only, and only routines this project owns.
-- Extension-owned functions (pg_trgm, unaccent, pgcrypto) are left alone:
-- they are not reachable as RPC endpoints and revoking from them breaks
-- the extensions' own operators.
--
-- FUNCTIONS, PROCEDURES AND AGGREGATES — all three, and the reason the
-- list is not just functions is that the first version of this file WAS
-- just functions. It filtered `prokind = 'f'`, which is exactly the shape
-- of oversight it exists to prevent: a rule that covers the case somebody
-- thought of. Measured on PostgreSQL 16 — a procedure and an aggregate
-- created beside a plain function came out of that loop still executable
-- by anon, while the function was locked.
--
-- The schema has no procedure and no aggregate today, so nothing was
-- exposed. The point is the first one somebody adds: `create procedure` is
-- ordinary SQL, PostgREST exposes procedures as RPC endpoints too, and
-- there would have been nothing to notice.
--
-- REVOKE ON ROUTINE rather than ON FUNCTION, because that is the spelling
-- that accepts all three.
--
-- IT RUNS LAST, and that is not cosmetic. This file was numbered
-- 20260804000002 to begin with, third in the order. Against a clean clone
-- the live gate then failed on two trigger functions —
-- touch_ai_jobs_updated_at and help_articles_touch_updated_at — because
-- the migrations that create them (20260812, 20260816) run AFTER it. A
-- loop over pg_proc can only cover what exists when the loop runs.
--
-- It looked fine during development for the worst possible reason: the
-- migrations had been run three times over to prove idempotency, and the
-- second pass covered what the first had missed. One clean pass is the
-- only honest test of ordering.
--
-- SO THE RULE FOR ANY MIGRATION THAT ADDS A FUNCTION: nothing to
-- remember, but this file has to run after it. Give the new migration a
-- timestamp before this one, or bump this one past it. The live half of
-- db-migrations.test.mjs fails loudly if neither happens — it asks the
-- database, not the files, which functions anon can execute.
--
-- IDEMPOTENT. REVOKE and GRANT are declarative — running this ten times
-- leaves the same grants as running it once.
-- ============================================================================

do $$
declare
  fn record;
  n_revoked int := 0;
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
      -- 'f' function, 'p' procedure, 'a' aggregate, 'w' window. Window
      -- functions in the public schema would be a surprise, and are
      -- included rather than argued about.
      and p.prokind in ('f', 'p', 'a', 'w')
  loop
    execute format('revoke all on routine %s from public', fn.sig);
    execute format('revoke all on routine %s from anon', fn.sig);
    execute format('revoke all on routine %s from authenticated', fn.sig);
    execute format('grant execute on routine %s to service_role', fn.sig);
    n_revoked := n_revoked + 1;
  end loop;
  raise notice 'routine grants normalised on % routine(s)', n_revoked;
end $$;

-- THE EXCEPTIONS, stated rather than assumed.
--
-- ONE function is called by the browser: search_headline, over PostgREST,
-- as the signed-in user. Accent-insensitive search over the caller's own
-- rows; it reads nothing RLS does not already gate, and it refuses a table
-- that is not RLS-secured rather than trusting its argument.
--
-- THE OTHER TWO ARE NOT CALLED BY ANYBODY. They are granted because
-- search_headline is SECURITY INVOKER: its body runs as `authenticated`,
-- and it calls search_fold, which calls immutable_unaccent. Without both
-- grants the browser gets "permission denied for function search_fold"
-- from inside a function it was allowed to call. Measured on PostgreSQL 16
-- by revoking search_fold and watching exactly that.
--
-- SO THE GRANT BELOW IS LOAD-BEARING ON search_headline STAYING INVOKER.
-- If it is ever made SECURITY DEFINER, its inner calls run as the definer
-- and these two grants become exposure with no purpose — delete them then.
-- The count was wrong here before ("two functions are called by the
-- browser", listing three), which is how a grant nobody could justify
-- would have survived.
do $$
begin
  if to_regprocedure('public.search_headline(text,text,text,int)') is not null then
    grant execute on function public.search_headline(text,text,text,int) to authenticated;
  end if;
  if to_regprocedure('public.search_fold(text)') is not null then
    grant execute on function public.search_fold(text) to authenticated;
  end if;
  if to_regprocedure('public.immutable_unaccent(text)') is not null then
    grant execute on function public.immutable_unaccent(text) to authenticated;
  end if;
end $$;
