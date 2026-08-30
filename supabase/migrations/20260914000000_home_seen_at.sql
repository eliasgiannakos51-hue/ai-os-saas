-- "What changed since last time" needs a LAST TIME, and nothing recorded one.
--
-- V4.6 #10. The block that gives somebody a reason to come back tomorrow
-- has to be able to say what is different from yesterday, and that needs
-- a timestamp per user of when they last looked at the Home.
--
-- WHY NOT user_devices.last_seen. It exists, and it is touched by
-- /api/auth/device-check on every page load — including the one currently
-- rendering. By the time the Home reads it, it says "now", which makes
-- every diff empty. A column that is written by the thing measuring it
-- cannot measure it.
--
-- ONE COLUMN ON A TABLE THAT ALREADY HAS ONE ROW PER USER, rather than a
-- new table: user_onboarding is created on first sight and carries the
-- account's other once-per-user facts.
--
-- Idempotent, like every migration here.

alter table public.user_onboarding
  add column if not exists home_seen_at timestamptz;

comment on column public.user_onboarding.home_seen_at is
  'When this user last loaded the Home. Written by /api/home/seen AFTER the page renders, so the render can diff against the PREVIOUS value. Null until the second visit — there is no "since last time" on a first one, and showing an empty block would be worse than showing none.';
