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

alter table public.user_websites
  drop constraint if exists user_websites_status_check;
alter table public.user_websites
  add constraint user_websites_status_check
  check (status in ('pending', 'processing', 'completed', 'failed'));
