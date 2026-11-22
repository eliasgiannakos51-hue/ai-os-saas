-- Partial index for automation_runs WHERE status = 'waiting_approval'.
-- Four places query this condition (page-data.ts, cron/automation-flows,
-- approve/cancel routes). The existing automation_runs_queued_idx covers
-- only 'queued'; waiting_approval was unindexed.
--
-- How to undo: DROP INDEX IF EXISTS automation_runs_waiting_idx;

CREATE INDEX CONCURRENTLY IF NOT EXISTS automation_runs_waiting_idx
  ON public.automation_runs (user_id, approval_expires_at)
  WHERE status = 'waiting_approval';
