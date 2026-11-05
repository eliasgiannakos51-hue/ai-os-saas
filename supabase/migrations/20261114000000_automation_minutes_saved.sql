-- ---------------------------------------------------------------------------
-- HOW MANY MINUTES ONE RUN OF AN AUTOMATION SAVES ITS OWNER (the owner,
-- 2026-11-05: «Σου γλίτωσε ~X ώρες», after the automation videos; behind
-- the switch "automation-time-saved").
--
-- ONE NULLABLE COLUMN, SET BY THE PERSON AND BY NOBODY ELSE. It is the
-- answer to «πόσα λεπτά σου έπαιρνε αυτό;», typed on the automation and
-- written by PATCH /api/automations/flows/[id] (src/app/api/automations/
-- flows/[id]/route.ts) with user_id from the session. NULL — every
-- existing row, and every row whose owner never answered — means "not
-- said", and the screen then shows no time saved at all: the number is
-- runs × these minutes (src/lib/automations/time-saved.ts), and without
-- these minutes there is no number to show. No backfill, no default: a
-- default would be a figure we made up and printed as theirs.
--
-- BOUNDED WHERE THE CODE BOUNDS IT: 1 to 480 minutes (MIN_MINUTES,
-- MAX_MINUTES in src/lib/automations/time-saved.ts), one working day
-- being the most one run can honestly be said to replace.
--
-- THE APP WORKS BEFORE THIS IS PASTED. The page reads this column in a
-- query of its own (src/lib/automations/page-data.ts) and, when the
-- database answers that it has no such column, hides the minutes field
-- and the time saved entirely; FLOW_COLUMNS does not name it, so every
-- other read of an automation is the same as before this file.
--
-- automation_flows already carries row level security, an owner-only
-- select and no insert/update from the browser
-- (20261021000000_automation_flows.sql); a new column inherits all three.
--
-- Idempotent: add column if not exists, drop constraint if exists before
-- re-adding. No DROP TABLE, no TRUNCATE, no DELETE.
-- How to check it after running: npm run db:pending; /api/health lists
-- automation_flows.minutes_saved among the schema canaries.
-- How to undo: alter table public.automation_flows drop constraint if exists
--              automation_flows_minutes_saved_range;
--              alter table public.automation_flows drop column if exists
--              minutes_saved;
--              (every automation, its boxes, versions and runs are
--              untouched — only the minutes people typed are lost, and the
--              time saved stops showing.)
-- ---------------------------------------------------------------------------

alter table public.automation_flows add column if not exists minutes_saved integer;

alter table public.automation_flows drop constraint if exists automation_flows_minutes_saved_range;
alter table public.automation_flows add constraint automation_flows_minutes_saved_range
  check (minutes_saved is null or minutes_saved between 1 and 480);

comment on column public.automation_flows.minutes_saved is
  'Minutes one finished run saves the owner, as the owner typed it; NULL for not said. Time saved = finished non-trial runs × this (src/lib/automations/time-saved.ts).';
