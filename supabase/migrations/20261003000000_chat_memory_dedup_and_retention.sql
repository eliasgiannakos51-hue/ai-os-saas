-- SAY YOUR NAME FIVE TIMES AND THE CHAT REMEMBERS IT FIVE TIMES.
--
-- extractAndStoreMemory did a bare `.insert()`. There was no unique index
-- and no comparison against what was already there, so every repetition of
-- the same fact became another row. That is not merely untidy: the read
-- side takes the newest N (20 on most plans, 100 on the top one), so twenty
-- repetitions of one fact fill the whole window and push every other thing
-- the model knew about the person out of the prompt. The feature gets worse
-- the more consistently somebody talks about themselves.
--
-- THREE COLUMNS AND ONE FUNCTION.
--
--   memory_fold   the comparable form of memory_text — lower-cased,
--                 accent-folded, final sigma folded. It is the dedup key,
--                 and it is a STORED column rather than an expression index
--                 because the application writes it with lib/text
--                 foldForMatch() and the backfill below writes it with
--                 public.search_fold(); pinning both to one column is what
--                 lets a gate compare them.
--   times_seen    how many times this fact has been said. This is the
--                 answer to a question the prompt could not previously ask:
--                 "prefers X" and "did X once" are different claims, and
--                 buildMemoryPromptAddition now says which it is holding.
--   last_seen_at  when it was last said. A fact from last year is not the
--                 same as a fact from Tuesday, and it is also what the
--                 retention rule keys on — because a repetition REFRESHES
--                 this, something still being said never ages out.
--   confirmed_at  set when the person edits or confirms a row from
--                 /dashboard/ai-memory. Never pruned after that.
--
-- WHY A FUNCTION AND NOT AN UPDATE POLICY. chat_memory is deliberately
-- append/delete-only for the browser: there is a select, an insert and a
-- delete policy, and no update policy at all, so nothing a session does can
-- rewrite a stored fact into something else. Incrementing a counter needs
-- an UPDATE, and adding a policy for it would give away that property for a
-- counter. chat_memory_record() is SECURITY DEFINER, resolves the user from
-- auth.uid() rather than from an argument, and can only ever touch
-- times_seen, last_seen_at and source_conversation_id on a row that is
-- already the caller's. The table stays append/delete-only for everyone
-- else.
--
-- Idempotent: every statement is IF NOT EXISTS or CREATE OR REPLACE, and
-- the backfill is written so a second run changes nothing.

-- ----------------------------------------------------------------------
-- 1. the columns
-- ----------------------------------------------------------------------
alter table public.chat_memory add column if not exists times_seen integer not null default 1;
alter table public.chat_memory add column if not exists last_seen_at timestamptz not null default now();
alter table public.chat_memory add column if not exists memory_fold text;
alter table public.chat_memory add column if not exists confirmed_at timestamptz;

-- A counter that can go to zero or negative is a counter nobody can reason
-- about, and `times_seen = 1` is load-bearing in the retention rule below.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_memory_times_seen_positive'
  ) then
    alter table public.chat_memory
      add constraint chat_memory_times_seen_positive check (times_seen >= 1);
  end if;
end $$;

-- ----------------------------------------------------------------------
-- 2. the backfill, and it MERGES rather than truncates
-- ----------------------------------------------------------------------
-- Legacy rows carry last_seen_at = now() from the ALTER above, which would
-- say every old fact was said the moment this migration ran — and would
-- then protect all of them from a retention rule keyed on that column for
-- six months. Only rows that have not been folded yet are legacy, which is
-- what makes this safe to run twice.
update public.chat_memory
   set last_seen_at = created_at
 where memory_fold is null
   and last_seen_at <> created_at;

update public.chat_memory
   set memory_fold = public.search_fold(memory_text)
 where memory_fold is null;

-- The duplicates that are already there. The OLDEST row of each group
-- survives — it is the one whose created_at is the truth about when this
-- was first learned — and it inherits the count and the newest sighting.
-- Nothing is lost: n rows saying the same thing become one row that says it
-- was said n times.
do $$
declare
  v_merged integer := 0;
