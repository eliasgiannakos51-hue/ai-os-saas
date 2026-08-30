-- ═══════════════════════════════════════════════════════════════════
-- IONEXA — THE FOUR ANALYSES (#27, #29, #30, #31)
-- Read-only. Every query below was executed against a database built
-- from bootstrap-supabase.sql + every migration in order, so the table
-- and column names are real. What they will RETURN depends on your data.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- #27  PLANS 6 -> 4
-- ───────────────────────────────────────────────────────────────────
-- WHO IS ON WHAT. plan_tier lives on user_credits, one row per user.
select coalesce(plan_tier, 'none') as plan,
       count(*)                    as users,
       round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 1) as pct
from public.user_credits
group by 1
order by users desc;

-- WHICH PLAN NOBODY CHOOSES. Any tier with 0 users is a merge candidate;
-- a tier with 1-2 is a merge candidate you have to talk to first.
select t.plan_tier,
       coalesce(c.users, 0) as users
from (values ('free'),('starter'),('growth'),('professional'),('ultimate'),('enterprise')) as t(plan_tier)
left join (select plan_tier, count(*) users from public.user_credits group by 1) c using (plan_tier)
order by users asc, t.plan_tier;

-- WHO A MERGE WOULD MOVE, and whether they are paying. Change the two
-- tier names to the pair you are considering.
select plan_tier,
       count(*)                                        as users,
       count(*) filter (where credits_remaining > 0)    as with_balance,
       sum(purchased_credits)                           as purchased_credits_held
from public.user_credits
where plan_tier in ('starter','growth')
group by 1;

-- AND WHAT THEY HAVE ALREADY PAID FOR — an add-on or an annual term is
-- a commitment a merge has to honour.
select s.to_tier, s.to_interval, count(*) as events
from public.subscription_events s
where s.at > now() - interval '180 days'
group by 1, 2
order by events desc;

-- ───────────────────────────────────────────────────────────────────
-- #29  RADICAL SIMPLIFICATION
-- ───────────────────────────────────────────────────────────────────
-- ⚠ nav_events DOES NOT EXIST. Not as a table and not in the code —
-- there is no navigation-event logging in this product. The three
-- questions were written for a table that was never built, so they are
-- answered here from the only record of module use that exists: the ROWS
-- people created. "Opened" cannot be answered at all; "used" can.

-- WHICH MODULES ARE USED, AND BY HOW MANY DISTINCT PEOPLE.
-- The union is written out because the 13 module tables are separate
-- tables, not one table with a type column.
with per_module as (
  select 'ideas'           as module, user_id from public.ideas
  union all select 'competitors',      user_id from public.competitors
  union all select 'research',         user_id from public.research
  union all select 'finance',          user_id from public.finance_entries
  union all select 'learning',         user_id from public.learning_entries
  union all select 'trading',          user_id from public.trades
  union all select 'decisions',        user_id from public.decisions
  union all select 'products',         user_id from public.products
  union all select 'content',          user_id from public.content
  union all select 'sales',            user_id from public.leads
  union all select 'feedback',         user_id from public.feedback
  union all select 'analytics',        user_id from public.metrics
  union all select 'automation',       user_id from public.automations
)
select module,
       count(*)                as entries,
       count(distinct user_id) as people
from per_module
group by 1
order by people desc, entries desc;

-- HOW MANY MODULES THE AVERAGE PERSON ACTUALLY USES.
with per_module as (
  select 'ideas' as module, user_id from public.ideas
  union all select 'competitors', user_id from public.competitors
  union all select 'research', user_id from public.research
  union all select 'finance', user_id from public.finance_entries
  union all select 'learning', user_id from public.learning_entries
  union all select 'trading', user_id from public.trades
  union all select 'decisions', user_id from public.decisions
  union all select 'products', user_id from public.products
  union all select 'content', user_id from public.content
  union all select 'sales', user_id from public.leads
  union all select 'feedback', user_id from public.feedback
  union all select 'analytics', user_id from public.metrics
  union all select 'automation', user_id from public.automations
),
per_user as (select user_id, count(distinct module) as modules from per_module group by 1)
select count(*)                                   as people_with_any_entry,
       round(avg(modules), 2)                     as avg_modules_used,
       percentile_cont(0.5) within group (order by modules) as median_modules,
       max(modules)                               as max_modules
