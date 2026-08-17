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
-- SCOPE. public schema only, and only functions this project owns.
-- Extension-owned functions (pg_trgm, unaccent, pgcrypto) are left alone:
-- they are not reachable as RPC endpoints and revoking from them breaks
-- the extensions' own operators.
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
      and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public', fn.sig);
    execute format('revoke all on function %s from anon', fn.sig);
    execute format('revoke all on function %s from authenticated', fn.sig);
    execute format('grant execute on function %s to service_role', fn.sig);
    n_revoked := n_revoked + 1;
  end loop;
  raise notice 'function grants normalised on % function(s)', n_revoked;
end $$;

-- THE EXCEPTIONS, stated rather than assumed.
--
-- Two functions are called by the browser through PostgREST as the signed-in
-- user, so they need EXECUTE for `authenticated` — and they are safe to
-- expose because each derives the caller's identity from auth.uid() rather
-- than taking a user id as an argument.
--
-- search_headline / search_fold: accent-insensitive search over the
-- caller's own rows. They read nothing that RLS does not already gate.
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
