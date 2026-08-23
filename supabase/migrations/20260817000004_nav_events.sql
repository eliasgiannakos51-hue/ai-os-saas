-- WHICH PARTS OF THE APP ANYONE ACTUALLY OPENS.
--
-- There is no navigation instrumentation anywhere in this product. That
-- is fine right up until someone proposes removing or regrouping nav
-- items, at which point every argument is an opinion: "nobody uses the
-- tracking modules" and "people use them all the time" are equally
-- unfalsifiable today. This table is the smallest thing that makes that
-- an answerable question instead of an argument.
--
-- WHAT IT IS ALLOWED TO ANSWER, and nothing beyond it:
--   1. which nav destinations were never opened in 30 days
--      -> delete them, rather than moving them somewhere else
--   2. how long after signing in the first navigation happens
--      -> (first at) minus auth.users.last_sign_in_at; no column here
--   3. how many DISTINCT destinations one person opens in a week
--      -> if that number is 3, forty-two items is noise. If it is 15,
--         it is not. Either way it is measured.
--
-- FOUR COLUMNS, AND THE ONES DELIBERATELY ABSENT.
--
-- No IP address. No user agent. No referrer. No session id, no device
-- id, no dwell time, no scroll depth, no click coordinates, no A/B
-- bucket, no "duration on previous page".
--
-- Every one of those is a column somebody would have to justify, and the
-- three questions above do not need any of them. A telemetry table grows
-- by accretion — each addition individually defensible, the total
-- indefensible — so the discipline has to be at the schema, where it is
-- visible in review, not in a policy document. If a future question
-- genuinely needs another column, that is a migration with its own
-- argument attached, not a field quietly appended here.
--
-- `href` is a same-origin application path ("/dashboard/agents"), never
-- a full URL: the API route that writes these rejects anything else, so
-- no query string can smuggle a search term or a record id into what is
-- meant to be a page identifier. See app/api/nav-events/route.ts.
--
-- IT IS PERSONAL DATA, and treated as such rather than as "just
-- analytics": classified in lib/gdpr/user-data-registry.ts, included in
-- the Article 15 export, removed by the auth.users cascade on erasure,
-- switchable off in Settings, and deleted after 90 days by
-- api/cron/prune-nav-events.

create table if not exists public.nav_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  href text not null,
  at timestamptz not null default now()
);

comment on table public.nav_events is
  'One row per navigation click: who, where to, when. No IP, no user agent, no referrer — see the migration header for why those are absent by design. Personal data: exported, erased with the account, opt-out in Settings, deleted after 90 days by api/cron/prune-nav-events.';

comment on column public.nav_events.href is
  'A same-origin application path such as /dashboard/agents. Never a full URL and never a query string — api/nav-events/route.ts rejects both, so a record id or a search term cannot end up here.';

-- The index the three questions above actually scan: every one of them
-- is "this user's rows, over a date window". (user_id, at) serves all
-- three, and the retention delete's `at < cutoff` scan can use it too.
create index if not exists nav_events_user_at_idx
  on public.nav_events (user_id, at desc);

-- The retention sweep deletes by age across ALL users, which the
-- user-leading index above cannot drive. Small and worth it: without it
-- the nightly prune is a sequential scan of the whole table forever.
create index if not exists nav_events_at_idx
  on public.nav_events (at);

alter table public.nav_events enable row level security;

-- INSERT own, SELECT own, DELETE own — and no UPDATE policy at all.
--
-- The missing UPDATE is deliberate and is the whole integrity story of
-- this table: an event is a record of something that happened. There is
-- no legitimate reason for anyone, including its owner, to rewrite when
-- or where a navigation went. With no policy, RLS denies it.
--
-- DELETE own exists so "delete my analytics" is a thing the account can
-- do directly, without a service-role route standing between a person
-- and their own data. Erasure of the whole account rides the auth.users
-- cascade above and needs no policy.
drop policy if exists "nav_events_insert_own" on public.nav_events;
create policy "nav_events_insert_own"
  on public.nav_events for insert
  with check (auth.uid() = user_id);

drop policy if exists "nav_events_select_own" on public.nav_events;
create policy "nav_events_select_own"
  on public.nav_events for select
  using (auth.uid() = user_id);

drop policy if exists "nav_events_delete_own" on public.nav_events;
create policy "nav_events_delete_own"
  on public.nav_events for delete
  using (auth.uid() = user_id);

-- NUMBERED BEFORE 20260818000000_function_grants.sql, which has to stay
-- last: it loops over pg_proc and can only cover routines that already
-- exist. This file creates no routine, so the grants pass has nothing to
-- do for it either way — sorting it before rather than after is what
-- keeps "function grants is always the last file" true by inspection.
