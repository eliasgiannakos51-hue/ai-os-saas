-- ============================================================================
-- LIVE VOICE CONVERSATION: WHICH CALLS ARE OPEN, AND UNTIL WHEN THEY ARE PAID
-- (FS1, the owner's «33. ΦΩΝΗΤΙΚΗ ΣΥΝΟΜΙΛΙΑ ΜΕ ΤΗ ΓΗ ΤΟΥ IONEXA»)
-- ============================================================================
--
-- A live conversation is one realtime call from the browser to the speech
-- provider (src/lib/voice/live-provider.ts). The audio never passes through
-- this product's servers, so the only thing the server can meter is how long
-- the call has been open — and the only way it can stop a call whose browser
-- has stopped asking is to know the call's id and when its paid time ran out.
-- This table is that: one row per call, written by the server only.
--
--   api/voice/live/start   inserts the row after the first minute is paid
--   api/voice/live/tick    pays the next minute and moves paid_until
--   api/voice/live/end     ends the call and stamps ended_at
--   api/cron/voice-live-sweep  ends every call open past its paid_until
--
-- NO AUDIO AND NO WORDS ARE STORED HERE. The conversation as text goes to
-- chat_messages when the call ends, exactly as typed messages do; this row
-- holds ids, times and a count of minutes.
--
-- SERVER-ONLY. Row level security is on and there is no policy and no grant
-- to anon or authenticated: every read and write is the service role's, from
-- the four routes above. A browser that could write paid_until could talk
-- for free.
--
-- Erased with the account (on delete cascade), and listed in
-- src/lib/gdpr/user-data-registry.ts.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
--
-- How to undo: drop table if exists public.voice_live_sessions;
--              (the switch "voice-live" must be closed first; with it open
--              and the table gone, starting a live conversation answers
--              «not ready» and nothing is charged)
-- ============================================================================

do $$
begin
  if to_regclass('public.chat_conversations') is null then
    raise exception 'public.chat_conversations is missing — run 20260803000000_baseline_schema.sql first';
  end if;
end $$;

create table if not exists public.voice_live_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The provider's own id for the call, from the Location header of the
  -- response that opened it. What a hang-up is addressed to.
  call_id text not null,
  conversation_id uuid references public.chat_conversations(id) on delete set null,
  started_at timestamptz not null default now(),
  -- The end of the last minute that was paid for.
  paid_until timestamptz not null,
  minutes_billed integer not null default 1,
  ended_at timestamptz,
  end_reason text,
  -- Set once, by api/voice/live/end, when the conversation's text has been
  -- written to chat_messages — so a retried request cannot write it twice.
  transcript_saved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.voice_live_sessions drop constraint if exists voice_live_sessions_end_reason_check;
alter table public.voice_live_sessions add constraint voice_live_sessions_end_reason_check
  check (end_reason is null or end_reason in ('closed', 'unpaid', 'cap', 'swept', 'failed'));

alter table public.voice_live_sessions drop constraint if exists voice_live_sessions_minutes_check;
alter table public.voice_live_sessions add constraint voice_live_sessions_minutes_check
  check (minutes_billed >= 1 and minutes_billed <= 60);

alter table public.voice_live_sessions drop constraint if exists voice_live_sessions_call_id_not_blank;
alter table public.voice_live_sessions add constraint voice_live_sessions_call_id_not_blank
  check (length(btrim(call_id)) > 0);

-- What the sweep reads: the calls still open, oldest paid time first.
create index if not exists voice_live_sessions_open_idx
  on public.voice_live_sessions (paid_until)
  where ended_at is null;

create index if not exists voice_live_sessions_user_idx
  on public.voice_live_sessions (user_id, started_at desc);

alter table public.voice_live_sessions enable row level security;

revoke all on public.voice_live_sessions from anon, authenticated;
