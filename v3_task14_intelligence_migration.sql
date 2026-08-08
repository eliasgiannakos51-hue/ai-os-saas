-- ============================================================================
-- V3 — Task 14: AI Intelligence Layer.
--
-- Standalone, additive, idempotent. Safe to run on a project that already
-- has supabase_full_project_backup.sql and the earlier V3 migrations
-- applied.
--
-- Two changes:
--   1. user_preferences_learned — what the product has OBSERVED about how
--      this user works. Observations are recorded server-side from real
--      events (an insight dismissed, an import target chosen), never
--      free-typed by the client; confidence is derived from evidence
--      count, never invented. Visible in Settings and deletable row by
--      row (GDPR: these are inferences about a person, the most
--      delete-worthy data there is).
--   2. research_reports.run_steps — the explainability record: which
--      steps ran (plan, each question, synthesis), on which model, at
--      roughly what share of the settled charge. Written once by the run
--      route at settlement; NULL for reports from before this existed.
-- ============================================================================

create table if not exists public.user_preferences_learned (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 'dismissals' | 'modules' | 'design' — a small, code-defined set; the
  -- writer validates against it.
  category text not null,
  observation text not null,
  -- Derived from evidence_count by the writer (more sightings, more
  -- confidence, capped at 1). Stored so reads don't re-derive.
  confidence numeric not null default 0.2,
  evidence_count integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, category, observation)
);

alter table public.user_preferences_learned enable row level security;

drop policy if exists "select_own_user_preferences_learned" on public.user_preferences_learned;
create policy "select_own_user_preferences_learned" on public.user_preferences_learned
  for select using (auth.uid() = user_id);

-- The user can DELETE what was learned about them — that is the GDPR
-- right to object to profiling, as a button. No insert/update policies:
-- only the server records observations, so the client cannot write
-- flattering or garbage rows into its own profile.
drop policy if exists "delete_own_user_preferences_learned" on public.user_preferences_learned;
create policy "delete_own_user_preferences_learned" on public.user_preferences_learned
  for delete using (auth.uid() = user_id);

alter table public.research_reports
  add column if not exists run_steps jsonb;

comment on column public.research_reports.run_steps is
  'Explainability: [{stage, model, searches, approxCredits}] recorded at settlement. Approximate by design — per-step credits are the settled total split by each step''s share of real USD cost.';
