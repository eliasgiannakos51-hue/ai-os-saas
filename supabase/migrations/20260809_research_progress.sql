-- Deep Research — visible progress.
--
-- WHY. api/research/[id]/run does one search-enabled model call per
-- question, sequentially, and each takes 60-90 seconds. The client had no
-- way to tell a report that was working from one whose worker had died,
-- so a slow-but-healthy run and a dead run looked identical: a spinner.
-- That is why a run that was progressing normally was reported as "stuck
-- for 30 minutes".
--
-- The worker now writes which question it is on after each one, and the
-- card renders "Question 3 of 5" plus the question text and a bar.
--
-- SAFE TO RUN BEFORE OR AFTER DEPLOYING THE CODE. The writes are
-- best-effort (a PostgREST unknown-column error is ignored, not thrown)
-- and GET /api/research/[id] selects `*` rather than a column list, so
-- neither ordering breaks anything. Applying it is what turns the
-- progress display on.
--
-- Idempotent: safe to run more than once.

alter table public.research_reports
  add column if not exists questions_done integer not null default 0;

alter table public.research_reports
  add column if not exists questions_total integer not null default 0;

-- The question currently being searched, so the UI can show what it is
-- looking up rather than only how far along it is. Nullable: null between
-- the last question and synthesis.
alter table public.research_reports
  add column if not exists current_question text;

comment on column public.research_reports.questions_done is
  'How many planned questions have finished. Written by api/research/[id]/run after each one.';
comment on column public.research_reports.questions_total is
  'How many questions the plan contains, copied at run time so the UI never has to count a jsonb array.';
comment on column public.research_reports.current_question is
  'The question currently being researched, or null.';

-- Reaping stale jobs (api/research/[id]) filters on status +
-- processing_started_at. There is already a (status, created_at) index;
-- this one matches what the staleness check actually reads.
create index if not exists research_reports_processing_idx
  on public.research_reports (status, processing_started_at)
  where status in ('planning', 'researching', 'synthesising');
