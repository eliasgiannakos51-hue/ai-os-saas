-- ---------------------------------------------------------------------------
-- THE SECOND FUNCTION WITH THE search_all SHAPE, AND THE ONLY OTHER ONE.
--
-- After 20260911000000 fixed search_all, every SQL function in this schema was
-- asked the same question — not by reading the migrations, but by asking the
-- database:
--
--     select p.proname, l.lanname, p.proretset, p.proconfig
--       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       join pg_language l on l.oid = p.prolang
--      where n.nspname = 'public' and l.lanname = 'sql'
--        and p.proretset and p.proconfig is not null;
--
-- Fifteen came back. PostgreSQL will not inline any of them. But "cannot be
-- inlined" is not the same as "costs anything", so each was MEASURED: a twin
-- of every one was built with the SET clause stripped, and both were timed
-- against 50,000 rows of ai_cost_log and 2,000 agent_templates.
--
--   function                     with SET    inlined   overhead
--   match_agent_templates          110.98       3.29     107.69 ms
--   voice_usage_this_month           1.41       0.04       1.37 ms
--   badge_removals_due               2.19       2.14       0.05 ms
--   cost_hourly_calls               28.11      27.34       0.76 ms
--   cost_unpriced_usage             51.86      51.67       0.19 ms
--   mrr_inputs                       1.62       1.45       0.17 ms
--   cost_by_feature                 26.07      26.33      -0.26 ms
--   cost_by_user                    20.07      20.59      -0.53 ms
--   cost_daily_totals               27.25      29.91      -2.65 ms
--   cost_user_totals                13.38      14.58      -1.19 ms
--   pwa_adoption_summary             1.88       2.05      -0.17 ms
--   routing_savings                  1.74       1.89      -0.15 ms
--   routing_success_rates            2.00       2.18      -0.18 ms
--   subscription_cohort              2.41       2.84      -0.43 ms
--
-- ONE of the fifteen costs anything, and it costs 34x. The rule the numbers
-- describe is not "a SET clause is slow" — it is:
--
--     A SET clause hurts when the function takes a PARAMETER used against an
--     INDEXED predicate. Un-inlined, the body is planned once with that
--     parameter unknown, so the planner cannot fold it, cannot match the
--     index, and cannot push the LIMIT down. It walks everything.
--
-- The thirteen aggregates scan their whole table by design — there is no
-- index to lose and nothing to push down, so losing inlining costs nothing
-- measurable, and several came out marginally FASTER un-inlined. They are
-- left exactly as they are.
--
-- match_agent_templates is search_all's twin: a text query, a GIN index, and
-- a table that grows with the marketplace. voice_usage_this_month has the
-- same shape and saves 1.37 ms on a table that is one row per user per
-- month; like search_fold (0.87 ms), it is measured and left alone rather
-- than changed for a number that does not matter.
--
-- The fix is the same as search_all's: every built-in qualified with
-- pg_catalog so no search_path can reach the body, which is STRONGER than
-- pinning the path, and then the pin is unnecessary and the function inlines.
--
-- Idempotent: create or replace, and the grants are re-stated.
-- ---------------------------------------------------------------------------

create or replace function public.match_agent_templates(
  p_query text,
  p_limit integer default 5
)
returns table (
  slug text,
  title text,
  description text,
  task_pattern text,
  schedule_cron text,
  depth text,
  needs_web_search boolean,
  output_format text,
  use_count integer,
  rank real
)
language sql
stable
-- SECURITY INVOKER: the RLS policy on agent_templates is what decides which
-- templates a caller may see, and this function must not stand in front of it.
security invoker
-- NO `set search_path` — it is what stopped this function inlining, and every
-- name below is qualified so the path cannot reach it.
as $$
  with q as (
    select public.search_query(p_query) as tsq
  )
  select
    t.slug, t.title, t.description, t.task_pattern, t.schedule_cron,
    t.depth, t.needs_web_search, t.output_format, t.use_count,
    pg_catalog.ts_rank(t.document, q.tsq) as rank
  from public.agent_templates t, q
  where q.tsq is not null
    and t.document OPERATOR(pg_catalog.@@) q.tsq
  -- use_count breaks ties, so the shape people actually adopt rises.
  order by pg_catalog.ts_rank(t.document, q.tsq) desc, t.use_count desc, t.slug
  limit greatest(least(p_limit, 20), 1);
$$;

revoke all on function public.match_agent_templates(text, integer) from public;
revoke all on function public.match_agent_templates(text, integer) from anon;
grant execute on function public.match_agent_templates(text, integer) to authenticated;
grant execute on function public.match_agent_templates(text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- SELF-CHECK. proconfig empty is the whole point, and it is invisible in the
-- function's text.
-- ---------------------------------------------------------------------------
do $$
declare
  v_config text[];
  v_secdef boolean;
  anon_can boolean;
  auth_can boolean;
  v_rows   integer;
begin
  select p.proconfig, p.prosecdef into v_config, v_secdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'match_agent_templates';

  raise notice 'match_agent_templates: proconfig=% security_definer=%',
    coalesce(array_to_string(v_config, ','), '(none)'), v_secdef;

  if v_config is not null then
    raise exception
      'match_agent_templates still carries a SET clause (%) — it will not inline, and the marketplace search returns to 110ms',
      array_to_string(v_config, ',');
  end if;
  if v_secdef then
    raise exception 'match_agent_templates became SECURITY DEFINER — it would read past the RLS policy on agent_templates';
  end if;

  select has_function_privilege('anon', 'public.match_agent_templates(text, integer)', 'execute') into anon_can;
  select has_function_privilege('authenticated', 'public.match_agent_templates(text, integer)', 'execute') into auth_can;
  raise notice 'match_agent_templates grants: anon=% authenticated=%', anon_can, auth_can;
  if anon_can then
    raise exception 'match_agent_templates is executable by anon';
  end if;
  if not auth_can then
    raise exception 'match_agent_templates is NOT executable by authenticated — the marketplace search would stop working';
  end if;

  select count(*) into v_rows from public.match_agent_templates('zzz_no_such_template_zzz', 5);
  raise notice 'match_agent_templates smoke test returned % rows for a term that matches nothing', v_rows;
end;
$$;
