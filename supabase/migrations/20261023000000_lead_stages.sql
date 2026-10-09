-- ---------------------------------------------------------------------------
-- A CONTACT'S STAGE, AND THE REMINDER THAT GOES WITH MOVING IT (2026-10-08,
-- MASTER 16 package 18: «περνάω μια επαφή από στάδιο σε στάδιο, με
-- υπενθύμιση»), behind the switch "finance-sales".
--
-- leads.stage             where the contact is: new, contacted, meeting,
--                         proposal, won, lost. Every existing row is 'new'.
-- leads.stage_changed_at  when it was last moved.
-- leads.remind_at         when to remind the person about it; null: never.
-- leads.reminded_at       when the reminder went out (api/cron/lead-
--                         reminders); a move clears it, so the next one goes.
--
-- Written by api/sales/[id]/stage through the person's own session, so the
-- existing RLS on leads decides whose row it is. The reminder job reads due
-- rows through the service role, by the partial index below.
--
-- Idempotent: add column if not exists, drop constraint if exists.
--
-- How to undo: alter table public.leads drop column if exists stage,
--              drop column if exists stage_changed_at, drop column if
--              exists remind_at, drop column if exists reminded_at;
--              (the contacts stay; only where they stood and their
--              reminders go. The index and the check go with the columns.)
-- ---------------------------------------------------------------------------

alter table public.leads add column if not exists stage text not null default 'new';
alter table public.leads drop constraint if exists leads_stage_check;
alter table public.leads add constraint leads_stage_check
  check (stage in ('new', 'contacted', 'meeting', 'proposal', 'won', 'lost'));
alter table public.leads add column if not exists stage_changed_at timestamptz;
alter table public.leads add column if not exists remind_at timestamptz;
alter table public.leads add column if not exists reminded_at timestamptz;

create index if not exists leads_due_reminders_idx
  on public.leads (remind_at)
  where remind_at is not null and reminded_at is null;

comment on column public.leads.stage is
  'Where the contact stands: new, contacted, meeting, proposal, won, lost (package 18). Moved by api/sales/[id]/stage.';
comment on column public.leads.remind_at is
  'When to remind the person about this contact; sent by api/cron/lead-reminders, which then sets reminded_at.';
