-- HOTFIX — close the execute grant, now.
--
-- Standalone. Idempotent. No DROP TABLE, no TRUNCATE, no DELETE, no data
-- touched at all: it only removes privileges and one stale function
-- signature. Safe to run before, after, or instead of the full migration.
do $hotfix$
declare
  fn text;
begin
  foreach fn in array array[
    'public.grant_credits_idempotent(uuid, integer, text, text, text, integer, text, timestamptz, boolean)',
    'public.reset_monthly_credits(uuid, integer, text)',
    'public.reset_monthly_credits_for_unbilled(date)',
    'public.deduct_credits_atomic(uuid, integer, integer, text)',
    'public.settle_reservation(uuid, uuid, integer, text, integer, integer, integer, integer, integer, integer, numeric, numeric, numeric, numeric, jsonb, jsonb)'
  ]
  loop
    -- to_regprocedure returns null instead of raising when the signature is
    -- absent, so this runs on a database at any point in the migration
    -- history rather than aborting on the first function it cannot find.
    if to_regprocedure(fn) is not null then
      execute format('revoke all on function %s from public', fn);
      if exists (select 1 from pg_roles where rolname = 'anon') then
        execute format('revoke all on function %s from anon', fn);
      end if;
      if exists (select 1 from pg_roles where rolname = 'authenticated') then
        execute format('revoke all on function %s from authenticated', fn);
      end if;
      if exists (select 1 from pg_roles where rolname = 'service_role') then
        execute format('grant execute on function %s to service_role', fn);
      end if;
      raise notice 'locked down %', fn;
    end if;
  end loop;
end
$hotfix$;

-- The stale eight-argument overload. Adding p_purchased created a SECOND
-- function rather than replacing this one, and because the new parameter
-- has a default, an eight-argument call now matches both and PostgreSQL
-- refuses to choose:
--
--   ERROR:  function public.grant_credits_idempotent(...) is not unique
--
-- Dropped by exact signature. This is a `drop function`: it removes a row
-- from pg_proc and touches no table, no column and no data.
drop function if exists public.grant_credits_idempotent(
  uuid, integer, text, text, text, integer, text, timestamptz
);
