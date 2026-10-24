-- ---------------------------------------------------------------------------
-- REBUILD («build your own version of any app», the final All tools grid,
-- 2026-10-23): one row per app a person made.
--
-- How to undo: drop table if exists public.rebuild_projects;
--   (it removes every app made with Rebuild, and nothing else reads this
--   table; no other table is touched by this migration).
--
-- The plan (four boxes), what a page the person pointed at was read for
-- (labels only, never the page: lib/rebuild/structure.ts), the app's
-- current HTML and its last versions.
-- READ AND DELETED BY THE ACCOUNT, WRITTEN BY THE SERVER: every insert and
-- update goes through src/app/api/rebuild/route.ts and
-- src/app/api/rebuild/[id]/route.ts, which check an app before storing it
-- (src/lib/rebuild/rebuild-html.ts) — the same rule as user_games
-- (20261024000000_user_games.sql).
--
-- Erased with the account: user_id cascades from auth.users.
-- Idempotent: if not exists, drop policy if exists.
-- How to check it after running: npm run db:pending; /api/health lists
-- rebuild_projects.
-- ---------------------------------------------------------------------------

create table if not exists public.rebuild_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  locale text not null default 'en',
  plan jsonb not null,
  reference jsonb,
  html text,
  versions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rebuild_projects_user_updated_idx on public.rebuild_projects (user_id, updated_at desc);

alter table public.rebuild_projects enable row level security;

drop policy if exists "select_own_rebuild_projects" on public.rebuild_projects;
create policy "select_own_rebuild_projects" on public.rebuild_projects
  for select using (auth.uid() = user_id);

drop policy if exists "delete_own_rebuild_projects" on public.rebuild_projects;
create policy "delete_own_rebuild_projects" on public.rebuild_projects
  for delete using (auth.uid() = user_id);

revoke insert, update on public.rebuild_projects from anon, authenticated;

comment on table public.rebuild_projects is
  'Apps made in /dashboard/rebuild: plan, what a pointed-at page was read for, current HTML, last versions. Written by api/rebuild and api/rebuild/[id] only.';
