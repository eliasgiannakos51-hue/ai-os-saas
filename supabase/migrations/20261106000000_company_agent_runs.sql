-- ---------------------------------------------------------------------------
-- THE COMPANY'S OWN AGENTS: one row per time one of them ran
-- (docs/PROGRESS.md 2026-11-06β). These are Ionexa's internal workers —
-- the ones that watch the product — not the customer-facing agents in
-- public.user_agents / public.agent_runs, which is why this table is
-- called company_agent_runs and does not reuse that name.
--
-- WHO WRITES: /api/cron/company-agents, with the service-role client.
-- WHO READS: the owner-only section of /dashboard/system-health, with the
-- service-role client behind isAdminEmail(). Nobody signed in as a
-- customer can read or write a row: RLS is on, there is no policy, and
-- every grant is revoked from anon and authenticated.
--
-- `status` has four values and "unverified" is one of them on purpose:
-- a check that could not be run (no URL configured, a table that could
-- not be read) is recorded as NOT RUN, never as ok. `unverified` lists
-- what that run did not look at, so a green row cannot claim more than
-- it measured.
--
-- Idempotent: if not exists, and re-running changes nothing.
-- How to check it after running: npm run db:pending; /api/health lists
-- company_agent_runs.
-- How to undo: drop table if exists public.company_agent_runs;
--   (removes the history of the internal agents' runs and nothing else:
--   no other table, function or policy is created or touched here).
-- ---------------------------------------------------------------------------

create table if not exists public.company_agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  ran_at timestamptz not null default now(),
  status text not null check (status in ('ok', 'warn', 'fail', 'unverified')),
  summary text not null,
  evidence jsonb not null default '{}'::jsonb,
  unverified text[] not null default '{}'
);

create index if not exists company_agent_runs_agent_ran_idx
  on public.company_agent_runs (agent_id, ran_at desc);

alter table public.company_agent_runs enable row level security;

revoke all on public.company_agent_runs from anon;
revoke all on public.company_agent_runs from authenticated;
