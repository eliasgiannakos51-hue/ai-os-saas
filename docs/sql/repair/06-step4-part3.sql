-- REPAIR 4.3 — nav_events + prune_nav_events
-- Source: supabase/migrations/20260915000000_nav_events.sql
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- Run the numbered files IN ORDER. Each is safe to run twice.

-- WHICH SCREENS ARE OPENED, HOW OFTEN, AND BY HOW MANY DISTINCT PEOPLE.
--
-- `is_business_module` marks the twelve records modules that share the
-- /dashboard/[module] route — the ones the "what do I cut" question is
-- actually about, as opposed to Settings or the Home, which are not
-- candidates for cutting whatever the numbers say. The list is a literal
-- here because nothing in the database knows what a module is;
-- scripts/tests/nav-events.test.mjs and nav-events.dbtest.mjs both assert
-- it equals the slugs in src/lib/modules.ts, separately for each view, so
-- a thirteenth module cannot appear in the product and be miscounted here.
create view public.nav_screen_usage
with (security_invoker = true) as
select
  e.path,
  split_part(e.path, '/', 3) as segment,
  split_part(e.path, '/', 3) = any (array[
    'competitors', 'research', 'finance', 'learning', 'trading', 'decisions',
    'products', 'content', 'sales', 'feedback', 'analytics', 'automation'
  ]) as is_business_module,
  count(*)::bigint as opens,
  count(distinct e.user_id)::bigint as users,
  round(count(*)::numeric / nullif(count(distinct e.user_id), 0), 1) as opens_per_user,
  round(100.0 * count(*)::numeric / nullif(sum(count(*)) over (), 0), 1) as pct_of_all_opens,
  min(e.created_at) as first_opened,
  max(e.created_at) as last_opened
from public.nav_events e
group by e.path
order by count(*) desc, e.path;

comment on view public.nav_screen_usage is
  'One row per dashboard screen that has ever been opened: opens, distinct users, share of all navigation. A screen with NO row here has been opened by nobody in the retention window — which is the answer to "what can I cut", and the reason to read this against src/app/dashboard/ rather than on its own.';

drop view if exists public.nav_user_breadth;

-- HOW MUCH OF THE PRODUCT ONE PERSON USES.
--
-- THE AVERAGE IS THE WEAKER HALF and it is here with its median beside it
-- on purpose: a handful of people who open everything drag the mean up
-- and make a product that most users see three screens of look like one
-- they see eight of. If the two numbers disagree, the median is the one
-- describing the typical account.
create view public.nav_user_breadth
with (security_invoker = true) as
with per_user as (
  select
    user_id,
    count(*)::numeric as opens,
    count(distinct path)::numeric as screens,
    count(distinct path) filter (
      where split_part(path, '/', 3) = any (array[
        'competitors', 'research', 'finance', 'learning', 'trading', 'decisions',
        'products', 'content', 'sales', 'feedback', 'analytics', 'automation'
      ])
    )::numeric as business_modules,
    count(distinct date_trunc('day', created_at))::numeric as active_days
  from public.nav_events
  group by user_id
)
select
  count(*)::bigint as users_with_navigation,
  round(avg(screens), 1) as avg_screens_per_user,
  percentile_cont(0.5) within group (order by screens) as median_screens_per_user,
  max(screens)::bigint as max_screens_per_user,
  round(avg(business_modules), 1) as avg_modules_per_user,
  percentile_cont(0.5) within group (order by business_modules) as median_modules_per_user,
  round(avg(opens), 1) as avg_opens_per_user,
  round(avg(active_days), 1) as avg_active_days_per_user
from per_user;

comment on view public.nav_user_breadth is
  'One row, whole-account: how many distinct screens and how many of the twelve business modules the average and the median user opens. Read the median first — the mean is dragged by a few people who open everything.';

-- OPERATOR VIEWS, NOT PRODUCT SURFACES. Neither is granted to anon or to
-- authenticated: they aggregate across every account, and there is no
-- screen in the product that shows them.
revoke all on public.nav_screen_usage from anon;
revoke all on public.nav_screen_usage from authenticated;
revoke all on public.nav_user_breadth from anon;
revoke all on public.nav_user_breadth from authenticated;
grant select on public.nav_screen_usage to service_role;
grant select on public.nav_user_breadth to service_role;