-- ============================================================================
-- Website Builder: background-job status tracking (pending/processing/
-- completed/failed) on user_websites.
-- Run this once against your live Supabase project. Safe to run on a
-- project with existing data — every statement is additive/idempotent
-- (ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS before re-adding),
-- nothing here drops a table, drops a column, or deletes existing rows.
--
-- New columns default such that every row that already existed before
-- this migration is treated as status = 'completed' (correct — those
-- rows already have real, finished html_content from the old,
-- synchronous generation flow), so this is a no-op for existing data.
-- ============================================================================

alter table public.user_websites
  add column if not exists status text not null default 'completed';

alter table public.user_websites
  add column if not exists error_message text;

-- 'flagged' IS IN THIS LIST, and it has to be.
--
-- This constraint used to read ('pending','processing','completed','failed').
-- The application writes 'flagged' too — src/types/user-website.ts declares
-- it and api/websites/generate/process/route.ts writes it whenever the AI
-- Output Protection Layer finds a real issue in generated HTML.
--
-- Because the two lines below DROP the constraint before re-adding it, this
-- file running AFTER supabase_schema.sql (which widens it correctly) silently
-- narrowed a constraint that was already right. Whether a project worked
-- depended on the order its SQL files happened to be run in, and nothing
-- failed until a website was actually flagged — at which point the status
-- write was rejected, the error was discarded, the row stuck on 'processing',
-- and the stale reaper eventually marked it 'failed' with the user already
-- charged and the free regenerate (flagged-only) out of reach.
alter table public.user_websites
  drop constraint if exists user_websites_status_check;
alter table public.user_websites
  add constraint user_websites_status_check
  check (status in ('pending', 'processing', 'completed', 'failed', 'flagged'));

-- The two columns 'flagged' needs to be more than a permitted string.
-- free_retry_used tracks whether this row's single complimentary
-- regeneration has been spent (api/websites/[id]/regenerate); description
-- holds the original brief, which is what that regeneration re-runs from.
-- Allowing the status without them leaves a user whose site was held for
-- review — and already charged for it — with a warning and no way forward.
alter table public.user_websites
  add column if not exists free_retry_used boolean not null default false;

alter table public.user_websites
  add column if not exists description text;
