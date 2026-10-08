-- ---------------------------------------------------------------------------
-- GAMES (MASTER 16, package 26): one row per game a person made.
--
-- How to undo: drop table if exists public.user_games;
--   (it removes every game made, and nothing else reads this table).
--
-- The plan (five boxes), the game's current HTML and its last versions.
-- READ AND DELETED BY THE ACCOUNT, WRITTEN BY THE SERVER: every insert and
-- update goes through src/app/api/games/route.ts and
-- src/app/api/games/[id]/route.ts, which check a game before storing it
-- (src/lib/games/game-html.ts) — the same rule as user_websites
-- (20261015000000_agents_websites_server_written.sql).
--
-- Erased with the account: user_id cascades from auth.users.
-- Idempotent: if not exists, drop policy if exists.
-- ---------------------------------------------------------------------------

create table if not exists public.user_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  locale text not null default 'en',
  plan jsonb not null,
  html text,
  versions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_games_user_updated_idx on public.user_games (user_id, updated_at desc);

alter table public.user_games enable row level security;

drop policy if exists "select_own_user_games" on public.user_games;
create policy "select_own_user_games" on public.user_games
  for select using (auth.uid() = user_id);

drop policy if exists "delete_own_user_games" on public.user_games;
create policy "delete_own_user_games" on public.user_games
  for delete using (auth.uid() = user_id);

revoke insert, update on public.user_games from anon, authenticated;

comment on table public.user_games is
  'Games made in /dashboard/games (package 26): plan, current HTML, last versions. Written by api/games and api/games/[id] only.';
