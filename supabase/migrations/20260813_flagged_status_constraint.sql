-- ============================================================================
-- user_websites: allow the 'flagged' status the application actually writes.
--
-- THE MISMATCH. src/types/user-website.ts declares
--
--     export type UserWebsiteStatus =
--       "pending" | "processing" | "completed" | "failed" | "flagged";
--
-- and api/websites/generate/process/route.ts writes 'flagged' whenever the
-- AI Output Protection Layer finds a real issue in generated HTML. But the
-- standalone website_status_migration.sql installs
--
--     check (status in ('pending', 'processing', 'completed', 'failed'))
--
-- with no 'flagged'. supabase_schema.sql widens it later in the same file,
-- so whether a project is correct depends entirely on WHICH files were run
-- and IN WHAT ORDER — and because website_status_migration.sql does
-- `drop constraint if exists` before re-adding the narrow version, running
-- it AFTER the full schema silently narrows a constraint that was already
-- correct. Nothing warns. Nothing fails until a website is flagged.
--
-- WHAT IT COSTS WHEN IT BITES. Reproduced against PostgreSQL 16:
--
--     update user_websites set status = 'flagged' where ...;
--     ERROR: new row violates check constraint "user_websites_status_check"
--     -- row afterwards: status = 'processing'
--
--   1. The website is generated. Real tokens, real money.
--   2. Settlement runs and the user IS CHARGED — it happens before the
--      status write.
--   3. The status write is rejected. The application discarded that error
--      (fixed in the same change as this migration), so the row is left on
--      'processing'.
--   4. The client polls a row that will never change. Five to twenty-five
--      minutes later the stale-job reaper in api/websites/status force-fails
--      it to 'failed'.
--   5. The user sees "Generation failed", has paid in full, and does NOT get
--      the one free regenerate — that is offered only for 'flagged'.
--
-- So a schema drift with no error message anywhere charges the user and
-- takes away the remedy they were owed.
--
-- Safe to run more than once, and safe to run before or after any of the
-- other schema files.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The constraint.
--
-- Dropped and re-added rather than altered: a CHECK constraint cannot be
-- widened in place, and `drop ... if exists` makes the pair idempotent.
-- ----------------------------------------------------------------------------
alter table public.user_websites
  drop constraint if exists user_websites_status_check;

alter table public.user_websites
  add constraint user_websites_status_check
  check (status in ('pending', 'processing', 'completed', 'failed', 'flagged'));


-- ----------------------------------------------------------------------------
-- 2. The columns the flagged flow needs.
--
-- Both live only in supabase_schema.sql / supabase_complete_schema.sql, so a
-- project built from the standalone migrations has the 'flagged' code path
-- reachable with neither column present. Repeated here so this one file is
-- enough to make the flagged flow whole.
--
--   free_retry_used — whether this row's single complimentary regeneration
--                     has been spent (api/websites/[id]/regenerate). Without
--                     it the free retry cannot be tracked at all.
--   description     — the original brief, so the free regenerate can re-run
--                     generation server-side. Without it the UI has nothing
--                     to regenerate FROM and must explain that instead.
-- ----------------------------------------------------------------------------
alter table public.user_websites
  add column if not exists free_retry_used boolean not null default false;

alter table public.user_websites
  add column if not exists description text;

-- The user-facing summary of what the safety review objected to. Added by
-- website_status_migration.sql as well, but a project that never ran that
-- file still needs it: a 'flagged' row with nowhere to put the reason shows
-- the user a warning panel with an empty body.
alter table public.user_websites
  add column if not exists error_message text;


-- ----------------------------------------------------------------------------
-- 3. Rescue rows the mismatch already stranded.
--
-- A row left on 'processing' with html_content already written is one this
-- bug caught mid-flight: the generation finished and was saved, and only the
-- final status write was rejected. Those rows are recoverable — the HTML is
-- right there.
--
-- They are moved to 'flagged', not 'completed', deliberately. The status
-- write that failed was the one that would have said WHICH, and the safety
-- review is the only reason a write of 'flagged' was ever attempted, so
-- 'flagged' is the safe reading: it shows the user the content is held for
-- review and offers the free regenerate, rather than publishing HTML that
-- may be exactly what the review objected to.
--
-- Scoped to rows that have been stuck for over an hour, so a generation
-- genuinely in progress right now is never touched.
-- ----------------------------------------------------------------------------
do $$
declare
  v_rescued integer;
begin
  -- Guarded on EVERY column it touches, not just one. The first version of
  -- this block checked created_at and then referenced error_message anyway,
  -- which aborted the whole migration on a table that lacked it — a
  -- migration written to fix a schema mismatch, failing on a schema
  -- mismatch. Caught by flagged-status.itest.mjs against a real server.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_websites' and column_name = 'created_at'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_websites' and column_name = 'html_content'
  ) then
    update public.user_websites
       set status = 'flagged',
           error_message = coalesce(
             error_message,
             'This website was held by our safety review. You can regenerate it once at no extra charge.'
           )
     where status = 'processing'
       and html_content is not null
       and length(html_content) > 0
       and created_at < now() - interval '1 hour';

    get diagnostics v_rescued = row_count;
    raise notice 'flagged-constraint migration: rescued % stranded row(s)', v_rescued;
  end if;
end;
$$;
