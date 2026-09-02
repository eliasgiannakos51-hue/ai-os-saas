-- REPAIR 4.1 — nav_events + prune_nav_events
-- Source: supabase/migrations/20260915000000_nav_events.sql
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- Run the numbered files IN ORDER. Each is safe to run twice.

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