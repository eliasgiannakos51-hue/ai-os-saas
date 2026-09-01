-- THE RATE LIMIT COULD BE STEPPED OVER BY DOING THINGS AT THE SAME TIME.
--
-- checkRateLimit() in src/lib/rate-limit.ts was a read-then-write across
-- two round trips: SELECT count(*), decide, INSERT. Fifty concurrent
-- requests all run their SELECT before any of the INSERTs commit, so all
-- fifty read the same number, all fifty are under the limit, and all fifty
-- are allowed. The limit is enforced against SERIAL traffic only.
--
-- WHY THAT IS NOT A DETAIL. lib/ai-circuit-breaker.ts is built on this
-- function. Its per-user cap is 20 AI calls an hour, and that number is
-- what stops one account from consuming MAX_DAILY_AI_CALLS (default 5000)
-- — the budget every user shares. With the cap enforced, one account can
-- reach at most 20 x 24 = 480 calls a day and cannot exhaust the platform.
-- Without it, one account with a loop and some concurrency can.
--
-- The same function also backs signup, login-failure, checkout and
-- password-reset limits, where the amplification is brute-force attempts
-- rather than money.
--
-- THE FIX IS A LOCK, NOT A CONSTRAINT. A unique index cannot express
-- "at most N rows in a rolling window". An advisory lock keyed on the
-- (scope, identifier) pair makes count-and-insert atomic for that pair
-- while leaving every other pair to run in parallel, which is what a rate
-- limiter needs: contention only between requests that were competing for
-- the same bucket anyway.
--
-- Idempotent. Creates nothing that is dropped, and leaves the table,
-- its index and its RLS exactly as they were.

create or replace function public.consume_rate_limit(
  p_scope text,
  p_identifier text,
  p_max_attempts integer,
  p_window_minutes integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_count integer;
  v_max integer := greatest(coalesce(p_max_attempts, 0), 0);
  v_window integer := greatest(coalesce(p_window_minutes, 1), 1);
begin
  if p_scope is null or p_identifier is null then
    -- Fails OPEN, matching the application's tolerance: a malformed call
    -- must not be the reason a real user cannot sign up or pay.
    return true;
  end if;

  -- Transaction-scoped: released when this statement's implicit
  -- transaction ends, which for a PostgREST rpc call is immediately after
  -- it returns. Two keys hash to the same lock only by collision, and a
  -- collision costs serialisation, never correctness.
  perform pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_identifier, 0));

  select count(*) into v_count
    from public.rate_limit_log
   where scope = p_scope
     and identifier = p_identifier
     and created_at >= now() - make_interval(mins => v_window);

  if v_count >= v_max then
    return false;
  end if;

  insert into public.rate_limit_log (scope, identifier) values (p_scope, p_identifier);
  return true;
end;
$fn$;

comment on function public.consume_rate_limit(text, text, integer, integer) is
  'Atomic count-and-insert for rate_limit_log. Returns true when the caller is under the limit and a row has been recorded. Replaces a read-then-write that fifty concurrent requests could all pass.';

-- rate_limit_log has RLS enabled and NO policies: only the service role
-- ever touches it. security definer here is what lets this function do the
-- count and the insert; the grants below are what stop anybody else from
-- calling it. A browser session must not be able to burn another
-- identifier's allowance, or to read one back by timing.
revoke all on function public.consume_rate_limit(text, text, integer, integer) from public;
revoke all on function public.consume_rate_limit(text, text, integer, integer) from anon;
revoke all on function public.consume_rate_limit(text, text, integer, integer) from authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;
