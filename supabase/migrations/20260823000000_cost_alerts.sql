-- ============================================================================
-- COST ALERTS — the safety net, and the revenue figure it needs
-- ============================================================================
--
-- Three things, and the first one is the answer to a question that had no
-- good answer before.
--
-- ----------------------------------------------------------------------
-- 1. WHERE MONTHLY REVENUE COMES FROM
-- ----------------------------------------------------------------------
-- A subscriber's plan lives in auth.users.raw_user_meta_data ->>
-- 'subscription_tier'. That is not a cache of something else: it is the
-- value resolveEffectivePlan reads to decide what a customer may DO. The
-- Stripe webhook writes it, signup writes it, team invites write it.
--
-- WHY NOT A subscriptions TABLE. It would be a SECOND source of truth for
-- the same fact, and the failure mode of two sources is that they
-- disagree — most likely at a plan change, which is exactly when a
-- revenue figure matters. A billing alert computed from the copy that
-- does NOT gate features would report revenue for a tier the customer no
-- longer has. It would also need a backfill and a second write inside the
-- webhook, one more thing that can fail after the entitlement write
-- succeeded. An alert that lies about money is worse than no alert.
--
-- WHY NOT A VIEW EITHER. A view over auth.users exposes one ROW PER USER,
-- and then has to be locked down so nobody can read anybody else's plan.
-- Nothing here needs per-user rows: the alert needs a SUM. So this is an
-- aggregate function — it cannot enumerate customers even if its grants
-- were ever loosened by accident.
--
-- WHAT IT DELIBERATELY DOES NOT DO: price anything. Plan prices live in
-- lib/billing/plans.ts, where resolvePricingConfig can override them, and
-- duplicating them here would create the same two-sources problem one
-- level down. This returns COUNTS; the euros are computed in TypeScript.
--
-- SCALE, stated rather than discovered later: this scans auth.users once
-- per alert run (hourly). At tens of thousands of users that is
-- milliseconds. It stops being free somewhere in the millions, at which
-- point the answer is a materialised view refreshed on the same schedule
-- — not a table the webhook writes.
--
-- ----------------------------------------------------------------------
-- 2. AGGREGATES OVER ai_cost_log, computed in SQL
-- ----------------------------------------------------------------------
-- The margin report reads raw rows with .limit(20000) and groups them in
-- TypeScript. That is fine for a report a person is looking at: if it
-- truncates, the person sees a smaller number on a page they are already
-- reading sceptically.
--
-- It is NOT fine for an alert. A truncated read makes spend look LOWER
-- than it is, which is a false negative — the one failure mode a safety
-- net must not have, and a silent one. So the alerts aggregate in the
-- database, where there is no row limit to reach.
--
-- ----------------------------------------------------------------------
-- 3. THE RATE LIMIT, as a claim rather than a check
-- ----------------------------------------------------------------------
-- "At most one alert per type per hour" implemented as SELECT-then-INSERT
-- is a race: two runs overlapping (a retry, a slow run still finishing)
-- both see nothing and both send. record_cost_alert does the whole thing
-- in one INSERT ... WHERE NOT EXISTS and reports whether the row landed,
-- so the sender is whoever actually won.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

-- ----------------------------------------------------------------------
-- The alert log
-- ----------------------------------------------------------------------
create table if not exists public.cost_alert_log (
  id uuid primary key default gen_random_uuid(),
  -- 'daily_spend_spike', 'user_outlier', 'feature_margin',
  -- 'absorbed_refusals', 'provider_price_change', 'call_burst'.
  -- Text rather than an enum so a seventh alert does not need a
  -- migration — the same decision ai_jobs.kind made.
  alert_type text not null,
  -- What the alert said, so the dashboard can show history and a test can
  -- assert on the numbers that triggered it rather than on prose.
  payload jsonb not null default '{}'::jsonb,
  -- Whether the notification and the email actually went out. A row that
  -- claimed the rate-limit slot and then failed to send is the worst
  -- outcome: silent for an hour AND nothing delivered.
  delivered boolean not null default false,
  created_at timestamptz not null default now()
);

-- The rate-limit lookup: "has this type fired since <cutoff>".
create index if not exists cost_alert_log_type_created_idx
  on public.cost_alert_log (alert_type, created_at desc);

alter table public.cost_alert_log enable row level security;
-- NO POLICY AT ALL, deliberately. This table is owner-facing operational
-- data about every customer's spend; it is read through the admin client
-- by an owner-only page. RLS enabled with no policy means anon and
-- authenticated can reach exactly nothing, which is the intent stated in
-- the only way Postgres enforces.

