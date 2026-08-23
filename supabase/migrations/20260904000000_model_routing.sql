-- =====================================================================
-- MODEL ROUTING AND THE INTELLIGENT ROUTER (V4 #34 + #35)
-- =====================================================================
--
-- ONE TABLE. Every routing decision and what came of it.
--
-- WHY A TABLE AT ALL, when ai_cost_log already records what every call
-- cost. Because the cost log records what HAPPENED and this records what
-- was DECIDED and why — the tier, the rule that chose it, the model that
-- was skipped, whether an escalation followed, and what the failed cheap
-- attempt cost us rather than the customer. None of that is derivable
-- afterwards, and without it the router cannot learn: the success rate
-- that feeds the next decision is an aggregate over exactly these rows.
--
-- THE ROW IS WRITTEN EVEN WHEN NOTHING WENT WRONG. A table that only
-- records failures reports a 0% success rate for every feature.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.

create table if not exists public.routing_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  -- The settlement feature string, so this joins to ai_cost_log and to
  -- the margin report without a second vocabulary.
  feature text not null,

  tier text not null check (tier in ('trivial', 'simple', 'complex', 'expert')),
  -- Which rule decided. An unexplained routing decision cannot be tuned,
  -- and this is the column that makes the dashboard answer "why".
  rule text not null,
  model_id text not null,

  -- Set when the router overrode the tier's own model, with what that
  -- model WOULD have cost. This is the cache-minimum trap made visible:
  -- a downgrade refused because it was more expensive leaves a row
  -- saying so, in euros.
  overridden_from text,
  would_have_cost_usd numeric(12, 8),

  prefix_tokens int not null default 0,
  cached boolean not null default false,
  estimated_input_cost_usd numeric(12, 8) not null default 0,

  -- What actually happened.
  succeeded boolean,
  failure_reason text,
  escalated_to text,
  -- What the customer paid, and what we swallowed for having tried the
  -- cheap model. THE SECOND NUMBER IS THE POINT: a router that saves
  -- money by charging users for its own failed guesses is not saving
  -- money, it is moving the cost.
  charged_usd numeric(12, 8) not null default 0,
  absorbed_usd numeric(12, 8) not null default 0,

  latency_ms int,
  at timestamptz not null default now()
);

create index if not exists routing_decisions_feature_model_idx
  on public.routing_decisions (feature, model_id, at desc);
create index if not exists routing_decisions_at_idx
  on public.routing_decisions (at desc);
create index if not exists routing_decisions_user_idx
  on public.routing_decisions (user_id, at desc);

alter table public.routing_decisions enable row level security;

-- DENY-ALL, like the other owner-only tables (V4 #26). "Owner" is decided
-- in TypeScript by isAdminEmail, and a second notion of owner living in
-- the database is one more thing to drift out of step with the first.
-- Reached only through createAdminClient(), behind that gate.
revoke all on public.routing_decisions from anon, authenticated;
grant all on public.routing_decisions to service_role;

-- ---------------------------------------------------------------------
-- What the router has learned.
--
-- SECURITY DEFINER over a deny-all table, so the aggregate can be read
-- by the server without granting anyone the rows. Returns one row per
-- (feature, model) with enough samples to mean something — the caller
-- applies the threshold, but a window is applied here because a model's
-- success rate from six months ago is not evidence about today.
-- ---------------------------------------------------------------------
create or replace function public.routing_success_rates(p_days int default 30)
returns table (
  feature text,
  model_id text,
  runs bigint,
  successes bigint,
  success_rate numeric
)
language sql
security definer
set search_path = public
stable
as $$
  select
    d.feature,
    d.model_id,
    count(*) as runs,
    count(*) filter (where d.succeeded) as successes,
    -- NULL, NEVER ZERO, when nothing conclusive ran. A rate of 0 would
    -- read as "this model always fails" and would push every route up a
    -- rung on no evidence at all.
    case when count(*) filter (where d.succeeded is not null) = 0 then null
         else round(
           count(*) filter (where d.succeeded)::numeric
             / count(*) filter (where d.succeeded is not null), 4)
    end as success_rate
  from public.routing_decisions d
  where d.at >= now() - make_interval(days => greatest(1, p_days))
  group by d.feature, d.model_id
$$;

revoke all on function public.routing_success_rates(int) from public, anon, authenticated;
grant execute on function public.routing_success_rates(int) to service_role;

-- ---------------------------------------------------------------------
-- What routing saved, and what it cost us.
-- ---------------------------------------------------------------------
create or replace function public.routing_savings(p_days int default 30)
returns table (
  model_id text,
  decisions bigint,
  charged_usd numeric,
  absorbed_usd numeric,
  overrides bigint,
  override_saving_usd numeric
)
language sql
security definer
set search_path = public
stable
as $$
  select
    d.model_id,
    count(*) as decisions,
    coalesce(sum(d.charged_usd), 0) as charged_usd,
    coalesce(sum(d.absorbed_usd), 0) as absorbed_usd,
    count(*) filter (where d.overridden_from is not null) as overrides,
    -- WHAT THE CACHE RULE SAVED. Each override row carries what the
    -- "cheaper" model would have cost; the difference is money that
    -- would have been spent believing a downgrade was a saving.
    coalesce(sum(
      case when d.overridden_from is not null
           then d.would_have_cost_usd - d.estimated_input_cost_usd
           else 0 end
    ), 0) as override_saving_usd
  from public.routing_decisions d
  where d.at >= now() - make_interval(days => greatest(1, p_days))
  group by d.model_id
$$;

revoke all on function public.routing_savings(int) from public, anon, authenticated;
grant execute on function public.routing_savings(int) to service_role;
