-- ---------------------------------------------------------------------------
-- IONEXA IN DISCORD (the owner's Discord directive, 2026-11-05): which
-- Discord servers an account has connected, the server plans it made, and
-- every id an apply created — so that «Αναίρεση» deletes those and nothing
-- else.
--
-- How to undo: drop table if exists public.discord_build_items;
--              drop table if exists public.discord_builds;
--              drop table if exists public.discord_guilds;
--   (every connected server is forgotten and has to be connected again
--   from /dashboard/discord; the plans and the record of what an apply made
--   are gone, so an apply can no longer be undone from Ionexa — whatever
--   was made STAYS in Discord, untouched, and the server's owner can still
--   delete it there by hand. Nothing is deleted in Discord by this undo.)
--
-- WRITTEN AND READ BY THE SERVER ONLY. RLS on, no policy, all grants
-- revoked from anon and authenticated, like telegram_pairings
-- (20261031000001_telegram_link.sql): every route reads these through the
-- service role after checking the session, and filters by the session's
-- user id. A browser that could insert into discord_guilds could point an
-- account at a server it does not manage; one that could insert into
-- discord_build_items could make Undo delete a channel that existed
-- before. Neither is reachable without a policy, so there is none.
--
-- Erased with the account: user_id cascades from auth.users.
-- Idempotent: if not exists.
-- ---------------------------------------------------------------------------

-- ONE SERVER, ONE ACCOUNT: guild_id is the primary key. The slash command
-- (api/discord/interactions) answers "whose credits does /ionexa ask in
-- this server spend?" by this row, and two accounts on one server would
-- make that a race. An account may connect several servers.
create table if not exists public.discord_guilds (
  guild_id text primary key check (guild_id ~ '^[0-9]{15,22}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- What the screen shows. Arrives from Discord, so bounded.
  guild_name text check (guild_name is null or length(guild_name) <= 100),
  connected_at timestamptz not null default now()
);

create index if not exists discord_guilds_user_idx on public.discord_guilds (user_id);

alter table public.discord_guilds enable row level security;
revoke all on public.discord_guilds from anon, authenticated;

comment on table public.discord_guilds is
  'Discord servers connected to an account through the bot invite (api/discord/callback, after the bot itself confirmed the server). guild_id is the key: one account per server. Server-written and server-read only.';

-- A SERVER PLAN: the boxes as JSON (lib/discord/blueprint.ts reads it on
-- every load, so a row edited by hand into something that is not a plan is
-- refused, not applied), and where it is in its life.
create table if not exists public.discord_builds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  guild_id text not null check (guild_id ~ '^[0-9]{15,22}$'),
  -- The person's own words, as said.
  said text not null check (length(said) <= 2000),
  blueprint jsonb not null,
  -- Bumped on every change, so two tabs cannot overwrite each other's plan.
  version integer not null default 1,
  status text not null default 'planned'
    check (status in ('planned', 'applying', 'applied', 'failed', 'undoing', 'undone')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists discord_builds_user_idx on public.discord_builds (user_id, created_at desc);

alter table public.discord_builds enable row level security;
revoke all on public.discord_builds from anon, authenticated;

comment on table public.discord_builds is
  'Discord server plans (the boxes) and their state: planned, applying, applied, failed, undoing, undone. Server-written and server-read only.';

-- EVERY ID AN APPLY CREATED, in the order it was created. Undo reads THIS
-- and nothing else (lib/discord/apply.ts, undoItems), newest first; a row
-- is written the moment Discord answers, before the next request is sent.
create table if not exists public.discord_build_items (
  build_id uuid not null references public.discord_builds(id) on delete cascade,
  seq integer not null check (seq >= 1),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('role', 'category', 'channel', 'message', 'automod')),
  box_key text not null check (length(box_key) <= 40),
  discord_id text not null check (discord_id ~ '^[0-9]{15,22}$'),
  -- A message's channel, which deleting the message needs.
  channel_id text check (channel_id is null or channel_id ~ '^[0-9]{15,22}$'),
  note text check (note is null or length(note) <= 40),
  created_at timestamptz not null default now(),
  -- Set by Undo once Discord has confirmed the delete (or said it was gone).
  deleted_at timestamptz,
  primary key (build_id, seq)
);

create index if not exists discord_build_items_user_idx on public.discord_build_items (user_id);

alter table public.discord_build_items enable row level security;
revoke all on public.discord_build_items from anon, authenticated;

comment on table public.discord_build_items is
  'Every Discord id one apply created, in order. Undo deletes exactly these, newest first, and nothing that existed before. Server-written and server-read only.';
