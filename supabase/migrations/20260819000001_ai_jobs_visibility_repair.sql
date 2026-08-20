-- ============================================================================
-- ai_jobs visibility repair: the owner must be able to READ their own jobs.
--
-- WHY THIS FILE EXISTS. Agent builds visibly "worked" on the real
-- deployment (the agent appeared) while the four-step progress line never
-- did. That is the exact signature of this policy being absent: every
-- WRITE to ai_jobs is the service-role worker (which bypasses RLS), so
-- the work succeeds — but /api/jobs/[id] reads the row through the
-- USER'S OWN client, and with no select policy that read returns nothing,
-- silently, forever. The UI then has no step to show and nothing errors.
--
-- The policy was defined at the end of 20260812_background_jobs.sql; this
-- repository has documented (TODO.md, "Seeding") that large SQL pastes
-- through the Supabase editor can stop part-way without an error. This
-- re-runs the visibility pieces on their own, small enough to paste whole.
--
-- Idempotent. Safe to run any number of times.
-- ============================================================================

alter table public.ai_jobs enable row level security;

-- READ-ONLY FROM THE BROWSER, and that is the whole policy set. A user
-- may watch their own jobs. Nothing else: no insert, no update, no
-- delete — every write is the service-role worker.
drop policy if exists "ai_jobs_select_own" on public.ai_jobs;
create policy "ai_jobs_select_own" on public.ai_jobs
  for select using (auth.uid() = user_id);

-- PostgREST also needs the table GRANT — RLS filters rows, the grant
-- decides whether the role may query at all. select only, for the same
-- reason the policy set stops at select.
grant select on table public.ai_jobs to authenticated;
revoke insert, update, delete on table public.ai_jobs from authenticated;
revoke all on table public.ai_jobs from anon;

-- ============================================================================
-- Verify. Expect one row ('ai_jobs_select_own'):
--   select policyname from pg_policies
--    where schemaname = 'public' and tablename = 'ai_jobs';
-- And rowsecurity = true:
--   select relrowsecurity from pg_class where oid = 'public.ai_jobs'::regclass;
-- ============================================================================
