-- ============================================================================
-- feature_cost_stats — what an action REALLY costs, as an aggregate only.
--
-- WHY THIS EXISTS. The pricing page now says what a plan buys ("~19
-- websites a month") instead of only how many credits it grants. That
-- claim has to be derived from what those actions have actually cost, or
-- it is a guess dressed as a fact.
--
-- WHY IT IS A FUNCTION AND NOT A QUERY. ai_cost_log is RLS'd to
-- select-own, so no request-scoped client can compute a cross-account
-- median — correctly, because the rows are per user. This function is
-- `security definer` so it can read across accounts, and it returns ONLY
-- aggregates: feature, sample count, median, p80. There is no column in
-- its result that could identify anyone, and no argument that could be
-- used to filter down to one person.
--
-- Median, not average: one runaway generation must not make a plan look
-- half as capable as it is, and one trivial retry must not make it look
-- twice as capable. p80 is returned alongside so the pre-flight warning
-- can quote a figure that is right four times out of five rather than
-- one that is right half the time.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

create or replace function public.feature_cost_stats(p_days integer default 90)
returns table (
  feature text,
  samples bigint,
  median_usd numeric,
  p80_usd numeric
)
language sql
security definer
-- Empty search_path: a security definer function that resolves unqualified
-- names against the caller's search_path can be pointed at a different
-- table by anyone who can create a schema. Every name below is qualified.
set search_path = ''
stable
as $$
  select
    l.feature,
    count(*)                                                             as samples,
    percentile_cont(0.5) within group (order by l.real_cost_usd)::numeric as median_usd,
    percentile_cont(0.8) within group (order by l.real_cost_usd)::numeric as p80_usd
  from public.ai_cost_log l
  where l.created_at >= now() - make_interval(days => greatest(1, least(365, coalesce(p_days, 90))))
    -- Zero-cost rows are calls that never reached the API (an aborted
    -- stream, a cache-only turn). Counting them drags every median toward
    -- zero and would make the product look cheaper to run than it is.
    and l.real_cost_usd > 0
  group by l.feature;
$$;

-- service_role only. The anon and authenticated roles have no business
-- reading platform-wide cost aggregates, and the one caller
-- (lib/billing/measured-costs.ts) is server-only.
revoke all on function public.feature_cost_stats(integer) from public;
revoke all on function public.feature_cost_stats(integer) from anon;
revoke all on function public.feature_cost_stats(integer) from authenticated;
grant execute on function public.feature_cost_stats(integer) to service_role;

-- The function scans a trailing window and groups by feature; this index
-- matches that exactly. (ai_cost_log_feature_created_at_idx already exists
-- for the margin report and is leading-column `feature`, which does not
-- serve a date-range scan across all features.)
create index if not exists ai_cost_log_created_at_idx
  on public.ai_cost_log (created_at desc);

-- ----------------------------------------------------------------------------
-- Verification. After running the above, this should return one row per
-- feature that has real settled cost in the last 90 days. An empty result
-- is not an error on a fresh project — the app falls back to its
-- estimator and says so.
-- ----------------------------------------------------------------------------
select * from public.feature_cost_stats(90) order by samples desc;
