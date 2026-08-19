-- FOUR COLUMNS THAT EXIST IN THE LIVE DATABASE AND IN NO MIGRATION.
--
-- HOW THEY WENT MISSING. The schema used to live in ~20 unordered .sql
-- files at the repository root. Those were consolidated into
-- supabase/migrations/ and the originals moved to archive/. Four
-- `alter table ... add column` statements did not make the crossing.
-- They are still in archive/supabase_complete_schema.sql, and they are
-- still in the production database, which is why nothing is broken today.
--
-- WHAT IS BROKEN IS EVERY OTHER DATABASE. A staging project, a disaster
-- recovery restore, a second region, a new developer's local Supabase —
-- anything built from supabase/migrations/ alone gets a schema the
-- application cannot run on. That is also why the three e2e journeys have
-- never run: they need a staging deployment, and a staging deployment
-- built from these migrations would fail on the first mission edit.
--
-- FOUND BY MEASUREMENT, not by reading. Every `.select()`, `.eq()`,
-- `.order()`, `.insert()` and `.update()` string in src/ was checked
-- against the schema these migrations actually build. That check is now
-- part of db-migrations.test.mjs so the next one cannot go unnoticed.
--
-- WHAT EACH ONE DOES. All four are concurrency control, which is the
-- worst category to lose silently: the code keeps working, it just stops
-- being safe under load.
--
-- IDEMPOTENT. add-column-if-not-exists throughout, so this is a no-op
-- against the production database that already has all four. No DROP, no
-- TRUNCATE, no DELETE. No data is written or moved.
--
-- NUMBERED BEFORE 20260818000000_function_grants.sql, which must stay
-- last: it loops over pg_proc and can only cover routines that already
-- exist. This file creates no routine.

-- ----------------------------------------------------------------------
-- 1. ai_missions.plan_steps_version — the optimistic lock on plan steps.
-- ----------------------------------------------------------------------
-- lib/mission-plan-steps.ts reads the version, computes the next steps,
-- and writes with `.eq("plan_steps_version", currentVersion)`. If the row
-- moved in between, the UPDATE matches zero rows and the caller retries.
--
-- Without the column that read-modify-write has no guard at all, and two
-- concurrent edits to the same mission silently keep only the last one.
-- NOT NULL DEFAULT 0 rather than nullable: a null version compares
-- unequal to everything, so the guard would refuse every write instead of
-- allowing the first.
alter table public.ai_missions
  add column if not exists plan_steps_version integer not null default 0;

comment on column public.ai_missions.plan_steps_version is
  'Optimistic lock for plan_steps. Read, then written back with .eq() on the value that was read (lib/mission-plan-steps.ts) — a write that lost the race matches zero rows and is retried rather than overwriting a concurrent edit.';

-- ----------------------------------------------------------------------
-- 2. user_websites.editing_started_at — the AI-edit claim.
-- ----------------------------------------------------------------------
-- api/websites/edit claims a site with
--   .update({ editing_started_at: now })
--   .or("editing_started_at.is.null,editing_started_at.lt.<stale cutoff>")
-- so exactly one request can be editing a site at a time, and a request
-- that died mid-edit releases its claim by going stale rather than
-- locking the site forever. Cleared back to null when the edit finishes.
alter table public.user_websites
  add column if not exists editing_started_at timestamptz;

comment on column public.user_websites.editing_started_at is
  'Set while an AI edit is in flight, cleared when it finishes. Claimed conditionally (null OR older than the stale cutoff) so two concurrent edits cannot both run and a crashed edit does not lock the site permanently.';

-- ----------------------------------------------------------------------
-- 3. user_websites.stuck_notified_at — told them once.
-- ----------------------------------------------------------------------
-- The cron looks for generations that have been running too long and
-- emails the owner. `.is("stuck_notified_at", null)` is what makes that
-- ONE email rather than one per cron tick, forever.
--
-- Nullable with no default, deliberately: null means "not yet told", and
-- every existing row is correctly not-yet-told.
alter table public.user_websites
  add column if not exists stuck_notified_at timestamptz;

comment on column public.user_websites.stuck_notified_at is
  'When the owner was told this generation appears stuck. NULL means not yet told; the cron filters on IS NULL so the notice is sent once rather than on every tick.';

-- ----------------------------------------------------------------------
-- 4. user_automations.processing_started_at — the same claim, for cron.
-- ----------------------------------------------------------------------
-- Two overlapping cron invocations can both see the same automation as
-- due. This is the atomic claim that decides which one runs it — the same
-- mechanism user_agents.processing_started_at already has (and that one
-- IS in the migrations, which is how the omission stayed invisible).
alter table public.user_automations
  add column if not exists processing_started_at timestamptz;

comment on column public.user_automations.processing_started_at is
  'Atomic claim against two overlapping cron invocations both executing the same due automation. Claimed conditionally (null OR older than the stale cutoff), cleared when the run ends. Mirrors user_agents.processing_started_at.';

-- ----------------------------------------------------------------------
-- The indexes those claims scan.
-- ----------------------------------------------------------------------
-- Partial, on exactly the rows the claim query can match, so they stay
-- small however many finished rows accumulate behind them.
create index if not exists user_websites_stuck_unnotified_idx
  on public.user_websites (created_at)
  where stuck_notified_at is null;

-- No policy changes. All three tables are already select-own from the
-- browser with writes through the service role; a new column inherits
-- both, and nothing in a browser writes to any of these columns.
