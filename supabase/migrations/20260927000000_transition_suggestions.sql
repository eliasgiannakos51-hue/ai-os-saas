-- ======================================================================
-- WHEN A BUTTON WAS OFFERED, AND WHAT HAPPENED TO IT.
--
-- WHY THIS TABLE EXISTS, in one sentence from the round that built the
-- feature without it: "there is no column anywhere for 'shown and
-- refused', so 'it suggests the wrong thing too often' stays an argument
-- rather than a number."
--
-- public.nav_events already records a button that was TAKEN — the
-- navigation happens, path and referrer land in that table like any
-- other. That is the numerator of the wrong fraction. Nothing recorded
-- the DENOMINATOR (how often one was offered at all) and nothing recorded
-- a refusal, so a suggestion that annoyed every user on every answer
-- would look exactly like one nobody ever needed.
--
-- ONE ROW PER EVENT, NOT ONE ROW PER BUTTON WITH A STATUS. This is
-- append-only: `shown` is written when a button is drawn, and `taken` or
-- `dismissed` when the user acts. There is no UPDATE policy, for the
-- reason nav_events has none — a log the writer can rewrite is not a log.
-- The rate is `dismissed / shown`, and both halves are rows.
--
-- AND IT RECORDS WHICH DETECTOR PRODUCED IT. `source` is 'offline' for
-- the free reader (lib/transitions/destinations.ts: a fold and a regex)
-- and 'model' for the paid one. That single column answers the question
-- the owner asked when approving the paid half — "how often does it
-- actually fire?" — with a count instead of an estimate.
-- ======================================================================

