-- ---------------------------------------------------------------------------
-- FIRST-PARTY PAGE COUNTER (docs/PROGRESS.md 2026-11-08γ).
--
-- One number per (day, page, source): "this page was viewed this many times
-- today, coming from there". NO visitor identifier, NO cookie, NO IP, NO user
-- agent and NO account id is stored, so a row can never be traced to a person
-- and two views by one person are indistinguishable from one view each by two
-- people. "views" is the unit; "visitors" is NOT counted.
--
-- What may be stored is decided before this function is called
-- (src/lib/analytics/normalize.ts); the checks here are the second lock, not
-- the first: a path must start with "/", fit 120 characters, a source 60.
--
-- THE TABLE CANNOT BE FILLED BY ANYONE WHO WANTS TO. The route that calls
-- record_page_view() is behind the `first-party-analytics` switch, which starts
-- at "you and the test account", and is rate limited. On top of that, a day may
-- hold at most 2000 distinct (page, source) rows: past that, a view for a pair
-- that is not already there is folded into ('(other)', '(other)'), so an
-- attacker inventing addresses grows ONE row, not the table.
--
-- RLS is on and there is no policy: only the service role reads or writes it.
-- Both functions are SECURITY DEFINER with a pinned search_path and executable
-- by service_role only. company_traffic() returns counts, never a page or a
-- source name.
--
-- Idempotent. How to check it after running: npm run db:pending.
-- How to undo: drop function if exists public.record_page_view(text, text);
--   drop function if exists public.company_traffic();
--   drop table if exists public.page_view_counts;
--   (this deletes every counted view; nothing else refers to this table).
-- ---------------------------------------------------------------------------

create table if not exists public.page_view_counts (
  day date not null,
  path text not null check (path like '/%' and char_length(path) <= 120),
  source text not null check (char_length(source) between 1 and 60),
  views bigint not null default 0 check (views >= 0),
  primary key (day, path, source)
);

alter table public.page_view_counts enable row level security;
revoke all on public.page_view_counts from anon;
revoke all on public.page_view_counts from authenticated;

create or replace function public.record_page_view(p_path text, p_source text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $record$
declare
  v_path text := p_path;
  v_source text := p_source;
  v_today date := (now() at time zone 'utc')::date;
begin
  if v_path is null or v_path not like '/%' or char_length(v_path) > 120 then
    return;
  end if;
  if v_source is null or char_length(v_source) not between 1 and 60 then
    return;
  end if;

  if not exists (
       select 1 from public.page_view_counts
       where day = v_today and path = v_path and source = v_source
     )
     and (select count(*) from public.page_view_counts where day = v_today) >= 2000 then
    v_path := '/(other)';
    v_source := '(other)';
  end if;

  insert into public.page_view_counts as c (day, path, source, views)
  values (v_today, v_path, v_source, 1)
  on conflict (day, path, source) do update set views = c.views + 1;
end;
$record$;

create or replace function public.company_traffic()
returns table (metric text, value bigint)
language sql
stable
security definer
set search_path = public, pg_catalog
as $traffic$
  select 'views_7d'::text, coalesce(sum(views), 0)::bigint from public.page_view_counts
    where day > (now() at time zone 'utc')::date - 7
  union all select 'views_prev_7d', coalesce(sum(views), 0) from public.page_view_counts
    where day <= (now() at time zone 'utc')::date - 7 and day > (now() at time zone 'utc')::date - 14
  union all select 'pages_7d', count(distinct path) from public.page_view_counts
    where day > (now() at time zone 'utc')::date - 7
  union all select 'sources_7d', count(distinct source) from public.page_view_counts
    where day > (now() at time zone 'utc')::date - 7
  union all select 'direct_views_7d', coalesce(sum(views), 0) from public.page_view_counts
    where day > (now() at time zone 'utc')::date - 7 and source = 'direct'
  union all select 'days_with_data_14d', count(distinct day) from public.page_view_counts
    where day > (now() at time zone 'utc')::date - 14
  union all select 'days_since_last_view', coalesce((now() at time zone 'utc')::date - max(day), -1) from public.page_view_counts;
$traffic$;

do $trafficgrants$
begin
  execute 'revoke all on function public.record_page_view(text, text) from public';
  execute 'revoke all on function public.record_page_view(text, text) from anon';
  execute 'revoke all on function public.record_page_view(text, text) from authenticated';
  execute 'grant execute on function public.record_page_view(text, text) to service_role';
  execute 'revoke all on function public.company_traffic() from public';
  execute 'revoke all on function public.company_traffic() from anon';
  execute 'revoke all on function public.company_traffic() from authenticated';
  execute 'grant execute on function public.company_traffic() to service_role';
end $trafficgrants$;

comment on table public.page_view_counts is
  'Views per (day, page, source). No visitor identifier of any kind. Filled only through record_page_view(), behind the first-party-analytics switch.';
comment on function public.company_traffic() is
  'Seven counts about page views for the analytics-collector and dashboard-agent company agents. days_since_last_view is -1 when nothing was ever recorded.';
