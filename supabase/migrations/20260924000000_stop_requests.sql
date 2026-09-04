-- A STOP BUTTON FOR EVERYTHING THAT RUNS WITHOUT A CONNECTION.
--
-- V4.6: "a ✕ while it writes — stops at once, keeps what was produced,
-- charges only the tokens that were produced. And in ALL of them: chat,
-- research, agents, websites, code."
--
-- Chat and code run inside the request and stop when the request is
-- aborted (api/chat, api/coding/run). The other three do NOT: a website
-- generation, a background job (an agent run, Create Anything, Ask my
-- files, the agent builder, a plan) and a research report all run in
-- workers the browser is not connected to — closing the tab is the whole
-- point of that design. So a stop has to be a fact in the database that
-- the worker reads: this column. The worker checks it at every boundary
-- it has (between steps, between research questions, and every two
-- seconds inside a streaming generation), aborts what is in flight, and
-- settles for the work already done.
--
-- ONE COLUMN, THREE TABLES, ONE MEANING: "the owner asked for this to
-- stop, at this time". Null is the ordinary state. It is never cleared —
-- a row that was stopped stays a row that was stopped, and the worker's
-- own terminal write (status failed, error "stopped") is what the UI
-- shows.
--
-- Written by the cancel routes through the service role AFTER a
-- user-scoped read has proven ownership (the same shape every other
-- owner action here takes), so no new RLS policy is needed: ai_jobs has
-- select-only policies for the owner by design and gains no update
-- policy here.
--
-- Idempotent: add column if not exists, three times.

alter table public.ai_jobs
  add column if not exists cancel_requested_at timestamptz;
comment on column public.ai_jobs.cancel_requested_at is
  'Set by POST /api/jobs/[id]/cancel. lib/jobs/run-job.ts reads it at each progress() boundary and stops, settling for the steps already done.';

alter table public.user_websites
  add column if not exists cancel_requested_at timestamptz;
comment on column public.user_websites.cancel_requested_at is
  'Set by POST /api/websites/[id]/cancel. api/websites/generate/process polls it during the stream, aborts, and settles for the tokens produced.';

alter table public.research_reports
  add column if not exists cancel_requested_at timestamptz;
comment on column public.research_reports.cancel_requested_at is
  'Set by POST /api/research/[id]/cancel. lib/research/run-research.ts reads it between questions and stops, settling for the questions already answered.';
