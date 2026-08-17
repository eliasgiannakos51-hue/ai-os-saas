-- ============================================================================
-- REMOVE THE STALE grant_credits_idempotent OVERLOAD.
--
-- FOUND BY RUNNING IT, not by reading it. The credit-flow integration test
-- called the function with eight arguments and Postgres refused:
--
--   ERROR: function grant_credits_idempotent(...) is not unique
--   HINT:  Could not choose a best candidate function.
--
-- WHY THERE ARE TWO
-- 20260805_idempotent_credit_grants.sql created the eight-argument version.
-- 20260815_purchased_credits.sql then used CREATE OR REPLACE to add a ninth
-- argument, p_purchased. A different argument list is a different function
-- in Postgres, so REPLACE created a second one instead of replacing the
-- first. Both have been live ever since.
--
-- WHY IT MATTERS, beyond the ambiguity
-- The eight-argument version does not mention purchased_credits ANYWHERE.
-- Credits granted through it land as an ordinary monthly allowance — so a
-- pack a customer paid for is not marked as purchased, and the next
-- monthly reset wipes it. That is the same shape as the 4,400 credits that
-- were destroyed before: money the customer paid for, deleted by a routine
-- job, with nothing in the logs saying why.
--
-- NOTHING CALLS IT TODAY. src/lib/billing/credits.ts is the only caller in
-- the codebase and it always passes p_purchased, which resolves to the
-- nine-argument version. This is a loaded gun, not a fired one — and the
-- reason to remove it now is that the next caller written by somebody who
-- reads the eight-argument signature in a migration file will fire it.
--
-- DROP FUNCTION, not DROP TABLE. No row is touched. The signature is named
-- in full so this cannot take the version that is in use, and IF EXISTS
-- makes it a no-op on a database where it has already gone.
-- ============================================================================

drop function if exists public.grant_credits_idempotent(
  uuid, integer, text, text, text, integer, text, timestamp with time zone
);

-- The survivor keeps the grants the previous migration set on it, but
-- 20260818000000_function_grants.sql loops over every function in the
-- schema anyway, and is dated to run LAST for exactly that reason — so this
-- is belt and braces rather than the primary control.
do $$
begin
  if to_regprocedure('public.grant_credits_idempotent(uuid,integer,text,text,text,integer,text,timestamptz,boolean)') is not null then
    revoke all on function public.grant_credits_idempotent(uuid,integer,text,text,text,integer,text,timestamptz,boolean) from public, anon, authenticated;
    grant execute on function public.grant_credits_idempotent(uuid,integer,text,text,text,integer,text,timestamptz,boolean) to service_role;
  end if;
end $$;
