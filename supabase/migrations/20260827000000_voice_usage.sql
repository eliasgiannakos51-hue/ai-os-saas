-- ============================================================================
-- VOICE: THE MONTHLY MINUTE LEDGER
-- ============================================================================
--
-- WHAT THIS TABLE IS FOR, and what it is deliberately NOT.
--
-- IT COUNTS SECONDS. Nothing else. Not the audio, not the transcript, not
-- what was said, not the language, not the device. A row here says "this
-- account used 47 seconds of speech-in and 12 seconds of speech-out in
-- August" and that is the entire content.
--
-- THE AUDIO IS NEVER STORED. There is no bucket, no column and no
-- reference to one anywhere in this feature. A recording is a multipart
-- body that reaches a route, is forwarded to the transcription provider,
-- and is garbage-collected when the request ends. The synthesised speech
-- is streamed to the browser and never written down either. That is a
-- product rule (the brief's "τα ηχητικά ΔΕΝ αποθηκεύονται"), and the
-- strongest form of it is a schema with nowhere to put them.
--
-- WHY A LEDGER AT ALL. The per-plan minute cap has to be enforced, and
-- enforcing a monthly cap needs a monthly total. Deriving it from
-- ai_cost_log would work until somebody changed a feature string.
--
-- THE CONSUME IS ATOMIC. Two tabs recording at once must not both read
-- "29 minutes used, 30 allowed" and both proceed — the check and the
-- write are one statement, and the function returns whether it fitted.
-- That is the same lesson deduct_credits_atomic exists for.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

create table if not exists public.voice_usage (
  user_id uuid not null references auth.users(id) on delete cascade,

  -- The first day of the month, in UTC. A date rather than a timestamp
  -- because the thing being counted is a calendar month, and a timestamp
  -- invites somebody to compare it with now() and get a different answer
  -- in Athens than in Lisbon.
  month date not null,

  -- Speech IN: seconds of audio sent for transcription.
  transcribe_seconds integer not null default 0,
  -- Speech OUT: characters synthesised, and the seconds they count as.
  -- Both, because the cap is expressed in seconds and the COST is
  -- expressed in characters — keeping only one would mean deriving the
  -- other with a rate that could change.
  speak_characters integer not null default 0,
  speak_seconds integer not null default 0,

  updated_at timestamptz not null default now(),

  primary key (user_id, month),

  -- Nothing may go backwards. A negative here would be a bug that hands
  -- somebody unlimited minutes, and it would look like ordinary use.
  constraint voice_usage_non_negative check (
    transcribe_seconds >= 0 and speak_characters >= 0 and speak_seconds >= 0
  )
);

create index if not exists voice_usage_month_idx on public.voice_usage (month);

alter table public.voice_usage enable row level security;

-- READ-ONLY TO THE OWNER. The settings screen shows "12 of 90 minutes
-- used this month", and that is the whole of what a user needs from this
-- table.
drop policy if exists voice_usage_select_own on public.voice_usage;
create policy voice_usage_select_own
  on public.voice_usage for select using (auth.uid() = user_id);

-- NO INSERT, UPDATE OR DELETE POLICY. Every write goes through
-- consume_voice_seconds below, which runs as the table owner. A user who
-- could update this could set their own usage to zero and have unlimited
-- minutes — the cap would still be enforced, against a number they
-- control.
grant select on public.voice_usage to authenticated;
revoke insert, update, delete on public.voice_usage from authenticated;
revoke all on public.voice_usage from anon;

-- ----------------------------------------------------------------------
-- The atomic consume
-- ----------------------------------------------------------------------
-- Returns the state AFTER the attempt, and whether it was allowed.
--
-- CHECK AND WRITE IN ONE STATEMENT. The insert-on-conflict below does
-- both: it only adds the seconds when the resulting total would stay
-- within the cap, and the WHERE on the DO UPDATE is what makes that a
-- single atomic decision rather than a read followed by a hope.
--
-- p_limit_seconds is passed IN rather than looked up, because the cap
-- lives in lib/voice/voice-pricing.ts with its env overrides and a second
-- copy in SQL is a second copy to keep in step.
create or replace function public.consume_voice_seconds(
  p_user_id uuid,
  p_seconds integer,
  p_characters integer,
  p_limit_seconds integer,
  p_kind text
)
returns table (allowed boolean, used_seconds integer, remaining_seconds integer)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_month date := date_trunc('month', (now() at time zone 'utc'))::date;
  v_seconds integer := greatest(coalesce(p_seconds, 0), 0);
  v_chars integer := greatest(coalesce(p_characters, 0), 0);
  v_limit integer := greatest(coalesce(p_limit_seconds, 0), 0);
  v_used integer;
begin
  if p_kind is null or p_kind not in ('transcribe', 'speak') then
    raise exception 'consume_voice_seconds: unknown kind %', p_kind using errcode = '22023';
  end if;

  -- The row must exist before the conditional update can find it, and
  -- creating it with zeroes changes no total.
  insert into public.voice_usage (user_id, month)
  values (p_user_id, v_month)
  on conflict (user_id, month) do nothing;

  -- ONE STATEMENT. The WHERE is the cap: an update that would exceed it
  -- simply matches no row, and `v_used` stays null — which is how the
  -- refusal is detected without a second read that another session could
  -- interleave with.
  update public.voice_usage
     set transcribe_seconds = transcribe_seconds + case when p_kind = 'transcribe' then v_seconds else 0 end,
         speak_seconds      = speak_seconds      + case when p_kind = 'speak' then v_seconds else 0 end,
         speak_characters   = speak_characters   + case when p_kind = 'speak' then v_chars else 0 end,
         updated_at         = now()
   where user_id = p_user_id
     and month = v_month
     and transcribe_seconds + speak_seconds + v_seconds <= v_limit
  returning transcribe_seconds + speak_seconds into v_used;

  if v_used is null then
    -- Refused. Report the CURRENT total so the caller can say how much
    -- is left rather than only that it did not fit.
    select transcribe_seconds + speak_seconds into v_used
      from public.voice_usage
     where user_id = p_user_id and month = v_month;
    v_used := coalesce(v_used, 0);
    return query select false, v_used, greatest(v_limit - v_used, 0);
    -- RETURN QUERY ACCUMULATES; IT DOES NOT EXIT. Without this `return`
    -- the refusal fell through to the success row below and the function
    -- answered a refused request with TWO rows: (false, ...) followed by
    -- (true, ...). Found by scripts/tests/voice.dbtest.mjs, which now
    -- asserts the row COUNT as well as the row.
    --
    -- The routes read row 0, so nothing shipped wrong — which is exactly
    -- what made it worth fixing rather than noting: a caller that used
    -- `order by`, `limit 1` on the wrong end, or simply the last row
    -- would have been told an over-cap request was allowed, and the
    -- monthly ceiling on a metered external cost would have been a
    -- suggestion.
    return;
  end if;

  return query select true, v_used, greatest(v_limit - v_used, 0);
end;
$$;

-- What the settings screen reads. SECURITY INVOKER, so the select policy
-- above is what scopes it — a definer function here would be a
-- read-anybody's-usage primitive for one number nobody needs about
-- somebody else.
create or replace function public.voice_usage_this_month(p_user_id uuid)
returns table (transcribe_seconds integer, speak_seconds integer, speak_characters integer)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select
    coalesce(v.transcribe_seconds, 0),
    coalesce(v.speak_seconds, 0),
    coalesce(v.speak_characters, 0)
  from (select 1) one
  left join public.voice_usage v
    on v.user_id = p_user_id
   and v.month = date_trunc('month', (now() at time zone 'utc'))::date;
$$;

-- ----------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------
-- consume_voice_seconds is SECURITY DEFINER and writes the ledger the cap
-- is enforced against, so ONLY the service role may call it — the routes
-- do, after checking who is asking. A signed-in user who could call it
-- could consume somebody else's month.
do $$
begin
  execute 'revoke all on function public.consume_voice_seconds(uuid, integer, integer, integer, text) from public';
  execute 'revoke all on function public.consume_voice_seconds(uuid, integer, integer, integer, text) from anon';
  execute 'revoke all on function public.consume_voice_seconds(uuid, integer, integer, integer, text) from authenticated';
  execute 'grant execute on function public.consume_voice_seconds(uuid, integer, integer, integer, text) to service_role';

  execute 'revoke all on function public.voice_usage_this_month(uuid) from public';
  execute 'revoke all on function public.voice_usage_this_month(uuid) from anon';
  execute 'grant execute on function public.voice_usage_this_month(uuid) to authenticated';
  execute 'grant execute on function public.voice_usage_this_month(uuid) to service_role';
end $$;
