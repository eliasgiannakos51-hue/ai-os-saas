-- ============================================================================
-- V3 — Task 1: Autonomous AI Agents.
--
-- Standalone, additive, idempotent migration. Safe to run on a project that
-- already has supabase_full_project_backup.sql applied. Every statement is
-- "if not exists" / "drop-then-create policy", the same convention the
-- earlier standalone migrations in this repo use.
--
-- WHAT THIS REPLACES. /dashboard/agents used to render the `ai_agents`
-- Build-module TRACKER (a name/description/status row a human typed by
-- hand — nothing ever ran). This migration adds the tables behind the real
-- feature: an agent the user describes in one sentence, that Ionexa builds
-- itself and then executes on a schedule, on our infrastructure, forever.
--
-- `ai_agents` is deliberately left in place and untouched — exactly what
-- was done when the Documents module replaced the `ai_documents`
-- placeholder at the same route. No user's existing rows are dropped.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- user_agents — one row per agent the user owns.
-- ----------------------------------------------------------------------------
create table if not exists public.user_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Shown on the card. Written by the AI builder from the user's sentence,
  -- editable afterwards.
  name text not null,
  description text,

  -- The task the agent performs on every run, in natural language. This is
  -- DATA, never instructions: lib/agents/agent-runner.ts wraps it in a
  -- delimited block and the system prompt states explicitly that nothing
  -- inside it can change the agent's rules. See the prompt-injection notes
  -- in lib/agents/agent-config.ts.
  prompt text not null,

  -- Standard 5-field cron (minute hour day-of-month month day-of-week),
  -- interpreted in `timezone` — NOT in UTC. Validated by
  -- lib/agents/cron-expression.ts before it ever reaches this table, which
  -- also enforces the "at most one run per hour" rule (the minute field
  -- must resolve to exactly one value).
  schedule_cron text not null,
  -- IANA zone id ("Europe/Athens"). The existing cron
  -- (api/cron/scheduled-runs) has a documented UTC-only limitation; this
  -- feature does not inherit it, because "every morning" has to mean the
  -- user's morning or the agent is useless to them.
  timezone text not null default 'UTC',

  -- 'email' and 'slack'. The CHECK is what makes adding a third a deliberate
  -- migration rather than a typo that silently stores a delivery method
  -- nothing can honour — but it has to list everything the application can
  -- actually write, which is AGENT_DELIVERY_METHODS in
  -- lib/agents/agent-config.ts.
  --
  -- This said ('email') only, and was widened by v3_integrations_migration.sql
  -- running afterwards. That worked, and worked only because of the order:
  -- a project built from this file alone rejected every Slack-delivered
  -- agent the UI would happily let someone create. Same shape as the
  -- 'flagged' website status — see
  -- supabase/migrations/20260813_flagged_status_constraint.sql — and
  -- scripts/tests/enum-schema-drift.test.mjs now fails on either.
  delivery_method text not null default 'email'
    check (delivery_method in ('email', 'slack')),
  -- Where the result goes. Constrained in application code to the account's
  -- OWN verified email address — see the anti-abuse note in
  -- lib/agents/agent-config.ts. Stored rather than derived so a future
  -- multi-target delivery does not need a schema change.
  delivery_target text not null,

  --   active   — runs on schedule
  --   paused   — the user turned it off, or they ran out of credits
  --   disabled — 5 consecutive failures; needs the user to re-enable it
  status text not null default 'active'
    check (status in ('active', 'paused', 'disabled')),

  -- Builder output that is not a first-class column: whether the task needs
  -- a web search, the output format, the language to answer in. jsonb
  -- rather than columns because this is the part that will grow.
  config jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_run_at timestamptz,
  -- Null means "never scheduled" (paused/disabled). The cron selects on
  -- next_run_at <= now(), so a null can never be picked up by accident.
  next_run_at timestamptz,

  -- Reset to 0 by any successful run. At AGENT_MAX_CONSECUTIVE_FAILURES
  -- (5) the agent is auto-disabled and the owner is emailed.
  consecutive_failures int not null default 0,

  -- Atomic claim against two overlapping cron invocations both executing
  -- the same due agent — same mechanism as user_automations.
  processing_started_at timestamptz
);

-- The cron's own query: status + next_run_at, nothing else.
create index if not exists user_agents_status_next_run_at_idx
  on public.user_agents (status, next_run_at);

-- The dashboard's query.
create index if not exists user_agents_user_id_created_at_idx
  on public.user_agents (user_id, created_at desc);

-- The per-plan fair-use count ("how many agents does this user have").
create index if not exists user_agents_user_id_status_idx
  on public.user_agents (user_id, status);

alter table public.user_agents enable row level security;

drop policy if exists "select_own_user_agents" on public.user_agents;
create policy "select_own_user_agents" on public.user_agents
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_agents" on public.user_agents;
create policy "insert_own_user_agents" on public.user_agents
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_user_agents" on public.user_agents;
create policy "update_own_user_agents" on public.user_agents
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_user_agents" on public.user_agents;
create policy "delete_own_user_agents" on public.user_agents
  for delete using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.user_agents;
create trigger set_updated_at before update on public.user_agents
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- agent_runs — the execution history. One row per attempt, including the
-- ones that failed, so "why did I stop getting my email" is answerable.
-- ----------------------------------------------------------------------------
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.user_agents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'success', 'failed')),

  -- What the agent produced, verbatim — the same text that was emailed.
  output text,
  -- User-facing failure reason. Never a stack trace, never a provider
  -- error body: those go to lib/log-error.ts, not to a row the user reads.
  error text,

  -- Written at settlement, from the SettlementResult — not estimated.
  credits_charged int not null default 0,
  tokens_used int not null default 0,

  trigger_source text not null default 'schedule'
    check (trigger_source in ('schedule', 'manual')),
  -- 1 on the first try, 2 or 3 after a retry (AGENT_MAX_ATTEMPTS = 3, i.e.
  -- the initial attempt plus the two retries the brief asks for).
  attempts int not null default 1
);

create index if not exists agent_runs_user_id_started_at_idx
  on public.agent_runs (user_id, started_at desc);

create index if not exists agent_runs_agent_id_started_at_idx
  on public.agent_runs (agent_id, started_at desc);

-- The per-user hourly execution cap counts rows in this table.
create index if not exists agent_runs_user_id_started_at_status_idx
  on public.agent_runs (user_id, started_at desc, status);

alter table public.agent_runs enable row level security;

-- Read-only to the owner. There is deliberately NO insert/update/delete
-- policy: only the service-role client writes here (the cron and the
-- "Run now" route both use createAdminClient), and service role bypasses
-- RLS. A user who could insert rows here could fabricate a run history;
-- one who could delete them could hide a run they were charged for.
drop policy if exists "select_own_agent_runs" on public.agent_runs;
create policy "select_own_agent_runs" on public.agent_runs
  for select using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Email preference for agent results.
--
-- 'agent_run_result' is an OPTIONAL email type (lib/email/email-types.ts),
-- so it needs its own column here or checkEmailAllowed's
-- `select(OPTIONAL_EMAIL_TYPES.join(","))` fails for every user.
--
-- 'agent_disabled' is deliberately NOT here: it is critical mail. An agent
-- that has switched itself off after five failures is a state change the
-- owner has to know about to fix, and suppressing it because a busy day
-- hit the 20-email cap would leave them silently without the thing they
-- built the agent for.
-- ----------------------------------------------------------------------------
alter table public.user_email_preferences
  add column if not exists agent_run_result boolean not null default true;
