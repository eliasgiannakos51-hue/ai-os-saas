-- ---------------------------------------------------------------------------
-- Q&A ABOUT ONE MEETING, FROM A FIELD (Meetings «ΝΕΑ ΟΘΟΝΗ», Κομμάτι 6,
-- 2026-10-29). Same shape as data_analysis_questions
-- (20260902000000_data_analysis_and_coding.sql): one row per question, kept
-- so the answer is there again when the meeting is reopened rather than
-- re-asked. Answered strictly from THIS meeting's own transcript/summary/
-- proposed_actions (lib/meetings/meeting-ask.ts) — never another meeting's,
-- never the account's other data.
--
-- Idempotent: create table if not exists.
--
-- How to undo: drop table if exists public.meeting_questions;
-- ---------------------------------------------------------------------------

create table if not exists public.meeting_questions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  question text not null,
  answer text,
  credits_charged int not null default 0 check (credits_charged >= 0),

  created_at timestamptz not null default now()
);

create index if not exists meeting_questions_meeting_idx
  on public.meeting_questions (meeting_id, created_at desc);

alter table public.meeting_questions enable row level security;

drop policy if exists "meeting_questions_select_own" on public.meeting_questions;
create policy "meeting_questions_select_own" on public.meeting_questions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "meeting_questions_delete_own" on public.meeting_questions;
create policy "meeting_questions_delete_own" on public.meeting_questions
  for delete to authenticated using (auth.uid() = user_id);

-- INSERT IS SERVICE-ROLE ONLY, same reason data_analysis_questions's own
-- grant is: the answer and the credits charged are written by the route
-- AFTER the call, and a user who could insert could write themselves a
-- free answer in our voice, or a real one at zero charge.
grant select, delete on public.meeting_questions to authenticated;
revoke insert, update on public.meeting_questions from authenticated;
revoke all on public.meeting_questions from anon;
