-- ============================================================================
-- V3 — First 60 Seconds (action-first onboarding).
--
-- Standalone, additive, idempotent. Safe to run on a project that already
-- has supabase_full_project_backup.sql and the v3_instant_value migration
-- applied.
--
-- One column: which of the four first actions the user picked on the
-- "What do you want to do first?" screen. Stored in the DATABASE, not
-- localStorage, because "show the question once per account" has to
-- survive a new device, a cleared browser and a different browser — a
-- localStorage flag re-shows the flow on every one of those.
--
-- The column is free text at the schema level and validated to the
-- allowlist ('website' | 'mission' | 'data' | 'chat') in
-- /api/onboarding, the only writer. RLS on user_onboarding is unchanged:
-- the user can read and update their own row, and the billing-relevant
-- activation_used_at stays writable only through claim_activation_run.
-- ============================================================================

alter table public.user_onboarding
  add column if not exists first_action text;

comment on column public.user_onboarding.first_action is
  'Which first action the user chose on the onboarding screen: website | mission | data | chat. Written only by /api/onboarding.';
