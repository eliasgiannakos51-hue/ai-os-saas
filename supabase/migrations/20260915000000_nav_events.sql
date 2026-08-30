-- ============================================================================
-- nav_events — WHERE PEOPLE ACTUALLY GO
-- ============================================================================
--
-- WHAT WAS MISSING, and it is the largest hole in this schema. There are
-- 105 tables here. Every one of them records something the user WROTE:
-- an idea, a mission, a credit spend, a website. NOT ONE records what the
-- user LOOKED AT. So the four questions that decide what this product
-- becomes had no answer anywhere in the system:
--
--     which of the thirty-eight dashboard screens are ever opened
--     how often each one is opened, and by how many distinct people
--     how many different screens one person uses
--     what the screen before this one was
--
-- Without those, "cut the modules nobody uses" is a guess dressed as a
-- decision, and cutting the wrong one is unrecoverable in a way that
-- keeping a dead one is not. docs/analytics-queries.sql had to print
-- "nav_events DOES NOT EXIST" against its own question #29 rather than
-- return a number. This file is that table.
--
-- ---------------------------------------------------------------------
-- WHAT IS DELIBERATELY NOT STORED
-- ---------------------------------------------------------------------
--
--   NO QUERY STRING. `/dashboard/finance?record=<uuid>` becomes
--   `/dashboard/finance`. The parameter is the identifier of a row the
--   user wrote; keeping it would turn a navigation log into a second,
--   unpoliced index of that person's content.
--
--   NO PATH IDENTIFIERS. `/dashboard/documents/<uuid>` becomes
--   `/dashboard/documents/:id`, for the same reason and one more: an
--   unbounded `path` column is an unbounded GROUP BY, and the view at the
--   bottom of this file would degrade from thirty-nine rows to one row
--   per document in the product.
--
--   NO IP, NO USER AGENT, NO SESSION ID, NO SCREEN SIZE. None of the four
--   questions above needs them. A column that exists gets filled, and a
--   column that is filled gets used.
--
--   NO FREE TEXT AT ALL. `path` is written only after
--   src/lib/nav/nav-path.ts has matched it against the app's own route
--   list, SERVER-SIDE — see the check constraint below and
--   scripts/tests/nav-events.test.mjs, which derives that list from
--   src/app/dashboard/ so a new screen cannot be silently untracked and a
--   deleted one cannot silently linger.
--
--   AND `referrer` IS NOT document.referrer. It is the previous in-app
--   path, or the literal 'external' when the reader arrived from another
--   site, or null on a direct load. The question is "what screen did they
--   come from", which client-side navigation never puts in an HTTP header
--   anyway; storing the raw header would store a third party's URL.
--
-- ---------------------------------------------------------------------
-- WHY 90 DAYS
-- ---------------------------------------------------------------------
--
-- Long enough to see a month-over-month trend and a seasonal one; short
-- enough that this stays a product instrument rather than a permanent
-- record of one person's daily habits. Nothing in the product reads a
-- nav_event older than the current question, so the older rows are cost
-- and exposure with no reader. public.prune_nav_events() below does the
-- deleting and /api/cron/nav-retention calls it daily.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

-- ----------------------------------------------------------------------
-- 1. The table
-- ----------------------------------------------------------------------
-- IDENTITY BIGINT, NOT uuid. Every other table here uses
-- `gen_random_uuid()` because its rows are addressable — a mission has a
-- URL, an idea has a URL. A nav event is never addressed by anything: it
-- is appended, aggregated and deleted. This is the highest-write table in
-- the schema (one row per screen change per user), so it gets the
-- narrower key and the sequential insert order that comes with it.
create table if not exists public.nav_events (
  id bigint generated always as identity primary key,

  -- ON DELETE CASCADE, like every other user-scoped table here. Deleting
  -- the account deletes the trail; there is no orphan path where a row
  -- about somebody's browsing outlives their ability to ask about it.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- The normalised route. '/dashboard', '/dashboard/finance',
  -- '/dashboard/documents/:id', or '/dashboard/:unknown' for a URL under
  -- /dashboard that matches no route in the app.
  path text not null,

  -- The normalised route BEFORE this one, 'external', or null. See above.
  referrer text,

  created_at timestamptz not null default now()
);