begin
  with grouped as (
    select user_id,
           memory_fold,
           min(created_at) as first_at,
           max(created_at) as last_at,
           count(*)        as n
      from public.chat_memory
     where memory_fold is not null
     group by user_id, memory_fold
    having count(*) > 1
  ),
  keepers as (
    select g.user_id, g.memory_fold, g.n, g.last_at,
           (select m.id
              from public.chat_memory m
             where m.user_id = g.user_id
               and m.memory_fold = g.memory_fold
             order by m.created_at, m.id
             limit 1) as keep_id
      from grouped g
  ),
  bumped as (
    update public.chat_memory m
       set times_seen   = k.n,
           last_seen_at = greatest(m.last_seen_at, k.last_at)
      from keepers k
     where m.id = k.keep_id
    returning m.id
  )
  delete from public.chat_memory d
   using keepers k
   where d.user_id = k.user_id
     and d.memory_fold = k.memory_fold
     and d.id <> k.keep_id;

  get diagnostics v_merged = row_count;
  raise notice 'chat_memory: merged % duplicate row(s)', v_merged;
end $$;

-- ----------------------------------------------------------------------
-- 3. the indexes
-- ----------------------------------------------------------------------
-- The dedup key. PARTIAL, because a row whose fold has somehow not been
-- written must not block an insert — the application always writes it, and
-- an index that can refuse a write is worse than a duplicate row.
create unique index if not exists chat_memory_user_fold_uidx
  on public.chat_memory (user_id, memory_fold)
  where memory_fold is not null;

-- The read is `order by last_seen_at desc limit N` now, not created_at, so
-- that a fact still being repeated stays inside the window it earned.
create index if not exists chat_memory_user_last_seen_idx
  on public.chat_memory (user_id, last_seen_at desc);

