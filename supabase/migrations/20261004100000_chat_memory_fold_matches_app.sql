-- THE FOLD THE DATABASE WROTE IS NOT THE FOLD THE APP SENDS.
--
-- 20261003000000_chat_memory_dedup_and_retention.sql backfilled
-- memory_fold with public.search_fold(memory_text): lower-case, accents
-- off, ς as σ. The application writes memoryFold() from
-- src/lib/chat/memory-fold.ts, which does all of that AND collapses runs of
-- whitespace AND drops a trailing sentence mark. The extractor ends almost
-- every fact with a full stop, so almost every row that existed before that
-- migration carries a fold ending in "." that the app will never send.
--
-- The effect: the first time an old fact is said again, chat_memory_record()
-- finds no row with the app's fold, inserts a second one, and the
-- deduplication the previous migration exists for does not happen for any
-- memory older than it. Found by scripts/tests/chat-memory-store.itest.mjs,
-- red in CI since the migration landed: "still one row for that fact —
-- expected 2, actual 3". Its fold-agreement samples had no punctuation,
-- which is why they agreed.
--
-- This migration:
--   1. defines public.chat_memory_fold(text) — memoryFold(), in SQL;
--   2. MERGES rows that become the same fact under it (the oldest row is
--      kept, its times_seen becomes the SUM of the group's, its last_seen_at
--      the newest), because the unique index on (user_id, memory_fold)
--      would refuse the re-fold otherwise;
--   3. re-folds every row whose stored fold differs.
--
-- Rows are DELETED in step 2, but only rows another row of the same user
-- now says is the same fact, and their counts are carried, as the previous
-- migration did. Run the preview at the bottom first to see how many.
--
-- Idempotent: a second run finds every fold already equal and does nothing.

-- ----------------------------------------------------------------------
-- 1. the app's fold, in SQL
-- ----------------------------------------------------------------------
-- Same steps, same order as memoryFold(): fold, collapse whitespace, trim,
-- drop trailing Latin/Greek/Arabic/CJK sentence marks (the class is the
-- TypeScript one character for character), trim again.
-- scripts/tests/chat-memory-store.itest.mjs compares the two on sentences
-- WITH punctuation and doubled spaces, which is the case that was missed.
create or replace function public.chat_memory_fold(p_text text)
returns text
language sql
immutable
parallel safe
strict
set search_path = public, pg_catalog
as $$
  select btrim(
           regexp_replace(
             btrim(regexp_replace(public.search_fold(p_text), '\s+', ' ', 'g')),
             '[.!?;··。！？؟۔]+$',
             ''
           )
         )
$$;

comment on function public.chat_memory_fold(text) is
  'memoryFold() from src/lib/chat/memory-fold.ts, in SQL. The dedup key chat_memory_record() compares against.';

-- A new function is executable by PUBLIC by default, and
-- 20260818000000_function_grants.sql only covered the functions that
-- existed when it ran. Nothing calls this over the API: the migration uses
-- it, and service_role keeps it so /api/health's function list can see it.
revoke all on function public.chat_memory_fold(text) from public;
revoke all on function public.chat_memory_fold(text) from anon;
revoke all on function public.chat_memory_fold(text) from authenticated;
grant execute on function public.chat_memory_fold(text) to service_role;

-- ----------------------------------------------------------------------
-- 2 and 3. merge what now collides, then re-fold
-- ----------------------------------------------------------------------
do $$
declare
  v_merged  integer := 0;
  v_refolded integer := 0;
begin
  create temporary table chat_memory_refold on commit drop as
    select id,
           user_id,
           created_at,
           times_seen,
           last_seen_at,
           public.chat_memory_fold(memory_text) as new_fold
      from public.chat_memory
     where memory_text is not null;

  with grouped as (
    select user_id, new_fold,
           sum(times_seen)   as seen,
           max(last_seen_at) as last_at
      from chat_memory_refold
     group by user_id, new_fold
    having count(*) > 1
  ),
  keepers as (
    select g.user_id, g.new_fold, g.seen, g.last_at,
           (select r.id
              from chat_memory_refold r
             where r.user_id = g.user_id
               and r.new_fold = g.new_fold
             order by r.created_at, r.id
             limit 1) as keep_id
      from grouped g
  ),
  bumped as (
    update public.chat_memory m
       set times_seen   = k.seen,
           last_seen_at = greatest(m.last_seen_at, k.last_at)
      from keepers k
     where m.id = k.keep_id
    returning m.id
  )
  delete from public.chat_memory d
   using chat_memory_refold r, keepers k
   where d.id = r.id
     and r.user_id = k.user_id
     and r.new_fold = k.new_fold
     and d.id <> k.keep_id;
  get diagnostics v_merged = row_count;

  update public.chat_memory m
     set memory_fold = r.new_fold
    from chat_memory_refold r
   where m.id = r.id
     and m.memory_fold is distinct from r.new_fold;
  get diagnostics v_refolded = row_count;

  raise notice 'chat_memory: merged % row(s), re-folded % row(s)', v_merged, v_refolded;
end $$;

-- ----------------------------------------------------------------------
-- PREVIEW — run this BEFORE the migration to see what step 2 will merge.
-- Read-only. Each row is one fact that exists more than once per user
-- once the trailing punctuation is ignored.
-- ----------------------------------------------------------------------
--   select user_id,
--          btrim(regexp_replace(btrim(regexp_replace(
--            public.search_fold(memory_text), '\s+', ' ', 'g')),
--            '[.!?;··。！？؟۔]+$', '')) as fact,
--          count(*) as rows_now
--     from public.chat_memory
--    group by 1, 2
--   having count(*) > 1;
