-- ============================================================================
-- THE MEMORY STOPS BEING A CHAT FEATURE (V6 #2)
-- ============================================================================
--
-- `chat_memory` already holds the hard parts: a fold-keyed unique index so
-- one fact is one row, `times_seen` so "prefers X" can be told from "did X
-- once", and `last_seen_at` so something from last year is not quoted like
-- something from Tuesday. What it does not hold is WHERE a thing was
-- learned, and that is the whole of what stops the Website Builder, the
-- deck writer, the post writer, the coding assistant and the agents from
-- reading the same memory the chat does.
--
-- ----------------------------------------------------------------------------
-- THE TABLE KEEPS ITS NAME, AND THAT IS DELIBERATE
-- ----------------------------------------------------------------------------
--
-- `ai_memory` would read better. Renaming it would also move four RLS
-- policies, a SECURITY DEFINER function, a partial unique index, the GDPR
-- export registry (lib/gdpr/user-data-registry.ts), a schema canary
-- (lib/health/schema-canaries.ts) and the retention cron — for a noun. The
-- column below says what the row is about; the table name is where it
-- started.
--
-- ----------------------------------------------------------------------------
-- ONE ROW PER FACT, ACROSS ALL SURFACES — NOT ONE PER SURFACE
-- ----------------------------------------------------------------------------
--
-- The unique index stays `(user_id, memory_fold)`. Saying "I write in
-- short paragraphs" in the chat and again while editing a website is ONE
-- fact seen twice, not two facts: it bumps times_seen, which is exactly
-- the signal the prompt uses to call something a preference rather than a
-- remark. Keying the index by surface as well would split that counter
-- five ways and every fact would read as "mentioned once" for ever.
--
-- So `surface` records where a fact was FIRST learned — the same rule
-- source_conversation_id already follows, and for the same reason: it is
-- provenance, not scope.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

-- The prerequisite, named rather than assumed: this migration adds columns
-- to a table and rewrites a function that 20261003000000 created.
do $$
begin
  if to_regclass('public.chat_memory') is null then
    raise exception 'public.chat_memory is missing — run 20260803000000_baseline_schema.sql first';
  end if;
  if to_regprocedure('public.chat_memory_record(text,text,uuid)') is null then
    raise exception 'chat_memory_record(text,text,uuid) is missing — run 20261003000000_chat_memory_dedup_and_retention.sql first';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. WHERE IT WAS LEARNED, AND WHAT KIND OF THING IT IS
-- ----------------------------------------------------------------------------

alter table public.chat_memory
  add column if not exists surface text not null default 'chat';

alter table public.chat_memory
  add column if not exists kind text not null default 'fact';

-- THE LIST IS CLOSED, and the default backfills every existing row to
-- 'chat', which is where every row in the table was in fact learned.
--
-- A check constraint rather than an enum: adding a surface later is then
-- one ALTER of this constraint instead of an ALTER TYPE that cannot run
-- inside a transaction with other statements on some managed hosts.
alter table public.chat_memory drop constraint if exists chat_memory_surface_check;
alter table public.chat_memory add constraint chat_memory_surface_check
  check (surface in ('chat', 'website', 'presentation', 'posts', 'coding', 'agent'));

-- FOUR KINDS, and they are not decoration: the prompt says a different
-- sentence about each. A 'correction' is the user telling the product it
-- got something wrong, which outranks a 'preference' it inferred; an
-- 'approval' is them accepting a proposal, which is the weakest of the
-- four because accepting one deck layout is not a house style.
alter table public.chat_memory drop constraint if exists chat_memory_kind_check;
alter table public.chat_memory add constraint chat_memory_kind_check
  check (kind in ('fact', 'preference', 'correction', 'approval'));

-- The read is `where user_id = ? order by last_seen_at desc limit N`, and
-- now optionally `and surface = ?` for the per-feature list on
-- /dashboard/ai-memory. This index serves the filtered read; the existing
-- (user_id, last_seen_at desc) one still serves the unfiltered prompt read.
create index if not exists chat_memory_user_surface_last_seen_idx
  on public.chat_memory (user_id, surface, last_seen_at desc);

-- ----------------------------------------------------------------------------
-- 2. memory_record — the same insert-or-bump, told where it happened
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER and the identity comes from auth.uid(), never from an
-- argument: a userId parameter here would be a write-anything primitive.
-- That rule is inherited from chat_memory_record and is the reason this is
-- a function at all rather than an upsert from the client — chat_memory
-- has no UPDATE policy on purpose, and a counter is not a reason to add one.

create or replace function public.memory_record(
  p_memory_text text,
  p_memory_fold text,
  p_surface text,
  p_kind text,
  p_conversation_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'memory_record: no authenticated user' using errcode = '28000';
  end if;
  if p_memory_text is null or length(btrim(p_memory_text)) = 0 then
    return null;
  end if;
  if p_memory_fold is null or length(btrim(p_memory_fold)) = 0 then
    raise exception 'memory_record: a fold is required' using errcode = '22023';
  end if;
  -- AN UNKNOWN SURFACE IS REFUSED, NOT COERCED TO 'chat'. A typo'd surface
  -- silently filed under chat would be invisible in the per-feature list
  -- and impossible to switch off — the setting would look ignored.
  if p_surface is null or p_surface not in ('chat', 'website', 'presentation', 'posts', 'coding', 'agent') then
    raise exception 'memory_record: unknown surface %', p_surface using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('fact', 'preference', 'correction', 'approval') then
    raise exception 'memory_record: unknown kind %', p_kind using errcode = '22023';
  end if;

  -- SEEN AGAIN, WHEREVER IT WAS SEEN. The fold is the key, so the same
  -- fact arriving from a different feature bumps the counter rather than
  -- splitting it. `surface` and `kind` are NOT overwritten: they say where
  -- and how this was first learned, the same way source_conversation_id
  -- keeps the first conversation.
  --
  -- The ONE exception is a correction. If the user corrects something the
  -- product had merely inferred, that is a stronger claim than the one on
  -- the row, and the row should say so.
  update public.chat_memory
     set times_seen   = times_seen + 1,
         last_seen_at = now(),
         kind         = case when p_kind = 'correction' then 'correction' else kind end,
         source_conversation_id = coalesce(source_conversation_id, p_conversation_id)
   where user_id = v_user
     and memory_fold = p_memory_fold
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.chat_memory
    (user_id, memory_text, memory_fold, surface, kind, source_conversation_id)
  values
    (v_user, p_memory_text, p_memory_fold, p_surface, p_kind, p_conversation_id)
  -- Two extractions of the same fact can land at once; the partial unique
  -- index turns that race into a bump rather than an error.
  on conflict (user_id, memory_fold) where memory_fold is not null
  do update set times_seen = chat_memory.times_seen + 1,
                last_seen_at = now()
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function public.memory_record(text, text, text, text, uuid) from public;
grant execute on function public.memory_record(text, text, text, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. THE OLD THREE-ARGUMENT FUNCTION STAYS, AND DELEGATES
-- ----------------------------------------------------------------------------
-- Migrations here are pasted by hand, so there is a window where the new
-- SQL has run and the old code is still deployed — or the reverse. A
-- three-argument call that suddenly did not exist would break chat memory
-- for the length of that window, silently, because the caller logs and
-- carries on.
--
-- It is not deprecated-and-left: it now writes the same row the new
-- function does, under the surface it always meant.
create or replace function public.chat_memory_record(
  p_memory_text text,
  p_memory_fold text,
  p_conversation_id uuid
)
returns uuid
language sql
volatile
security definer
set search_path = public, pg_temp
as $fn$
  select public.memory_record(p_memory_text, p_memory_fold, 'chat', 'fact', p_conversation_id);
$fn$;

revoke all on function public.chat_memory_record(text, text, uuid) from public;
grant execute on function public.chat_memory_record(text, text, uuid) to authenticated;

-- What the table holds now, per surface. A surface with rows nobody can
-- see is the failure this migration exists to make impossible.
select surface, kind, count(*) as rows, count(distinct user_id) as accounts
from public.chat_memory
group by surface, kind
order by rows desc;
