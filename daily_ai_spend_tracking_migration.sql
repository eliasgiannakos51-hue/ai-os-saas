-- ============================================================================
-- Platform-wide AI cost/abuse circuit breaker — standalone, additive
-- migration. Requires rate_limit_log (base schema) to already exist,
-- since the circuit breaker layers on top of checkRateLimit for two of
-- its three checks (see lib/ai-circuit-breaker.ts). Safe to run on a
-- project that already has the base schema; every statement is
-- idempotent.
-- ============================================================================

create table if not exists public.daily_ai_spend_tracking (
  date date primary key,
  total_calls integer not null default 0,
  estimated_cost numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.daily_ai_spend_tracking enable row level security;

-- SUPERSEDED, in part, by supabase/migrations/20260813_atomic_daily_ai_spend.sql.
-- That migration re-declares this table (idempotently, so applying it after
-- this file is harmless) and adds increment_daily_ai_spend, which is what
-- lib/ai-circuit-breaker.ts now calls. The counter used to be maintained by a
-- read-modify-write in the application, which lost increments under exactly
-- the concurrent load the breaker exists to catch. Run that migration too.
