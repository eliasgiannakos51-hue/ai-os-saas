-- ---------------------------------------------------------------------------
-- AUTOMATIONS AS BOXES (2026-10-07, MASTER 16 package 30, behind the switch
-- "automations"; the plan is docs/automations-plan-2026-10-04.md §2).
--
-- automation_flows          one row per automation: its name, the sentence
--                           it was made from, its boxes (shape in
--                           src/lib/automations/boxes.ts), whether it is on,
--                           when it runs next, and the most one run may cost.
-- automation_flow_versions  every set of boxes it has had, with the words
--                           that changed it: "αναίρεση" goes back one.
-- automation_runs           one row per run: what started it, each box's
--                           outcome, what it cost, and — for a run that
--                           waits at an approval box — where it stopped and
--                           what it had so far.
--
-- WRITTEN BY THE SERVER ONLY, as generated_posts and generated_images are:
-- the routes that call the model and the runner that charges credits know
-- what a change cost and what a run did; a person who could write these
-- could switch on an automation the routes refused, or mark a run approved
-- without pressing approve. They may read their own rows, and delete their
-- own automations (the versions and runs go with them).
--
-- user_automations, the one-sentence automations from before, is not
-- touched: it keeps running for everybody the switch is off for.
--
-- Idempotent: create if not exists, drop policy if exists.
-- How to check it after running: npm run db:pending; /api/health lists
-- automation_flows.
-- How to undo: drop table public.automation_runs; drop table
--              public.automation_flow_versions; drop table public.automation_flows;
--              (deletes every automation made with the switch on, and its
--              history: ask first.)
-- ---------------------------------------------------------------------------

create table if not exists public.automation_flows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  said text not null,
  boxes jsonb not null default '[]'::jsonb,
  version int not null default 1 check (version >= 1),
  is_active boolean not null default false,
  -- An IANA zone, so "every morning at 9" is the person's 9.
  time_zone text not null default 'Europe/Athens',
  next_run_at timestamptz,
  last_run_at timestamptz,
  -- The most one run may cost, in credits; a run that would pass it stops
  -- before the box that would.
  cost_limit int not null default 100 check (cost_limit between 1 and 5000),
  -- Held while a run or a change is under way, so two cannot overlap.
  busy_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automation_flows_user_idx on public.automation_flows (user_id, created_at desc);
create index if not exists automation_flows_due_idx on public.automation_flows (next_run_at) where is_active;

create table if not exists public.automation_flow_versions (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.automation_flows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version int not null,
  boxes jsonb not null,
  -- The words that made this version: the first sentence, or a change.
  said text not null,
  created_at timestamptz not null default now(),
  unique (flow_id, version)
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.automation_flows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- time | event | manual | dry
  started_by text not null check (started_by in ('time', 'event', 'manual', 'dry')),
  status text not null default 'queued' check (status in ('queued', 'running', 'waiting_approval', 'done', 'stopped', 'failed', 'cancelled')),
  -- One entry per box: { box, status, note, credits } (src/lib/automations/run-steps.ts).
  steps jsonb not null default '[]'::jsonb,
  -- What a waiting run had when it stopped, to go on from (the text so
  -- far and the box to start at); once it ends, its result (what was sent
  -- or saved, or on a dry run what would have been). Never credentials.
  state jsonb,
  -- The file that started an event run (user_files.id), when there is one.
  event_ref uuid,
  credits_charged int not null default 0 check (credits_charged >= 0),
  error text,
  approval_expires_at timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists automation_runs_flow_idx on public.automation_runs (flow_id, started_at desc);
create index if not exists automation_runs_user_idx on public.automation_runs (user_id, started_at desc);
create index if not exists automation_runs_queued_idx on public.automation_runs (status, started_at) where status = 'queued';

alter table public.automation_flows enable row level security;
alter table public.automation_flow_versions enable row level security;
alter table public.automation_runs enable row level security;

drop policy if exists automation_flows_select_own on public.automation_flows;
create policy automation_flows_select_own on public.automation_flows for select using (auth.uid() = user_id);
drop policy if exists automation_flows_delete_own on public.automation_flows;
create policy automation_flows_delete_own on public.automation_flows for delete using (auth.uid() = user_id);
drop policy if exists automation_flow_versions_select_own on public.automation_flow_versions;
create policy automation_flow_versions_select_own on public.automation_flow_versions for select using (auth.uid() = user_id);
drop policy if exists automation_runs_select_own on public.automation_runs;
create policy automation_runs_select_own on public.automation_runs for select using (auth.uid() = user_id);

grant select, delete on public.automation_flows to authenticated;
revoke insert, update on public.automation_flows from authenticated;
grant select on public.automation_flow_versions to authenticated;
revoke insert, update, delete on public.automation_flow_versions from authenticated;
grant select on public.automation_runs to authenticated;
revoke insert, update, delete on public.automation_runs from authenticated;
revoke all on public.automation_flows from anon;
revoke all on public.automation_flow_versions from anon;
revoke all on public.automation_runs from anon;

drop trigger if exists set_updated_at on public.automation_flows;
create trigger set_updated_at before update on public.automation_flows
  for each row execute function public.set_updated_at();
