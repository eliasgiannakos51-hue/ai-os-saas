-- THE THREE QUESTIONS nav_events exists to answer, written down so the
-- answer is a query anybody can re-run rather than a number somebody
-- remembers.
--
--   psql -d "$DATABASE_URL" -f scripts/db/nav-analysis.sql
--
-- READ THIS BEFORE READING THE NUMBERS.
--
-- Nothing here is meaningful until the table has been collecting for the
-- window each query asks about. Question 1 asks about 30 days; run it on
-- day 3 and every item looks unused, which is the most expensive
-- possible way to be wrong with this data. Question 3 asks about a full
-- week per user. The migration shipped empty — check the earliest row
-- before quoting any of this:
--
--   select min(at), max(at), count(*) from public.nav_events;
--
-- These are also the ONLY questions this table can answer honestly. It
-- records sidebar clicks and nothing else (see the migration header), so
-- "nobody opens X" always means "nobody opens X FROM THE SIDEBAR" —
-- a page reached from the command palette, a link inside another page,
-- or a bookmark leaves no row here.

\echo '=== 0. Is there enough data to ask anything yet? ==='
select
  min(at)                                        as earliest,
  max(at)                                        as latest,
  count(*)                                       as rows,
  count(distinct user_id)                        as people,
  round(extract(epoch from (now() - min(at))) / 86400.0, 1) as days_of_data
from public.nav_events;

\echo ''
\echo '=== 1. Sidebar items nobody clicked in 30 days -> delete, do not move ==='
-- Every href the sidebar offers, LEFT JOINed against what was clicked,
-- so items with zero clicks appear as rows rather than as absences. A
-- query that only listed what WAS clicked would answer this question by
-- omission, and an item missing from a result set is indistinguishable
-- from an item nobody thought to look for.
--
-- The href list is not derived from the database — the database has no
-- idea what the sidebar offers. Paste the current list from
-- lib/sidebar-nav.ts; scripts/tests/nav-analytics.test.mjs checks that
-- this file and that file have not drifted apart.
with sidebar_items(href) as (
  select unnest(array[
    '/dashboard',
    '/dashboard/agents',
    '/dashboard/analytics',
    '/dashboard/apps',
    '/dashboard/automation',
    '/dashboard/campaigns',
    '/dashboard/coding',
    '/dashboard/competitors',
    '/dashboard/content',
    '/dashboard/data-analysis',
    '/dashboard/decisions',
    '/dashboard/deep-research',
    '/dashboard/documents',
    '/dashboard/favorites',
    '/dashboard/feedback',
    '/dashboard/files',
    '/dashboard/finance',
    '/dashboard/images',
    '/dashboard/integrations',
    '/dashboard/learning',
    '/dashboard/marketplace',
    '/dashboard/memory',
    '/dashboard/presentations',
    '/dashboard/product-workflow',
    '/dashboard/products',
    '/dashboard/published',
    '/dashboard/research',
    '/dashboard/sales',
    '/dashboard/team',
    '/dashboard/trading',
    '/dashboard/trading-workflow',
    '/dashboard/videos',
    '/dashboard/website-builder',
    '/dashboard/websites',
    '/help'
  ])
),
clicks as (
  select href, count(*) as clicks, count(distinct user_id) as people
  from public.nav_events
  where at >= now() - interval '30 days'
  group by href
)
select
  s.href,
  coalesce(c.clicks, 0) as clicks_30d,
  coalesce(c.people, 0) as people_30d
from sidebar_items s
left join clicks c on c.href = s.href
order by coalesce(c.clicks, 0) asc, s.href;

\echo ''
\echo '=== 2. How long after signing in does the first navigation happen? ==='
-- last_sign_in_at is the only login timestamp in the system, and it is
-- overwritten on every sign-in — so this compares each person''s FIRST
-- nav event after their MOST RECENT sign-in. That is one sample per
-- person, not a history, and it is all the schema can honestly support
-- without a session column it deliberately does not have.
--
-- Rows where the first event predates the current session are excluded
-- rather than clamped to zero: a negative interval means the sample
-- belongs to an earlier session that last_sign_in_at has already
-- forgotten, and averaging it in would quietly understate the number.
with first_nav as (
  select n.user_id, min(n.at) as first_at, u.last_sign_in_at
  from public.nav_events n
  join auth.users u on u.id = n.user_id
  where u.last_sign_in_at is not null
    and n.at >= u.last_sign_in_at
  group by n.user_id, u.last_sign_in_at
)
select
  count(*)                                                             as people,
  round(avg(extract(epoch from (first_at - last_sign_in_at))))         as mean_seconds,
  round(percentile_cont(0.5) within group
        (order by extract(epoch from (first_at - last_sign_in_at))))   as median_seconds,
  round(percentile_cont(0.9) within group
        (order by extract(epoch from (first_at - last_sign_in_at))))   as p90_seconds
from first_nav;

\echo ''
\echo '=== 3. Distinct sidebar items one person opens in a week ==='
-- THE ONE THAT DECIDES WHETHER THE SIDEBAR IS MOSTLY FURNITURE. It
-- currently offers 35 destinations. If the median person opens 3
-- distinct ones a week, the other thirty-two are furniture. If it is 15,
-- the breadth is being used and removing items takes something away.
--
-- Per (person, week) rather than per person: somebody active for eight
-- weeks would otherwise contribute one inflated number covering all of
-- them, and the question asked is about a week.
with per_user_week as (
  select
    user_id,
    date_trunc('week', at) as week,
    count(distinct href)   as distinct_items
  from public.nav_events
  where at >= now() - interval '90 days'
  group by user_id, date_trunc('week', at)
)
select
  count(*)                                                        as person_weeks,
  round(avg(distinct_items), 1)                                   as mean_items,
  percentile_cont(0.5) within group (order by distinct_items)     as median_items,
  percentile_cont(0.9) within group (order by distinct_items)     as p90_items,
  max(distinct_items)                                             as max_items
from per_user_week;

\echo ''
\echo '=== 3b. The same, as a distribution — a median alone hides a split audience ==='
-- A median of 6 is produced both by "everyone opens about 6" and by
-- "half open 2, half open 20", and those two call for opposite
-- decisions. The histogram is what tells them apart.
with per_user_week as (
  select user_id, date_trunc('week', at) as week, count(distinct href) as distinct_items
  from public.nav_events
  where at >= now() - interval '90 days'
  group by user_id, date_trunc('week', at)
)
select distinct_items, count(*) as person_weeks
from per_user_week
group by distinct_items
order by distinct_items;
