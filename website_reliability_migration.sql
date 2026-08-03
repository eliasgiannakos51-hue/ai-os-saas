-- ============================================================================
-- Website Builder: reliability hardening.
--
-- Part 1 (attempt_count) fixes the "stuck in processing forever" bug — a
-- generation whose serverless function got killed mid-stream (most likely:
-- Vercel's platform-level execution timeout, since
-- api/websites/generate/process had no explicit maxDuration) never
-- reached a terminal status, so the client's polling loop
-- (pollWebsiteStatus in website-builder-workspace.tsx) waited forever
-- with no way to know the job was actually dead.
--
-- Part 2 (has_reference_images) fixes the follow-up bug once the stale-
-- job timeout was live: complex generations WITH reference images
-- legitimately take longer than the original flat 5-minute grace period,
-- so those jobs were being force-failed as "stale" while still actually
-- working. has_reference_images lets api/websites/status apply a longer
-- grace period specifically for image-attached generations.
--
-- Run this once against your live Supabase project. Safe to run on a
-- project with existing data — additive/idempotent (ADD COLUMN IF NOT
-- EXISTS), nothing here drops a table, drops a column, or deletes
-- existing rows. Both new columns default to values that are a no-op for
-- every row that already existed before they did.
-- ============================================================================

alter table public.user_websites
  add column if not exists attempt_count integer not null default 0;

alter table public.user_websites
  add column if not exists has_reference_images boolean not null default false;
