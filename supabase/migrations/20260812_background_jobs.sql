-- One background-job table for every long AI action.
--
-- WHY THIS EXISTS. Deep Research already survives the page being closed:
-- its state lives on research_reports and a worker carries it across
-- invocations (see 20260810_chunked_research.sql). Every other long action
-- in the app still ran inside the request — the route awaited a 30-120
-- second model call and returned the answer. Three consequences, all of
-- them user-visible:
--
--   1. Closing the tab aborts the fetch. The work may finish server-side,
--      but nothing tells the user, and the result is written nowhere they
--      can see it.
--   2. A platform kill runs NO catch block. No status is written, no
--      settlement happens, and the credit hold sits reserved until the
--      sweep — the user paid and got nothing.
--   3. There is no progress. A 90-second spinner and a hang look the same.
--
-- Rather than five more sets of columns on five unrelated tables, the job
-- state lives here once and the FEATURE tables keep only their own domain
-- data. A job row is the record of one attempt to do one thing: what was
-- asked, how far it got, what it cost, and what came out.
--
-- Idempotent: safe to run more than once.

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Which worker handles it. Deliberately text rather than an enum: adding
  -- a sixth kind should not need a migration, and the handler registry in
  -- lib/jobs/handlers is the real source of truth for what is valid.
  kind text not null,

  -- queued -> running -> done | failed
  status text not null default 'queued',

  -- Everything the worker needs to do the job, captured at request time.
  -- The worker reads ONLY this, never the original request, because by the
  -- time it runs the request is long gone.
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,

  -- Progress the user can actually read. step_label is the human sentence
  -- ("Reading your files", "Writing the plan"); the numbers drive the bar.
  step integer not null default 0,
  step_total integer not null default 1,
  step_label text,

  -- BILLING ACROSS INVOCATIONS.
  --
  -- The hold is taken when the job is created and settled by whichever
  -- invocation finishes it. A reservation id living only in a function's
  -- memory would be stranded the moment the work outlived the request —
  -- which is the entire point of this table.
  reservation_id text,
  -- CostAccumulator.snapshot() so far. Without it, a job that spans two
  -- invocations settles on a fraction of the work really done — an
  -- under-charge nothing could detect, because the stored margin would be
  -- computed from the same understated cost and read healthy.
  usage_entries jsonb not null default '[]'::jsonb,
  credits_charged integer,

  -- WORKER LIFECYCLE.
  --
  -- `running` is a lock, not a status: it is flipped false -> true with a
  -- conditional update, so a duplicated kick (a retried fetch, a cron
  -- sweep racing the self-call) cannot run the same job twice and spend
  -- two jobs' worth of credits.
  running boolean not null default false,
  -- Attempts already spent. Bounded, because a job that fails on a
  -- deterministic input would otherwise retry until the money ran out.
  attempts integer not null default 0,

  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The poll: "my jobs of this kind, newest first".
create index if not exists ai_jobs_user_kind_idx
  on public.ai_jobs (user_id, kind, created_at desc);

-- The reaper: "jobs that claim to be running". Partial, so it stays small
-- however many finished jobs accumulate.
create index if not exists ai_jobs_unfinished_idx
  on public.ai_jobs (status, running, started_at)
  where status in ('queued', 'running');

alter table public.ai_jobs enable row level security;

-- READ-ONLY FROM THE BROWSER, and that is the whole policy set.
--
-- A user may watch their own jobs. Nothing else: no insert, no update, no
-- delete. Every write is the service-role worker, because a client that
-- could set status='done' could also set credits_charged=0, and a client
-- that could insert could queue work it never paid for.
drop policy if exists "ai_jobs_select_own" on public.ai_jobs;
create policy "ai_jobs_select_own" on public.ai_jobs
  for select using (auth.uid() = user_id);

comment on table public.ai_jobs is
  'One row per long-running AI action. Survives the request that started it: the route creates the row and returns immediately, a worker carries it, the client polls. Service-role writes only.';
comment on column public.ai_jobs.running is
  'Chunk lock, not a status. Claimed with a conditional update false->true so a duplicated kick cannot run the same job twice.';
comment on column public.ai_jobs.usage_entries is
  'CostAccumulator.snapshot() so far. Settlement uses the accumulated total, or a job spanning two invocations would be charged for a fraction of the work.';
comment on column public.ai_jobs.attempts is
  'Bounded retries. A job failing on a deterministic input must stop costing money.';

-- Keeps updated_at honest, which is what the stale reaper measures against
-- for a job that is progressing slowly rather than dead.
create or replace function public.touch_ai_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_jobs_touch_updated_at on public.ai_jobs;
create trigger ai_jobs_touch_updated_at
  before update on public.ai_jobs
  for each row execute function public.touch_ai_jobs_updated_at();
