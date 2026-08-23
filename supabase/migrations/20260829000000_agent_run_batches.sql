-- ============================================================================
-- BATCHED SCHEDULED AGENT RUNS (V4 #13)
-- ============================================================================
--
-- A scheduled agent run has nobody watching a screen, so it can be
-- submitted to Anthropic's Message Batches API at half price and
-- collected when it comes back. This is the state that makes that
-- collectable.
--
-- 'queued' IS A REAL STATUS, NOT A FLAVOUR OF 'running'. A run submitted
-- at 06:00 and delivered at 06:04 must not read as a four-minute run that
-- started at 06:04 — a user comparing today's briefing with yesterday's
-- would see a timeline that did not happen. queued_at and finished_at
-- together are the honest record.
--
-- ONE OUTSTANDING BATCH PER AGENT, and it is enforced HERE rather than in
-- TypeScript. The pile-up this prevents — an agent submitting a new batch
-- every tick while the last is still in flight — is a race between cron
-- invocations, and a check-then-insert in application code is exactly the
-- shape that loses that race. A partial unique index cannot.
--
-- NO HOLD SPANS THE WINDOW. A credit reservation lives 60 minutes and a
-- batch may take 24 hours, so there is deliberately no reservation_id
-- column here: affordability is checked at submission and the charge is
-- taken at settlement from measured usage. See lib/ai/batch/batch-policy.ts
-- for what that trades away and why it is bounded.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

alter table public.agent_runs add column if not exists batch_id text;
alter table public.agent_runs add column if not exists batch_request_id text;
alter table public.agent_runs add column if not exists queued_at timestamptz;
-- Counts the SYNCHRONOUS re-runs after a batch failure, separately from
-- `attempts`, which counts tries within one execution. Merging them would
-- make "this agent is flaky" and "the batch expired" the same number.
alter table public.agent_runs add column if not exists batch_fallbacks int not null default 0;

do $$
begin
  -- 'queued' added to the existing status check. Rebuilt rather than
  -- edited: a check constraint cannot be altered in place, and dropping
  -- it without immediately recreating it would leave a window in which
  -- any string is a valid status.
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.agent_runs'::regclass
       and conname = 'agent_runs_status_check'
  ) then
    alter table public.agent_runs drop constraint agent_runs_status_check;
  end if;
  alter table public.agent_runs
    add constraint agent_runs_status_check
    check (status in ('running', 'queued', 'success', 'failed'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.agent_runs'::regclass
       and conname = 'agent_runs_batch_fallbacks_non_negative'
  ) then
    alter table public.agent_runs
      add constraint agent_runs_batch_fallbacks_non_negative check (batch_fallbacks >= 0);
  end if;
end $$;

-- THE PILE-UP GUARD. One row per agent may be 'queued' at a time; a
-- second submission while one is in flight fails on the index rather than
-- becoming a second outstanding batch nobody reconciles.
create unique index if not exists agent_runs_one_outstanding_batch_idx
  on public.agent_runs (agent_id)
  where status = 'queued';

-- What the collector cron reads: everything still out, oldest first, so a
-- backlog is worked in the order it was created.
create index if not exists agent_runs_queued_idx
  on public.agent_runs (queued_at)
  where status = 'queued';

create index if not exists agent_runs_batch_id_idx on public.agent_runs (batch_id)
  where batch_id is not null;
