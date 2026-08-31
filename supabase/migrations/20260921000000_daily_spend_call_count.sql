-- THE PLATFORM BREAKER WAS COUNTING ONE CALL PER ACTION, AND SOME ACTIONS
-- MAKE EIGHT.
--
-- increment_daily_ai_spend() adds exactly 1 to total_calls, because every
-- caller of it made exactly one provider call. Two families of work do
-- not fit that: a background job (lib/jobs/handlers/file-ask.ts,
-- create.ts) and a Deep Research chunk (lib/research/research.ts) make
-- several calls inside ONE settled action — a research report plans, then
-- answers up to six questions, then synthesises.
--
-- Those two families call this function ZERO times today, so the number
-- checkDailyPlatformCap() reads is low by whatever they spend. Making
-- them call it once each would swap one wrong number for another.
--
-- p_calls is added with a default of 1, so every existing caller keeps
-- its exact current behaviour and no call site has to change to stay
-- correct. The runners pass the accumulator's own callCount, which is the
-- number of provider responses actually recorded.
--
-- CLAMPED AT 0. A negative or null count must never DECREASE the day's
-- total: that would be a way to hide spend, and the breaker exists to see
-- it.
--
-- Idempotent: create or replace. The two-argument signature keeps working
-- because the new parameter has a default — but the grants below name the
-- THREE-argument signature, which is a different function as far as
-- Postgres privileges are concerned, so both are stated.

create or replace function public.increment_daily_ai_spend(
  p_estimated_cost numeric default 0,
  p_date date default (now() at time zone 'utc')::date,
  p_calls integer default 1
)
returns table (total_calls integer, estimated_cost numeric)
language sql
security definer
set search_path = public
as $$
  insert into public.daily_ai_spend_tracking as d (date, total_calls, estimated_cost, updated_at)
  values (p_date, greatest(coalesce(p_calls, 1), 0), coalesce(p_estimated_cost, 0), now())
  on conflict (date) do update
    set total_calls    = d.total_calls + greatest(coalesce(p_calls, 1), 0),
        estimated_cost = d.estimated_cost + coalesce(p_estimated_cost, 0),
        updated_at     = now()
  returning d.total_calls, d.estimated_cost;
$$;

-- Service-role only, same posture as the two-argument version this
-- replaces: this function writes the platform's own spend ledger, and a
-- logged-in user must never be able to move that number — inflating it
-- would let one account trip the platform-wide breaker for everybody.
revoke all on function public.increment_daily_ai_spend(numeric, date, integer) from public;
revoke all on function public.increment_daily_ai_spend(numeric, date, integer) from anon;
revoke all on function public.increment_daily_ai_spend(numeric, date, integer) from authenticated;
grant execute on function public.increment_daily_ai_spend(numeric, date, integer) to service_role;

-- The old two-argument function is now unreachable by name resolution
-- (Postgres picks the three-argument one, defaults and all) but it still
-- EXISTS, still holds its own grants, and would be picked by an explicit
-- ::numeric,::date call. Two functions with one name is how one of them
-- stops being the one that runs — and credit-flow.dbtest.mjs already
-- fails on any overloaded function in public.
drop function if exists public.increment_daily_ai_spend(numeric, date);
