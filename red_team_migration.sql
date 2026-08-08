-- ============================================================================
-- red_team_runs — the history of the scheduled adversarial suite.
--
-- Standalone, additive, idempotent.
--
-- One row per weekly run of api/cron/red-team: how many probes were sent,
-- how many got through, and the full per-probe result including an excerpt
-- of what the model actually said. The excerpt is the point — a report that
-- says "the crisis probe failed" and nothing else cannot be acted on.
--
-- NO RLS POLICIES AT ALL, and that is deliberate rather than an omission.
-- RLS is ENABLED, and with no policy the table is unreadable to every
-- `anon` and `authenticated` role — only the service-role client can touch
-- it. The contents are a list of ways to get the assistant to misbehave,
-- with worked examples of the ones that succeeded. That is an attacker's
-- shopping list, and it does not belong behind "is this row yours".
-- ============================================================================

create table if not exists public.red_team_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  -- Which model answered. A bypass that appears the week a model id
  -- changes is a different investigation from one that appears after a
  -- system-prompt edit.
  model text not null,
  total integer not null,
  failed integer not null,
  -- The full ProbeResult[] — id, category, what, passed, failure, excerpt.
  results jsonb not null default '[]'::jsonb
);

create index if not exists red_team_runs_run_at_idx
  on public.red_team_runs (run_at desc);

-- The query the owner's dashboard makes: "when did something last get
-- through?"
create index if not exists red_team_runs_failed_idx
  on public.red_team_runs (failed, run_at desc) where failed > 0;

alter table public.red_team_runs enable row level security;

-- ----------------------------------------------------------------------------
-- Housekeeping. One row a week is nothing, but each carries fourteen
-- excerpts and this table has no natural end. A year of history answers
-- every question anyone asks of it.
-- ----------------------------------------------------------------------------
create or replace function public.prune_red_team_runs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer;
begin
  delete from public.red_team_runs where run_at < now() - interval '365 days';
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.prune_red_team_runs() from public;
revoke all on function public.prune_red_team_runs() from anon;
revoke all on function public.prune_red_team_runs() from authenticated;
grant execute on function public.prune_red_team_runs() to service_role;
