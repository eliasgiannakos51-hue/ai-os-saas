-- Agent approval center and credit cap (AG1 Κ2-3, 2026-11-11).
--
-- Two changes:
-- 1. agent_approvals table — where pending approvals live
-- 2. credit_cap column on user_agents — the per-agent ceiling
--
-- How to undo: DROP TABLE agent_approvals; ALTER TABLE user_agents DROP COLUMN IF EXISTS credit_cap, DROP COLUMN IF EXISTS approval_settings;

-- The approval table: where the agent asks and the user answers.
CREATE TABLE IF NOT EXISTS public.agent_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.user_agents(id) ON DELETE CASCADE,
  run_id uuid,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('send', 'publish', 'spend')),
  action_description text NOT NULL,
  action_data jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  decided_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_approvals ENABLE ROW LEVEL SECURITY;

-- Users can read and update their own approvals (to approve/deny).
CREATE POLICY "Users read own approvals"
  ON public.agent_approvals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users decide own approvals"
  ON public.agent_approvals FOR UPDATE
  USING (auth.uid() = user_id);

-- Only the server inserts (when an agent requests approval).
REVOKE INSERT ON public.agent_approvals FROM authenticated;

CREATE INDEX idx_agent_approvals_pending
  ON public.agent_approvals (user_id, status, expires_at)
  WHERE status = 'pending';

-- Per-agent credit cap and approval settings on user_agents.
ALTER TABLE public.user_agents
  add column if not exists credit_cap integer,
  add column if not exists approval_settings jsonb DEFAULT '{"send": true, "publish": true, "spend": true}';

COMMENT ON COLUMN public.user_agents.credit_cap IS
  'Maximum credits this agent may spend across all runs. NULL = no cap.';
COMMENT ON COLUMN public.user_agents.approval_settings IS
  'Which action kinds need approval: {"send": bool, "publish": bool, "spend": bool}. Default: all true.';
