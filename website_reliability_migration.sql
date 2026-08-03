-- ============================================================================
-- Website Builder: reliability hardening (attempt cap + stale-job cleanup).
-- Fixes the "stuck in processing forever" bug — a generation whose
-- serverless function got killed mid-stream (most likely: Vercel's
-- platform-level execution timeout, since api/websites/generate/process
-- had no explicit maxDuration) never reached a terminal status, so the
-- client's polling loop (pollWebsiteStatus in
-- website-builder-workspace.tsx) waited forever with no way to know the
-- job was actually dead.
--
-- Run this once against your live Supabase project. Safe to run on a
-- project with existing data — additive/idempotent (ADD COLUMN IF NOT
-- EXISTS), nothing here drops a table, drops a column, or deletes
-- existing rows. attempt_count defaults to 0, a no-op for every row that
-- already existed before this column did.
-- ============================================================================

alter table public.user_websites
  add column if not exists attempt_count integer not null default 0;