from per_user;

-- ───────────────────────────────────────────────────────────────────
-- #30  ONBOARDING
-- ───────────────────────────────────────────────────────────────────
-- THE FUNNEL. user_onboarding has one row per user who reached it, with
-- four timestamps: created (row exists), completed, skipped, activation
-- used. home_seen_at was added in V4.6.
select count(*)                                            as reached_onboarding,
       count(*) filter (where completed_at is not null)     as completed,
       count(*) filter (where skipped_at   is not null)     as skipped,
       count(*) filter (where activation_used_at is not null) as used_activation,
       count(*) filter (where home_seen_at is not null)     as saw_the_home,
       count(*) filter (where goal is not null and goal <> '') as stated_a_goal
from public.user_onboarding;

-- TIME FROM ONBOARDING TO FIRST ENTRY — "signup to first result".
-- Uses the earliest row in ANY module table as the first result.
with firsts as (
  select user_id, min(created_at) as first_entry from (
    select user_id, created_at from public.ideas
    union all select user_id, created_at from public.competitors
    union all select user_id, created_at from public.research
    union all select user_id, created_at from public.finance_entries
    union all select user_id, created_at from public.learning_entries
    union all select user_id, created_at from public.trades
    union all select user_id, created_at from public.decisions
    union all select user_id, created_at from public.products
    union all select user_id, created_at from public.content
    union all select user_id, created_at from public.leads
    union all select user_id, created_at from public.feedback
    union all select user_id, created_at from public.metrics
    union all select user_id, created_at from public.automations
  ) all_entries group by 1
)
select count(*)                                                              as people_with_a_first_entry,
       round(avg(extract(epoch from (f.first_entry - o.created_at)) / 60)::numeric, 1) as avg_minutes,
       round((percentile_cont(0.5) within group (
         order by extract(epoch from (f.first_entry - o.created_at)) / 60))::numeric, 1) as median_minutes
from public.user_onboarding o
join firsts f on f.user_id = o.user_id
where f.first_entry >= o.created_at;

-- WHERE THEY STOP. Each row is one step of the funnel and how many are
-- still there.
select 'reached onboarding' as step, count(*) as people from public.user_onboarding
union all
select 'stated a goal', count(*) from public.user_onboarding where goal is not null and goal <> ''
union all
select 'completed or skipped', count(*) from public.user_onboarding where completed_at is not null or skipped_at is not null
union all
select 'saw the Home', count(*) from public.user_onboarding where home_seen_at is not null
union all
select 'made an entry', count(distinct user_id) from (
  select user_id from public.ideas union all select user_id from public.finance_entries
  union all select user_id from public.leads union all select user_id from public.research
) any_entry;

-- ───────────────────────────────────────────────────────────────────
-- #31  MOBILE
-- ───────────────────────────────────────────────────────────────────
-- ⚠ pwa_events DOES NOT EXIST. The real table is pwa_client_stats: one
-- row per (user, client_id), updated rather than appended.
select coalesce(platform, 'unknown')     as platform,
       count(*)                          as clients,
       count(distinct user_id)           as people,
       round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 1) as pct
from public.pwa_client_stats
group by 1
order by clients desc;

-- INSTALLED, AND PUSH.
select count(*)                                                  as clients,
       count(*) filter (where installed)                          as installed,
       round(100.0 * count(*) filter (where installed) / nullif(count(*), 0), 1) as pct_installed,
       count(*) filter (where push_subscribed)                    as push_subscribed,
       round(100.0 * count(*) filter (where push_subscribed) / nullif(count(*), 0), 1) as pct_push,
       count(*) filter (where push_permission = 'denied')         as push_denied
from public.pwa_client_stats;

-- DISPLAY MODE — the honest "is it really installed" signal, since
-- `installed` is self-reported by the client.
select coalesce(display_mode, 'unknown') as display_mode, count(*) as clients
from public.pwa_client_stats
group by 1
order by clients desc;