-- THE LAST WORD ON WHAT MAY BE WRITTEN, and it has to be a SHAPE, not a
-- length. The normaliser in src/lib/nav/nav-path.ts already refuses
-- everything else and the API route runs it server-side, so a
-- hand-written POST cannot go around it — but this constraint is the
-- version that survives somebody adding a SECOND writer later and
-- forgetting the normaliser, so it has to reject the same things without
-- knowing the route list.
--
-- WHAT THE FIRST VERSION OF THIS CONSTRAINT DID NOT CATCH. It read
-- `path like '/dashboard%' and length(path) between 10 and 64`, which
-- accepts `/dashboard/finance?record=<uuid>`: 62 characters, the right
-- prefix, and the exact string this whole design exists to keep out. A
-- prefix and a length are a bound, not a check. scripts/tests/
-- nav-events.dbtest.mjs measured it and it is the reason this line is a
-- regular expression: at most three segments, lower-case letters, digits
-- and hyphens only, with a leading colon allowed so ':id' and ':unknown'
-- still fit. No question mark, no equals, no ampersand, no hash, no
-- percent, no upper case, no fourth segment.
alter table public.nav_events
  drop constraint if exists nav_events_path_shape_check;
alter table public.nav_events
  add constraint nav_events_path_shape_check
  check (path ~ '^/dashboard(/:?[a-z0-9-]{1,30}){0,2}$');

alter table public.nav_events
  drop constraint if exists nav_events_referrer_shape_check;
alter table public.nav_events
  add constraint nav_events_referrer_shape_check
  check (
    referrer is null
    or referrer = 'external'
    or referrer ~ '^/dashboard(/:?[a-z0-9-]{1,30}){0,2}$'
  );

-- ----------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------
-- ONE FOR THE SWEEP, ONE FOR THE PER-USER READ, AND NOT ONE ON `path`.
-- The views below aggregate the whole table, which is a sequential scan
-- whatever indexes exist; an index on `path` would earn nothing there and
-- would be paid for on every single insert — on the hottest write path in
-- the product. Retention keeps the table small enough that the scan is
-- the right plan.
create index if not exists nav_events_created_at_idx
  on public.nav_events (created_at);
create index if not exists nav_events_user_created_idx
  on public.nav_events (user_id, created_at desc);

-- ----------------------------------------------------------------------
-- 3. Row-level security
-- ----------------------------------------------------------------------
alter table public.nav_events enable row level security;

-- A USER MAY RECORD THEIR OWN NAVIGATION AND NOBODY ELSE'S. The API route
-- fills user_id from auth.getUser(); this is what makes that true rather
-- than merely intended.
drop policy if exists nav_events_insert_own on public.nav_events;
create policy nav_events_insert_own
  on public.nav_events for insert
  with check (auth.uid() = user_id);

-- AND MAY READ THEIR OWN. Nothing in the product reads this table as the
-- user today. The policy exists because a table that records a person's
-- movements and cannot be shown to that person is a worse thing to own
-- than one that can; own-rows-only costs nothing and closes that.
drop policy if exists nav_events_select_own on public.nav_events;
create policy nav_events_select_own
  on public.nav_events for select
  using (auth.uid() = user_id);

-- NO UPDATE AND NO DELETE POLICY. An append-only log that the writer can
-- rewrite is not a log. Erasure is covered by the cascade above (delete
-- the account, the rows go) and by prune_nav_events below.

grant select, insert on public.nav_events to authenticated;
revoke update, delete on public.nav_events from authenticated;

-- anon OWNS NOTHING HERE — the table and its identity sequence both.
-- 20260909000000_revoke_anon_default_privileges already stopped new
-- tables inheriting Supabase's `ALTER DEFAULT PRIVILEGES ... TO anon`,
-- but a revoke on a privilege nobody holds is a no-op, and this file has
-- to be correct when applied to a database that predates that one. The
-- sequence is named separately because REVOKE ON TABLE does not reach it,
-- and USAGE on a sequence is the one privilege that survives a table
-- revoke — that is the lesson 20260906000000_revoke_anon_grants was
-- written to record.
revoke all on public.nav_events from anon;
do $revokeseq$
declare
  v_seq text := pg_get_serial_sequence('public.nav_events', 'id');
