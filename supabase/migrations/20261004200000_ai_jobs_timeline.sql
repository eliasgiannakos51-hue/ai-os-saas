-- THE ACTIVITY TIMELINE OF A BACKGROUND JOB — V6.2 2.1.
--
-- ai_jobs kept only the current step (step_label is overwritten on every
-- step), so a finished job could not say what it did, how long each part
-- took, or where its credits went. The worker (src/lib/jobs/run-job.ts)
-- now appends one entry per step here; src/lib/jobs/job-timeline.ts defines
-- the entry and turns it into what the poll (api/jobs/[id]) returns.
--
-- Each entry carries the job's provider cost so far, in USD. That is OUR
-- cost; the poll never returns it — it only uses it to split the job's
-- real charge across its steps.
--
-- Additive and safe to run twice. Until it is run, the worker sees no
-- `timeline` key on the row it reads and writes none, so an un-migrated
-- database keeps working exactly as before, without a timeline.

alter table public.ai_jobs
  add column if not exists timeline jsonb not null default '[]'::jsonb;

comment on column public.ai_jobs.timeline is
  'One entry per step: {at, step, label, costUsd, evidence}. Written by lib/jobs/run-job.ts; read through lib/jobs/job-timeline.ts, which never returns costUsd to a client.';
