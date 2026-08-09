-- Deep Research that survives a 60-second function ceiling.
--
-- WHY. A report is up to six sequential search-enabled model calls plus a
-- synthesis. Each question takes 60-90 seconds. On Vercel Pro (800s) that
-- fits in one invocation; on Hobby (60s) it cannot fit at all — and a
-- function killed by the platform runs no catch block, so the row stays
-- 'researching' forever, nothing settles, and the credit hold sits there
-- until the sweep.
--
-- The work is now split across invocations: each one does what its budget
-- allows, saves state here, and hands off to a fresh invocation. These
-- columns ARE that state.
--
-- Safe to run before or after deploying the code. The worker writes these
-- best-effort and GET /api/research/[id] selects `*`, so neither ordering
-- breaks anything — applying it is what turns chunking on.
--
-- Idempotent: safe to run more than once.

-- Findings answered so far, so a later invocation does not redo them.
-- Each entry is { question, summary, sources[] } — the same shape
-- lib/research/research.ts produces.
alter table public.research_reports
  add column if not exists partial_findings jsonb not null default '[]'::jsonb;

-- Every priced sub-call recorded so far (CostAccumulator.snapshot()).
--
-- This is the one that must not be skipped. Settlement happens ONCE, in
-- whichever invocation finishes the report. Without the usage measured by
-- the earlier invocations, that settlement charges for a fraction of the
-- work actually done — and nothing would ever detect it, because the
-- stored achieved_margin would be computed from the same understated cost
-- and read as a healthy 4x.
alter table public.research_reports
  add column if not exists usage_entries jsonb not null default '[]'::jsonb;

-- The credit hold, taken by the first invocation and settled by the last.
-- A reservation id living only in one function's memory would be stranded
-- the moment the work was handed on.
alter table public.research_reports
  add column if not exists reservation_id text;

-- The per-chunk lock. A duplicated handoff (a retried fetch, the client's
-- nudge racing the self-call) must be a no-op, not a second billed run.
alter table public.research_reports
  add column if not exists chunk_running boolean not null default false;

alter table public.research_reports
  add column if not exists chunk_started_at timestamptz;

-- How many invocations this report has taken. Written to the cost-log
-- metadata so a report that took nine chunks is visible as such rather
-- than looking like an ordinary one that cost more.
alter table public.research_reports
  add column if not exists chunk_count integer not null default 0;

comment on column public.research_reports.partial_findings is
  'Findings answered so far, so a resumed chunk does not repeat paid work.';
comment on column public.research_reports.usage_entries is
  'CostAccumulator.snapshot() so far. Settlement restores this; without it a chunked report under-charges.';
comment on column public.research_reports.reservation_id is
  'The credit hold, carried across invocations because the chunk that settles is not the one that reserved.';
comment on column public.research_reports.chunk_running is
  'Per-chunk lock. Claimed by a conditional update so a duplicated handoff cannot start a second billed run.';
comment on column public.research_reports.chunk_started_at is
  'When the current chunk claimed the lock, so an abandoned lock can be told from a working one.';
comment on column public.research_reports.chunk_count is
  'Invocations this report has taken. Recorded on the cost-log row.';

-- The continuation endpoint looks up unfinished, unlocked reports. The
-- existing (status, processing_started_at) index does not cover the lock.
create index if not exists research_reports_chunk_idx
  on public.research_reports (status, chunk_running, chunk_started_at)
  where status in ('researching', 'synthesising');
