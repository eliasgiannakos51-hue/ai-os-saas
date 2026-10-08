-- ---------------------------------------------------------------------------
-- ONE SENTENCE, SEVERAL TOOLS, ONE PROJECT (2026-10-07, MASTER 6.1 and 6.3;
-- MASTER 16 package 36), behind the switch "flows".
--
-- project_flows  one row per approved flow: the sentence, the colour the
--                steps share, the plan (src/lib/flows/plan.ts), the
--                project its results go into, and each step's state —
--                waiting, running, done or failed, and the row it made.
--
-- The work itself is each tool's own: a site is a user_websites row, the
-- pictures a generated_images row, and so on, charged by its own route.
-- This row is what lets a flow be followed after a reload, and what says
-- which project each result was put in.
--
-- WRITTEN BY THE SERVER ONLY (api/flows, api/flows/[id]/steps): a step is
-- marked done only after the route has read the row it names as the
-- person's own. They may read their own flows; deleting the project
-- deletes its flows.
--
-- Idempotent: create if not exists, drop policy if exists.
-- How to check it after running: npm run db:pending; /api/health lists
-- project_flows.
-- How to undo: drop table public.project_flows;
--              (the projects and everything the flows made stay; only the
--              record of which step made what goes.)
-- ---------------------------------------------------------------------------

create table if not exists public.project_flows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  said text not null,
  colour text check (colour is null or colour ~ '^#[0-9a-f]{6}$'),
  plan jsonb not null,
  -- { "<step id>": { "status": "running"|"done"|"failed", "row": …, "error": … } }; a step not yet started has no entry
  steps jsonb not null default '{}'::jsonb,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_flows_user_idx on public.project_flows (user_id, created_at desc);
create index if not exists project_flows_project_idx on public.project_flows (project_id);

alter table public.project_flows enable row level security;
drop policy if exists project_flows_select_own on public.project_flows;
create policy project_flows_select_own on public.project_flows for select using (auth.uid() = user_id);
grant select on public.project_flows to authenticated;
revoke insert, update, delete on public.project_flows from authenticated;
revoke all on public.project_flows from anon;

drop trigger if exists set_updated_at on public.project_flows;
create trigger set_updated_at before update on public.project_flows
  for each row execute function public.set_updated_at();
