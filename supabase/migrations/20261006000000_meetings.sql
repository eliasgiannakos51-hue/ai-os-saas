-- ============================================================================
-- MEETING -> ACTIONS (V6 #1)
-- ============================================================================
--
-- A recording goes in; a transcript, a summary and a list of PROPOSED
-- actions come back. The proposals are inert until somebody presses Keep.
--
-- ----------------------------------------------------------------------------
-- THERE IS NO AUDIO COLUMN, AND THAT IS THE DESIGN
-- ----------------------------------------------------------------------------
--
-- Not "the audio is deleted promptly". There is nowhere to put it: no
-- column here, no bucket, no storage path. The upload lives as a Blob in
-- one serverless invocation's memory, goes to the transcription provider,
-- and is unreferenced when that function returns — the same arrangement
-- api/voice/transcribe has had since 20260827, and for the same reason.
--
-- A voice is a biometric identifier, and the people in a meeting did not
-- consent to anything. A `finally` block would be a promise; a schema
-- with no place to write it is a fact. It also means no cron, no orphan
-- sweep, and no function killed at its ceiling leaving a recording of
-- somebody's staff meeting in a bucket.
--
-- ----------------------------------------------------------------------------
-- WHY THE PROPOSALS ARE A COLUMN AND THE KEPT ONES ARE A TABLE
-- ----------------------------------------------------------------------------
--
-- `meetings.proposed_actions` is jsonb: the model's reading of the
-- transcript, stored as DATA ABOUT THE MEETING. It is not an entity, it
-- is not in the search index, nothing joins to it and no other screen
-- shows it.
--
-- `meeting_actions` only ever receives a row the user chose. That is what
-- makes "no action is ever created automatically" checkable rather than
-- asserted: it is not a rule about intent, it is that the automatic path
-- writes to a jsonb column and the table has exactly one writer.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- What the user called it, or the first words of the transcript if they
  -- called it nothing. Never the filename: a filename is often a person's
  -- name plus a date and it is not what they meant to publish.
  title text not null default '',

  -- The language the MEETING was held in, as the provider detected it —
  -- NOT the interface locale. The summary and every proposed action are
  -- written in this language, because a Greek meeting summarised in
  -- English is a translation nobody asked for and a name the model has
  -- already had one chance to get wrong.
  language text,

  transcript text not null default '',
  summary text,

  -- The model's output, inert. Shape: [{ who, what, when }] — see
  -- lib/meetings/meeting-analysis.ts, which is where it is parsed and
  -- where an unparseable reply becomes an empty list rather than a guess.
  proposed_actions jsonb not null default '[]'::jsonb,

  -- Seconds of audio, as the browser measured them or as the byte count
  -- implies when it could not. A receipt for the history list; the meter
  -- is voice_usage and the ledger is credit_transactions.
  duration_seconds integer not null default 0,
  credits_charged integer not null default 0,

  -- A reason CODE, never a sentence: the page renders its own translated
  -- wording. 'ai_unavailable', 'unusable'.
  analysis_error text,

  created_at timestamptz not null default now(),
  analysed_at timestamptz
);

alter table public.meetings drop constraint if exists meetings_duration_check;
alter table public.meetings add constraint meetings_duration_check
  check (duration_seconds >= 0);

alter table public.meetings drop constraint if exists meetings_credits_check;
alter table public.meetings add constraint meetings_credits_check
  check (credits_charged >= 0);

-- The proposals are a LIST. A jsonb object here would still parse in the
-- route and then render as nothing, which is the failure that looks like
-- "the model found no actions".
alter table public.meetings drop constraint if exists meetings_proposed_actions_check;
alter table public.meetings add constraint meetings_proposed_actions_check
  check (jsonb_typeof(proposed_actions) = 'array');

create index if not exists meetings_user_created_idx
  on public.meetings (user_id, created_at desc);

-- ----------------------------------------------------------------------------

create table if not exists public.meeting_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,

  -- WHO, WHAT, WHEN — the three the user asked for, and `who` and `when`
  -- are nullable on purpose. A meeting where nobody says who is doing it
  -- is the common case, and inventing a name to fill a column is the one
  -- thing an action list must never do.
  who text,
  what text not null,
  when_text text,

  -- Parsed from when_text where it is unambiguous, null where it is not.
  -- "next week" has no date; writing one would put a deadline in somebody's
  -- list that nobody in the room agreed to.
  due_date date,

  -- Which entry of meetings.proposed_actions this came from, so the
  -- screen can tell a kept proposal from one still on offer without
  -- comparing text.
  source_index integer,

  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.meeting_actions drop constraint if exists meeting_actions_what_check;
alter table public.meeting_actions add constraint meeting_actions_what_check
  check (length(btrim(what)) > 0);

create index if not exists meeting_actions_user_created_idx
  on public.meeting_actions (user_id, created_at desc);
create index if not exists meeting_actions_meeting_idx
  on public.meeting_actions (meeting_id);

-- ----------------------------------------------------------------------------
-- RLS, AND THE GRANT THAT MAKES IT MEAN ANYTHING
-- ----------------------------------------------------------------------------
-- A policy without a grant is a locked door with no handle; a grant
-- without a policy is a door with no lock. Both, every time — the rule
-- 20260928000000 was written about.

alter table public.meetings enable row level security;
alter table public.meeting_actions enable row level security;

drop policy if exists "meetings_select_own" on public.meetings;
create policy "meetings_select_own" on public.meetings
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "meetings_insert_own" on public.meetings;
create policy "meetings_insert_own" on public.meetings
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "meetings_update_own" on public.meetings;
create policy "meetings_update_own" on public.meetings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "meetings_delete_own" on public.meetings;
create policy "meetings_delete_own" on public.meetings
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "meeting_actions_select_own" on public.meeting_actions;
create policy "meeting_actions_select_own" on public.meeting_actions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "meeting_actions_insert_own" on public.meeting_actions;
create policy "meeting_actions_insert_own" on public.meeting_actions
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "meeting_actions_update_own" on public.meeting_actions;
create policy "meeting_actions_update_own" on public.meeting_actions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "meeting_actions_delete_own" on public.meeting_actions;
create policy "meeting_actions_delete_own" on public.meeting_actions
  for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.meetings to authenticated;
grant select, insert, update, delete on public.meeting_actions to authenticated;
revoke all on public.meetings from anon;
revoke all on public.meeting_actions from anon;