create table if not exists public.transition_suggestions (
  -- IDENTITY BIGINT, for nav_events' reason: these rows are appended,
  -- aggregated and deleted, never addressed. A uuid would cost width on
  -- the second-highest-write table in the schema and buy nothing.
  id bigint generated always as identity primary key,

  user_id uuid not null references auth.users(id) on delete cascade,

  -- The destination id from the CLOSED LIST in
  -- src/lib/transitions/destinations.ts — 'coding', 'websiteBuilder',
  -- 'agents', 'automation', 'deepResearch'. The shape check below is
  -- deliberately a shape and not an enum: adding a destination is a code
  -- change that should not need a migration, and an enum here would mean
  -- the day somebody adds one the insert fails in production while every
  -- local gate passes.
  destination text not null,

  -- 'offline' — the free reader placed it.
  -- 'model'   — the free reader found nothing and the paid detector ran.
  source text not null,

  -- 'shown'     — a button was drawn under an answer.
  -- 'taken'     — the user pressed it.
  -- 'dismissed' — the user closed it.
  outcome text not null,

  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------
-- 1. What may be written
-- ----------------------------------------------------------------------
-- A SHAPE, NOT A LENGTH, and nav_events is the reason that sentence is
-- here: its first path constraint was a prefix plus a length, which
-- accepted the one string the whole design existed to keep out. The ids
-- this app produces are camelCase identifiers and nothing else — no
-- spaces, no punctuation, no free text, so nothing a user typed can ever
-- reach this column even if a future writer forgets to validate.
alter table public.transition_suggestions
  drop constraint if exists transition_suggestions_destination_shape_check;
alter table public.transition_suggestions
  add constraint transition_suggestions_destination_shape_check
  check (destination ~ '^[a-z][a-zA-Z]{1,31}$');

-- THESE TWO ARE CLOSED SETS AND ARE WRITTEN AS SUCH. Unlike `destination`
-- they are not expected to grow: a third detector or a fourth outcome is
-- a change to what this table MEANS, and that deserves a migration
-- rather than passing silently.
alter table public.transition_suggestions
  drop constraint if exists transition_suggestions_source_check;
alter table public.transition_suggestions
  add constraint transition_suggestions_source_check
  check (source in ('offline', 'model'));

alter table public.transition_suggestions
  drop constraint if exists transition_suggestions_outcome_check;
alter table public.transition_suggestions
  add constraint transition_suggestions_outcome_check
  check (outcome in ('shown', 'taken', 'dismissed'));

-- ----------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------
-- ONE FOR THE SWEEP, ONE FOR THE PER-USER READ, and none on `destination`
-- or `outcome`. The rate is computed by aggregating the whole table,
-- which is a sequential scan whatever indexes exist; an index on a
-- three-value column would be paid for on every insert and earn nothing.
-- Retention keeps the table small enough that the scan is the right plan.
create index if not exists transition_suggestions_created_at_idx
  on public.transition_suggestions (created_at);
create index if not exists transition_suggestions_user_created_idx
  on public.transition_suggestions (user_id, created_at desc);

-- ----------------------------------------------------------------------
-- 3. Row-level security
-- ----------------------------------------------------------------------
alter table public.transition_suggestions enable row level security;

drop policy if exists transition_suggestions_insert_own on public.transition_suggestions;
create policy transition_suggestions_insert_own
  on public.transition_suggestions for insert
  with check (auth.uid() = user_id);

-- AND MAY READ THEIR OWN, for nav_events' reason: a table that records
-- what somebody was offered and what they did about it, and cannot be
-- shown to them, is a worse thing to own than one that can.
drop policy if exists transition_suggestions_select_own on public.transition_suggestions;
create policy transition_suggestions_select_own
  on public.transition_suggestions for select
  using (auth.uid() = user_id);

-- NO UPDATE AND NO DELETE POLICY. Append-only. Erasure is the cascade
-- above plus prune_transition_suggestions() below.

grant select, insert on public.transition_suggestions to authenticated;
revoke update, delete on public.transition_suggestions from authenticated;

-- anon OWNS NOTHING HERE — the table AND its identity sequence. The
-- sequence is named separately because REVOKE ON TABLE does not reach it,
-- and USAGE on a sequence is the one privilege that survives a table
-- revoke: 20260906000000_revoke_anon_grants was written to record that.
revoke all on public.transition_suggestions from anon;
do $revokeseq$
declare
  v_seq text := pg_get_serial_sequence('public.transition_suggestions', 'id');
begin
  if v_seq is not null then
    execute format('revoke all on sequence %s from anon', v_seq);
  end if;
end $revokeseq$;

comment on table public.transition_suggestions is
  'One row per transition-button event: shown, taken or dismissed, with which detector produced it. Append-only. The dismissal RATE is dismissed/shown and both halves are rows here; nav_events records only the navigation that follows a taken one. Retained 90 days by public.prune_transition_suggestions(), called daily by /api/cron/nav-retention.';

-- ----------------------------------------------------------------------
-- 4. Retention: 90 days, and a bad argument does no more than the default
-- ----------------------------------------------------------------------
-- SECURITY DEFINER because no role has DELETE on this table, which is the
-- point of section 3. Executable by service_role only.
--
-- A BAD ARGUMENT FALLS BACK TO THE DEFAULT, NOT TO THE FLOOR — the exact
-- clamp prune_nav_events() carries, and for the exact reason measured
-- there: clamping a stray 0 UP TO 1 turns "the caller passed nothing
-- usable" into "delete eighty-nine days of history", which is the most
-- destructive sweep the function is allowed to perform.
create or replace function public.prune_transition_suggestions(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $prune$
declare
  v_days integer := case
    when p_days is null or p_days < 1 then 90
    else least(p_days, 3650)
  end;
  v_deleted integer;
begin
  delete from public.transition_suggestions
   where created_at < now() - make_interval(days => v_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $prune$;

revoke all on function public.prune_transition_suggestions(integer) from public;
revoke all on function public.prune_transition_suggestions(integer) from anon;
revoke all on function public.prune_transition_suggestions(integer) from authenticated;
grant execute on function public.prune_transition_suggestions(integer) to service_role;
