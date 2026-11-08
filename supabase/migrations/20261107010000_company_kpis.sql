-- ---------------------------------------------------------------------------
-- COMPANY KPIS: twelve counts the company's own agents read once a day
-- (docs/PROGRESS.md 2026-11-07ζ). One row per metric: (metric, value).
--
-- WHAT "ACTIVE" MEANS HERE, because it is the word most likely to be read
-- as more than it is: an account is ACTIVE in a window if it has at least
-- one row in public.ai_cost_log in that window, i.e. it used an AI feature.
-- It is not a page view, a login or a session; the product has no
-- analytics package, and these counts do not pretend to be one.
-- "Paid" is a subscription_tier other than 'free' in the account's
-- metadata, the same field mrr_inputs() reads.
--
-- COUNTS ONLY. No row names a person: a metric is a number, never a list of
-- accounts. SECURITY DEFINER, search_path pinned, executable by service_role
-- only: the figures are the company's business, not a customer's.
--
-- Idempotent: create or replace. How to check it after running:
-- npm run db:pending; /api/health lists company_kpis.
-- How to undo: drop function if exists public.company_kpis();
--   (removes this function only; no table or other function is touched).
-- ---------------------------------------------------------------------------

create or replace function public.company_kpis()
returns table (metric text, value bigint)
language sql
stable
security definer
set search_path = public, pg_catalog
as $kpis$
  with u as (
    select id, created_at, coalesce(raw_user_meta_data ->> 'subscription_tier', 'free') as tier
    from auth.users
    where deleted_at is null
  ),
  used_recent as (
    select distinct user_id from public.ai_cost_log where created_at >= now() - interval '30 days'
  )
  select 'users_total'::text, count(*)::bigint from u
  union all select 'users_new_7d', count(*) from u where created_at >= now() - interval '7 days'
  union all select 'users_new_prev_7d', count(*) from u
    where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'
  union all select 'paid_users', count(*) from u where tier <> 'free'
  union all select 'active_7d', count(distinct user_id) from public.ai_cost_log
    where created_at >= now() - interval '7 days'
  union all select 'active_prev_7d', count(distinct user_id) from public.ai_cost_log
    where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'
  union all select 'active_30d', count(*) from used_recent
  union all select 'active_prev_30d', count(distinct user_id) from public.ai_cost_log
    where created_at >= now() - interval '60 days' and created_at < now() - interval '30 days'
  union all select 'lapsed_30d', count(*) from (
      select distinct user_id from public.ai_cost_log
      where created_at >= now() - interval '60 days' and created_at < now() - interval '30 days'
    ) p
    where not exists (select 1 from used_recent r where r.user_id = p.user_id)
  union all select 'paid_lapsed_30d', count(*) from u
    where tier <> 'free' and not exists (select 1 from used_recent r where r.user_id = u.id)
  union all select 'free_near_limit_active_7d', count(*) from u
    join public.user_credits c on c.user_id = u.id
    where u.tier = 'free' and c.credits_total > 0 and c.credits_remaining <= c.credits_total * 0.1
      and exists (select 1 from public.ai_cost_log l where l.user_id = u.id and l.created_at >= now() - interval '7 days')
  union all select 'accounts_with_credit_row', count(*) from public.user_credits;
$kpis$;

do $kpisgrants$
begin
  execute 'revoke all on function public.company_kpis() from public';
  execute 'revoke all on function public.company_kpis() from anon';
  execute 'revoke all on function public.company_kpis() from authenticated';
  execute 'grant execute on function public.company_kpis() to service_role';
end $kpisgrants$;

comment on function public.company_kpis() is
  'Twelve counts about accounts and AI usage for the company''s own agents. Counts only, never a list of accounts. "Active" means at least one ai_cost_log row, not a page view. service_role only.';