begin
  if v_seq is not null then
    execute format('revoke all on sequence %s from anon', v_seq);
  end if;
end $revokeseq$;

comment on table public.nav_events is
  'One row per screen change inside /dashboard. Normalised server-side by src/lib/nav/nav-path.ts against the app''s own route list: no query strings, no identifiers, no free text. Retained 90 days by public.prune_nav_events(), called daily by /api/cron/nav-retention.';

-- ----------------------------------------------------------------------
-- 4. Retention: 90 days, and a bad argument does no more than the default
-- ----------------------------------------------------------------------
-- SECURITY DEFINER because no role has DELETE on this table — that is the
-- point of section 3, and it is also why the cleanup cannot simply be a
-- statement the cron route sends. Executable by service_role only.
--
-- A BAD ARGUMENT FALLS BACK TO THE DEFAULT, NOT TO THE FLOOR. This is the
-- second version of this clamp and the difference is the whole point.
--
-- The first version was `greatest(least(coalesce(p_days, 90), 3650), 1)`,
-- which guarantees the cutoff is at least one day in the past — so a 0, a
-- negative or a null could never make this `delete from nav_events where
-- created_at < now()`. That guarantee held. It was also the wrong one:
-- clamping a stray 0 UP TO 1 turns "the caller passed nothing usable"
-- into "delete eighty-nine days of history", which is the most
-- destructive sweep the function is allowed to perform. Measured, in
-- scripts/tests/nav-events.dbtest.mjs: prune_nav_events(0) removed a row
-- that was 89 days old.
--
-- So anything that is not a usable number becomes 90 — the sweep that was
-- going to happen anyway. A caller who genuinely wants a shorter window
-- still gets it (1 is honoured), and least(...,3650) keeps a typo from
-- making the sweep a silent no-op forever, which is how retention stops
-- working without anybody noticing.
create or replace function public.prune_nav_events(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $prune$
declare
  v_days integer := case
    when p_days is null or p_days < 1 then 90
    else least(p_days, 3650)
  end;
  v_deleted integer;
begin
  delete from public.nav_events
   where created_at < now() - make_interval(days => v_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $prune$;

-- Same shape as every other privileged function here: nothing to public,
-- nothing to the two roles a browser can hold, execute to service_role.
-- 20260818000000_function_grants loops over pg_proc and runs BEFORE this
-- file, so these have to be stated rather than inherited.
do $prunegrants$
begin
  execute 'revoke all on function public.prune_nav_events(integer) from public';
  execute 'revoke all on function public.prune_nav_events(integer) from anon';
  execute 'revoke all on function public.prune_nav_events(integer) from authenticated';
  execute 'grant execute on function public.prune_nav_events(integer) to service_role';
end $prunegrants$;

comment on function public.prune_nav_events(integer) is
  'Deletes nav_events older than p_days. Null, zero or negative fall back to 90 — a garbage argument does what the default does and never more; anything above 3650 is clamped down so a typo cannot silently stop retention. Returns the row count. service_role only; called by /api/cron/nav-retention.';

-- ----------------------------------------------------------------------
-- 5. The two views — what is opened, and how much of the product one
--    person actually uses
-- ----------------------------------------------------------------------
--
-- DROP-THEN-CREATE, NOT `create or replace`. Replacing a view fails
-- outright if a column is renamed, retyped or removed, which would make
-- this file stop being idempotent the first time a column here is
-- improved. Dropping a view destroys no data — that is the whole
-- difference between this and the DROP TABLE the header forbids.
--
-- security_invoker = true ON BOTH. This is the trap that makes analytics
-- views dangerous in a multi-tenant schema: a view runs as its OWNER by
-- default, so a view over an RLS-protected table, granted to
-- `authenticated`, hands every user every other user's rows and reports
-- no error while doing it. These are granted to service_role only, so
-- today the flag changes nothing — it is here so that the day somebody
-- grants one of them to `authenticated` to build a "your activity"
-- screen, they get their own rows instead of everybody's.

drop view if exists public.nav_screen_usage;

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
