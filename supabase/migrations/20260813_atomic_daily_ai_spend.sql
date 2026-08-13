-- ============================================================================
-- Atomic daily AI-spend accounting.
--
-- DEFECT this replaces (lib/ai-circuit-breaker.ts, recordAiCallForDailySpend):
-- the platform-wide daily cap counter was a read-modify-write spread across
-- two round trips —
--
--     const { data: existing } = await admin
--       .from("daily_ai_spend_tracking").select("total_calls, estimated_cost")
--       .eq("date", today).maybeSingle();
--     await admin.from("daily_ai_spend_tracking")
--       .update({ total_calls: existing.total_calls + 1, ... })
--       .eq("date", today);
--
-- `existing.total_calls + 1` is computed in Node, from a value read in an
-- earlier round trip. Every call that reads between another call's SELECT and
-- its UPDATE writes the same number, and the later write silently wins. Under
-- any real concurrency the counter tracks "how many calls happened to be
-- serialised", not "how many calls happened".
--
-- That matters more than the old comment on it claimed. This counter is the
-- ONLY input to checkDailyPlatformCap — the platform-wide breaker that exists
-- specifically to contain a runaway spike, i.e. exactly the condition under
-- which concurrency (and therefore the undercount) is at its worst. The
-- breaker gets least accurate precisely when it is needed most, and
-- estimated_cost drifts the same way, so the number the owner reads as
-- "today's AI spend" is low by an unknown amount.
--
-- Same class of race that grant_credits_idempotent closed for credit grants,
-- and fixed the same way: one statement, evaluated by Postgres against the
-- row it is already locking, so nothing can go stale between the read and the
-- write.
--
-- Safe to run more than once.
-- ============================================================================

-- The table itself, repeated here so this migration can be applied to a
-- project that never ran daily_ai_spend_tracking_migration.sql. Identical
-- definition; `if not exists` makes it a no-op where it already exists.
create table if not exists public.daily_ai_spend_tracking (
  date date primary key,
  total_calls integer not null default 0,
  estimated_cost numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.daily_ai_spend_tracking enable row level security;


-- ----------------------------------------------------------------------------
-- increment_daily_ai_spend
--
-- Records exactly one AI call against a day's row, creating the row on the
-- first call of that day. Returns the post-increment totals so a caller that
-- wants to react to crossing the cap has a truthful number without a second
-- read.
--
-- p_date is passed in by the caller rather than defaulted to current_date on
-- purpose: the application keys this table by UTC date
-- (`new Date().toISOString().slice(0, 10)`), while current_date follows the
-- *session* TimeZone. Defaulting to current_date would mean the breaker's
-- reader and its writer could disagree about which row "today" is on any
-- connection whose TimeZone is not UTC. The default below is UTC-pinned for
-- the same reason, so even a caller that omits the argument agrees with
-- checkDailyPlatformCap.
--
-- The whole operation is ONE statement. `total_calls + 1` is evaluated by
-- Postgres against the row it holds a lock on during ON CONFLICT DO UPDATE,
-- so two concurrent calls serialise on that lock and both increments land.
-- ----------------------------------------------------------------------------
create or replace function public.increment_daily_ai_spend(
  p_estimated_cost numeric default 0,
  p_date date default (now() at time zone 'utc')::date
)
returns table (total_calls integer, estimated_cost numeric)
language sql
security definer
set search_path = public
as $$
  insert into public.daily_ai_spend_tracking as d (date, total_calls, estimated_cost, updated_at)
  values (p_date, 1, coalesce(p_estimated_cost, 0), now())
  on conflict (date) do update
    set total_calls    = d.total_calls + 1,
        estimated_cost = d.estimated_cost + coalesce(p_estimated_cost, 0),
        updated_at     = now()
  returning d.total_calls, d.estimated_cost;
$$;


-- Service-role only, same posture as grant_credits_idempotent /
-- reserve_credits: this function writes the platform's own spend ledger, and
-- a logged-in user must never be able to move that number — inflating it
-- would let one account trip the platform-wide breaker for everybody.
revoke all on function public.increment_daily_ai_spend(numeric, date) from public;
revoke all on function public.increment_daily_ai_spend(numeric, date) from anon;
revoke all on function public.increment_daily_ai_spend(numeric, date) from authenticated;
grant execute on function public.increment_daily_ai_spend(numeric, date) to service_role;
