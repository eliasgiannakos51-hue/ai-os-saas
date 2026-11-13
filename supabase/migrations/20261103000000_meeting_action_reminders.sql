-- ---------------------------------------------------------------------------
-- A KEPT ACTION CAN CARRY A REMINDER (Meetings «ΝΕΑ ΟΘΟΝΗ», Κομμάτι 4,
-- 2026-10-29: «Make a goal» and «Remind me»). Same shape as
-- leads.remind_at/reminded_at (20261023000000_lead_stages.sql) — one
-- mechanism, not two: the same cron pattern, the same push channel
-- ("mission_reminders"), the same partial index.
--
-- meeting_actions.remind_at    when to remind the person about it; null:
--                              never. Set by the person, through the date
--                              picker — NEVER parsed or guessed from
--                              when_text. due_date stays exactly as it was
--                              (always null): «μέχρι την Παρασκευή» still
--                              has no date until somebody decides which
--                              Friday, and this column is that decision,
--                              made once, by the person, not invented here.
-- meeting_actions.reminded_at  when the reminder went out (api/cron/
--                              meeting-action-reminders, which then sets
--                              it). Setting a new remind_at clears it, so
--                              the new reminder is the one that fires.
--
-- Written by api/meetings/[id]/actions/[actionId]/remind through the
-- person's own session, so the existing RLS on meeting_actions
-- (meeting_actions_update_own) decides whose row it is. The reminder job
-- reads due rows through the service role, by the partial index below.
--
-- Idempotent: add column if not exists.
--
-- How to undo: alter table public.meeting_actions drop column if exists
--              remind_at, drop column if exists reminded_at; drop index if
--              exists meeting_actions_remind_idx; (the actions stay; only
--              their reminders go.)
-- ---------------------------------------------------------------------------

alter table public.meeting_actions add column if not exists remind_at timestamptz;
alter table public.meeting_actions add column if not exists reminded_at timestamptz;

create index if not exists meeting_actions_remind_idx
  on public.meeting_actions (remind_at)
  where remind_at is not null and reminded_at is null;

comment on column public.meeting_actions.remind_at is
  'When to remind the person about this action; sent by api/cron/meeting-action-reminders, which then sets reminded_at.';
