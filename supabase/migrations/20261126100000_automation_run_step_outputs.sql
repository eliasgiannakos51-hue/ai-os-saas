-- ---------------------------------------------------------------------------
-- AUTOMATION RUN STEP OUTPUTS (Phase 4 of the n8n spec, 2026-11-26).
--
-- Stores the actual data output of each step in a run, so the BoxEditor
-- can show input (previous step's output) and output (this step's result)
-- side by side, and status badges persist after the run finishes.
--
-- Each row holds one step's output for one run. Output is capped at
-- MAX_OUTPUT_CHARS (8000) by the runner before writing. Rows expire
-- after 14 days (cleaned by a cron, not enforced by the database).
--
-- Sensitive fields (passwords, tokens) are stripped by the runner
-- before storing, using the same SENSITIVE_KEYS list as config-crypto.ts.
--
-- How to check: npm run db:pending
-- How to undo: DROP TABLE IF EXISTS public.automation_run_step_outputs;
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.automation_run_step_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.automation_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  box_id text NOT NULL,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days')
);

CREATE INDEX IF NOT EXISTS run_step_outputs_run_idx
  ON public.automation_run_step_outputs (run_id, box_id);
CREATE INDEX IF NOT EXISTS run_step_outputs_expires_idx
  ON public.automation_run_step_outputs (expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE public.automation_run_step_outputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS run_step_outputs_select_own ON public.automation_run_step_outputs;
CREATE POLICY run_step_outputs_select_own
  ON public.automation_run_step_outputs FOR SELECT
  USING (auth.uid() = user_id);

GRANT SELECT ON public.automation_run_step_outputs TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.automation_run_step_outputs FROM authenticated;
REVOKE ALL ON public.automation_run_step_outputs FROM anon;
