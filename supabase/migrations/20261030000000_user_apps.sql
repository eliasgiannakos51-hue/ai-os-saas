-- ---------------------------------------------------------------------------
-- APPS (the owner's "APPS: ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ", 2026-10-24,
-- κομμάτι 2): one row per app a person planned.
--
-- How to undo: drop table if exists public.user_apps;
--   (it removes every app planned and every version of it; the rows those
--   apps keep live in their own table and are not touched by this).
--
-- THE DEFINITION, NOT CODE. `definition` is the JSON our own components
-- draw — collections with their fields, screens that point at them, who
-- sees what, what gets notified (docs/APPS-ISOLATION.md §1). No HTML and
-- no script written by a model is ever stored here, which is why this
-- table needs none of the sealing user_games and user_websites need.
--
-- READ AND DELETED BY THE ACCOUNT, WRITTEN BY THE SERVER: every insert
-- and update goes through src/app/api/apps/route.ts and
-- src/app/api/apps/[id]/route.ts, which parse a definition before storing
-- it (src/lib/apps/app-plan.ts) — the same rule as user_games
-- (20261024000000_user_games.sql) and the posture every table has kept
-- since 20261014000000_server_written_tables.sql.
--
-- `status` is 'planning' until the owner approves the plan, 'approved'
-- after. Nothing is built from a plan that was not approved.
--
-- Erased with the account: user_id cascades from auth.users.
-- Idempotent: if not exists, drop policy if exists.
-- ---------------------------------------------------------------------------

create table if not exists public.user_apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  locale text not null default 'en',
  definition jsonb not null,
  status text not null default 'planning',
  versions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_apps_user_updated_idx on public.user_apps (user_id, updated_at desc);

alter table public.user_apps enable row level security;

drop policy if exists "select_own_user_apps" on public.user_apps;
create policy "select_own_user_apps" on public.user_apps
  for select using (auth.uid() = user_id);

drop policy if exists "delete_own_user_apps" on public.user_apps;
create policy "delete_own_user_apps" on public.user_apps
  for delete using (auth.uid() = user_id);

revoke insert, update on public.user_apps from anon, authenticated;

comment on table public.user_apps is
  'Apps planned in /dashboard/app-builder: the definition our components draw, its status and its last versions. Written by api/apps and api/apps/[id] only.';