-- ----------------------------------------------------------------------
-- Claim a rate-limit slot, atomically
-- ----------------------------------------------------------------------
create or replace function public.record_cost_alert(
  p_alert_type text,
  p_payload jsonb default '{}'::jsonb,
  p_min_interval_seconds integer default 3600
)
returns table (fired boolean, alert_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.cost_alert_log (alert_type, payload)
  select p_alert_type, coalesce(p_payload, '{}'::jsonb)
  where not exists (
    select 1 from public.cost_alert_log
    where alert_type = p_alert_type
      and created_at > now() - make_interval(secs => greatest(p_min_interval_seconds, 0))
  )
  returning id into v_id;

  return query select v_id is not null, v_id;
end;
$$;

create or replace function public.mark_cost_alert_delivered(p_alert_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.cost_alert_log set delivered = true where id = p_alert_id;
$$;

-- ----------------------------------------------------------------------
-- Revenue inputs — counts, never euros
-- ----------------------------------------------------------------------
create or replace function public.mrr_inputs()
returns table (tier text, billing_interval text, subscribers bigint, seats bigint)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(u.raw_user_meta_data ->> 'subscription_tier', 'free') as tier,
    coalesce(u.raw_user_meta_data ->> 'billing_interval', 'month') as billing_interval,
    count(*) as subscribers,
    -- A seat count of 0 or null still means the account itself, or a
    -- one-seat plan would contribute nothing.
    sum(greatest(coalesce((u.raw_user_meta_data ->> 'seat_count')::int, 1), 1)) as seats
  from auth.users u
  where u.deleted_at is null
  group by 1, 2;
$$;

-- ----------------------------------------------------------------------
-- Spend aggregates
-- ----------------------------------------------------------------------
create or replace function public.cost_daily_totals(p_days integer default 30)
returns table (day date, cost_eur numeric, calls bigint, credits_charged bigint)
language sql
security definer
set search_path = public
as $$
  select
    (created_at at time zone 'UTC')::date as day,
    sum(real_cost_eur) as cost_eur,
    count(*) as calls,
    sum(credits_charged)::bigint as credits_charged
  from public.ai_cost_log
  where created_at >= now() - make_interval(days => greatest(p_days, 1))
  group by 1
  order by 1;
$$;

create or replace function public.cost_by_feature(p_days integer default 30)
returns table (
  feature text,
  cost_eur numeric,
  calls bigint,
  credits_charged bigint,
  charged_calls bigint,
  margin_sum numeric
)
language sql
security definer
set search_path = public
as $$
  select
    feature,
    sum(real_cost_eur) as cost_eur,
    count(*) as calls,
    sum(credits_charged)::bigint as credits_charged,
    -- A bypass row stores achieved_margin null BY DESIGN, so the average
    -- has to divide by the rows that HAVE one, not by all of them.
    count(*) filter (where achieved_margin is not null) as charged_calls,
    coalesce(sum(achieved_margin) filter (where achieved_margin is not null), 0) as margin_sum
  from public.ai_cost_log
  where created_at >= now() - make_interval(days => greatest(p_days, 1))
  group by 1
  order by 2 desc;
$$;

create or replace function public.cost_by_user(p_days integer default 30, p_limit integer default 20)
returns table (user_id uuid, cost_eur numeric, calls bigint, credits_charged bigint)
language sql
security definer
set search_path = public
as $$
  select
    user_id,
    sum(real_cost_eur) as cost_eur,
    count(*) as calls,
    sum(credits_charged)::bigint as credits_charged
  from public.ai_cost_log
  where created_at >= now() - make_interval(days => greatest(p_days, 1))
  group by 1
  order by 2 desc
  limit greatest(p_limit, 1);
$$;

-- EVERY user's spend, for the outlier test. Not the top N: an average
-- computed from the top twenty spenders is an average of the top twenty
-- spenders, and everyone in it looks normal.
create or replace function public.cost_user_totals(p_days integer default 1)
returns table (user_id uuid, cost_eur numeric, calls bigint)
language sql
security definer
set search_path = public
as $$
  select user_id, sum(real_cost_eur) as cost_eur, count(*) as calls
  from public.ai_cost_log
  where created_at >= now() - make_interval(days => greatest(p_days, 1))
  group by 1;
$$;

create or replace function public.cost_hourly_calls(p_hours integer default 48)
returns table (hour timestamptz, calls bigint, cost_eur numeric)
language sql
security definer
set search_path = public
as $$
  select
    date_trunc('hour', created_at) as hour,
    count(*) as calls,
    sum(real_cost_eur) as cost_eur
  from public.ai_cost_log
  where created_at >= now() - make_interval(hours => greatest(p_hours, 1))
  group by 1
  order by 1;
$$;

-- Usage priced by GUESSWORK, which is the only observable proxy for a
-- provider's prices moving. Settlement already stores the model names in
-- metadata.unknownModels (see lib/billing/reservations.ts); this is the
-- window query nobody had, so an occurrence that went into the log
-- unread is still visible an hour later.
--
-- A change to a model we DO price is NOT detectable here and this
-- function does not pretend otherwise: every cost in this table is
-- computed from our own rate table, so it would carry on agreeing with
-- itself perfectly. See lib/billing/cost-alerts.ts.
create or replace function public.cost_unpriced_usage(p_hours integer default 24)
returns table (models text[], calls bigint, cost_eur numeric)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(array_agg(distinct m), array[]::text[]) as models,
    count(*) as calls,
    coalesce(sum(real_cost_eur), 0) as cost_eur
  from public.ai_cost_log l
  cross join lateral jsonb_array_elements_text(
    case
      when jsonb_typeof(l.metadata -> 'unknownModels') = 'array'
        then l.metadata -> 'unknownModels'
      else '[]'::jsonb
    end
  ) as m
  where l.created_at >= now() - make_interval(hours => greatest(p_hours, 1));
$$;

-- ----------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------
-- The standing rule, applied here rather than left to
-- 20260818000000_function_grants.sql — that file loops over pg_proc and
-- runs BEFORE this one, so it cannot cover functions this migration
-- creates. EXECUTE on a new function is granted to PUBLIC by default, and
-- in a Supabase project PUBLIC includes anon: without these lines every
-- function above is callable over PostgREST by an unauthenticated
-- visitor, and mrr_inputs would hand them the shape of the business.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'record_cost_alert(text, jsonb, integer)',
    'mark_cost_alert_delivered(uuid)',
    'mrr_inputs()',
    'cost_daily_totals(integer)',
    'cost_by_feature(integer)',
    'cost_by_user(integer, integer)',
    'cost_user_totals(integer)',
    'cost_hourly_calls(integer)',
    'cost_unpriced_usage(integer)'
  ]
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('revoke all on function public.%s from anon', fn);
    execute format('revoke all on function public.%s from authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