-- ----------------------------------------------------------------------
-- 4. chat_memory_record — insert or bump, as the caller
-- ----------------------------------------------------------------------
create or replace function public.chat_memory_record(
  p_memory_text text,
  p_memory_fold text,
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
  -- No user, no row. SECURITY DEFINER means this function bypasses RLS, so
  -- the identity has to come from the session rather than from an
  -- argument: a userId parameter here would be a write-anything primitive.
  if v_user is null then
    raise exception 'chat_memory_record: no authenticated user' using errcode = '28000';
  end if;
  if p_memory_text is null or length(btrim(p_memory_text)) = 0 then
    return null;
  end if;
  if p_memory_fold is null or length(btrim(p_memory_fold)) = 0 then
    raise exception 'chat_memory_record: a fold is required' using errcode = '22023';
  end if;

  update public.chat_memory
     set times_seen   = times_seen + 1,
         last_seen_at = now(),
         -- The conversation stays the FIRST one this was learned in, which
         -- is what the row's created_at is about and what the link on
         -- /dashboard/ai-memory opens. Only filled in if it was lost to a
         -- deleted conversation.
         source_conversation_id = coalesce(source_conversation_id, p_conversation_id)
   where user_id = v_user
     and memory_fold = p_memory_fold
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.chat_memory (user_id, memory_text, memory_fold, source_conversation_id)
  values (v_user, p_memory_text, p_memory_fold, p_conversation_id)
  -- Two extractions of the same fact can land at once; the partial unique
  -- index turns that race into a bump rather than an error.
  on conflict (user_id, memory_fold) where memory_fold is not null
  do update set times_seen = chat_memory.times_seen + 1,
                last_seen_at = now()
  returning id into v_id;

  return v_id;
end;
$fn$;

comment on function public.chat_memory_record(text, text, uuid) is
  'Insert a remembered fact, or bump times_seen/last_seen_at if the caller already has one with the same fold. The only thing that may UPDATE chat_memory; the table has no update policy on purpose.';

revoke all on function public.chat_memory_record(text, text, uuid) from public;
revoke all on function public.chat_memory_record(text, text, uuid) from anon;
grant execute on function public.chat_memory_record(text, text, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------
-- 5. what the retention rule would remove — SHOWN BEFORE IT IS DONE
-- ----------------------------------------------------------------------
-- THE RULE, and the reason it is not "older than N days".
--
-- nav_events is pruned at 90 days because a nav event is an EVENT: "opened
-- page X, then". chat_memory holds PROPERTIES: "this person is X". A
-- property does not expire because time passed — "my name is Ilias" is as
-- true in 2028 as it was when it was said. So age alone may never remove a
-- row, and this function removes only rows that are old AND unrepeated AND
-- already outside the window the prompt reads:
--
--   1. times_seen = 1        said once. A repetition is stable knowledge.
--   2. last_seen_at older than p_days (180)     and not said since.
--   3. outside the newest p_window rows by last_seen_at, so it is not
--      reaching the model anyway. p_window defaults to 100, which is the
--      largest chatMemoryLimit any plan grants (lib/billing/plans.ts).
--   4. never confirmed or edited by the person.
--
-- AND ONE MORE, which is not about age at all: a row whose conversation the
-- person DELETED. source_conversation_id is `on delete set null`, so a null
-- there means the context is gone. Restricted to times_seen = 1 for the
-- same reason as everything else here — "times_seen >= 2 is never deleted"
-- is stated as absolute, and a fact repeated in other conversations was not
-- deleted with this one.
--
-- SEPARATE FROM THE DELETE ON PURPOSE. The person has to be able to see
-- what would go before anything goes, which is what /dashboard/ai-memory
-- uses this for.
create or replace function public.chat_memory_prunable(
  p_days integer default 180,
  p_window integer default 100
)
returns table (id uuid, memory_text text, last_seen_at timestamptz, reason text)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  with ranked as (
    select m.*,
           row_number() over (order by m.last_seen_at desc, m.id) as recency
      from public.chat_memory m
     where m.user_id = auth.uid()
  )
  select r.id,
         r.memory_text,
         r.last_seen_at,
         case when r.source_conversation_id is null then 'conversation-deleted' else 'said-once-and-old' end
    from ranked r
   where r.times_seen = 1
     and r.confirmed_at is null
     and (
       (r.last_seen_at < now() - make_interval(days => greatest(coalesce(p_days, 180), 1))
        and r.recency > greatest(coalesce(p_window, 100), 1))
       or r.source_conversation_id is null
     )
   order by r.last_seen_at;
$fn$;

comment on function public.chat_memory_prunable(integer, integer) is
  'The rows chat_memory retention would remove for the calling user, with the reason. SECURITY INVOKER, so RLS scopes it to the caller.';

revoke all on function public.chat_memory_prunable(integer, integer) from public;
revoke all on function public.chat_memory_prunable(integer, integer) from anon;
grant execute on function public.chat_memory_prunable(integer, integer) to authenticated, service_role;

-- ----------------------------------------------------------------------
-- 6. prune_chat_memory — the same rule, applied
-- ----------------------------------------------------------------------
-- Deletes for ONE user (the caller, or the named one for the service role)
-- rather than sweeping the table, because this is the person's own data and
-- the product asks them first. It is not wired to a cron: nothing deletes a
-- remembered fact without somebody pressing a button.
create or replace function public.prune_chat_memory(
  p_days integer default 180,
  p_window integer default 100
)
returns integer
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_deleted integer := 0;
begin
  delete from public.chat_memory
   where id in (select id from public.chat_memory_prunable(p_days, p_window));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$fn$;

comment on function public.prune_chat_memory(integer, integer) is
  'Applies the chat_memory retention rule to the calling user: rows said once, unseen for p_days, outside the newest p_window, never confirmed — plus rows whose conversation was deleted. Never touches times_seen >= 2.';

revoke all on function public.prune_chat_memory(integer, integer) from public;
revoke all on function public.prune_chat_memory(integer, integer) from anon;
grant execute on function public.prune_chat_memory(integer, integer) to authenticated, service_role;
