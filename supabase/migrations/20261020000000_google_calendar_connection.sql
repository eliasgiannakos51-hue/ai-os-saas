-- ---------------------------------------------------------------------------
-- GOOGLE CALENDAR AS A CONNECTION (2026-10-07, MASTER 16 package 31, behind
-- the switch "google-calendar").
--
-- user_integrations.provider was checked against three names since the
-- baseline (gmail, google_drive, slack). The Calendar connection
-- (src/lib/integrations/providers.ts, google_calendar) is a fourth, and the
-- OAuth callback's save is refused by the old check until this runs —
-- the person would go through Google's consent and come back to
-- "could not be saved".
--
-- The constraint is the one the baseline created inline; Postgres named it
-- user_integrations_provider_check. Dropped and added again with the
-- fourth name, nothing else changed: no row is touched.
--
-- Idempotent: drop if exists, then add.
-- How to check it after running: npm run db:pending.
-- How to undo: alter table public.user_integrations drop constraint user_integrations_provider_check;
--              alter table public.user_integrations add constraint user_integrations_provider_check
--                check (provider in ('gmail', 'google_drive', 'slack'));
--              (refused while a google_calendar row exists — disconnect those first,
--              which deletes their tokens: ask before doing it.)
-- ---------------------------------------------------------------------------

alter table public.user_integrations drop constraint if exists user_integrations_provider_check;
alter table public.user_integrations add constraint user_integrations_provider_check
  check (provider in ('gmail', 'google_drive', 'google_calendar', 'slack'));

-- It says so if it did not take, rather than leaving the first Calendar
-- connection to find out.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'user_integrations_provider_check'
       and conrelid = 'public.user_integrations'::regclass
       and pg_get_constraintdef(oid) like '%google_calendar%'
  ) then
    raise exception '20261020000000: user_integrations_provider_check does not allow google_calendar';
  end if;
end $$;
