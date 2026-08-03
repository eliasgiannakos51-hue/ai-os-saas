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
