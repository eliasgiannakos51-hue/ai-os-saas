-- ---------------------------------------------------------------------------
-- IOWORK (the owner's "IOWORK: ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ", Φάση 1,
-- κομμάτι 2): the computers an account has connected, and the short-lived
-- pairings that connect them.
--
-- How to undo: drop table if exists public.iowork_pairings;
--              drop table if exists public.iowork_devices;
--   (every connected computer stops working and has to be paired again;
--   nothing of the person's own files is in either table, so nothing of
--   theirs is lost.)
--
-- NEITHER TABLE HOLDS A SECRET IN THE CLEAR. `claim_secret_hash` and
-- `token_hash` are SHA-256 of values that only ever existed in one HTTP
-- response and in the desktop app's keychain (src/lib/iowork/pairing.ts
-- says why a plain digest is the right hash for a 32-byte random value).
-- A copy of this database is therefore not a set of working device tokens.
--
-- NOTHING ABOUT THE PERSON'S FILES IS HERE, and that is §4 of the approved
-- docs/IOWORK-SECURITY-PLAN.md, not an accident of this schema: no path,
-- no file name, no folder. The list of allowed folders lives on the
-- computer, in the app, because the server is never the thing that decides
-- what may be touched (§3).
--
-- WRITTEN BY THE SERVER ONLY, like every table since
-- 20261014000000_server_written_tables.sql. The account may read its own
-- computers and disconnect one; it may not insert or rename a row, because
-- both of those are how a forged device would be planted.
--
-- iowork_pairings has NO policy at all, deliberately. Only the service role
-- touches it (src/app/api/iowork/pair/route.ts and .../pair/token/route.ts,
-- plus the claim in .../devices/route.ts), and RLS with no policy is the
-- tightest statement of that: the browser cannot read a pending pairing
-- even if it guesses the id, so a pairing code cannot be harvested.
--
-- Erased with the account: user_id cascades from auth.users.
-- Idempotent: if not exists, drop policy if exists.
-- ---------------------------------------------------------------------------

create table if not exists public.iowork_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  platform text not null check (platform in ('mac', 'windows')),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists iowork_devices_user_idx on public.iowork_devices (user_id, created_at desc);

alter table public.iowork_devices enable row level security;

drop policy if exists "select_own_iowork_devices" on public.iowork_devices;
create policy "select_own_iowork_devices" on public.iowork_devices
  for select using (auth.uid() = user_id);

-- Disconnecting is a delete, not a flag: once the row is gone the token
-- matches nothing, so the computer loses access on its very next call with
-- no second check to forget. §3's "revoked by the user with one button".
drop policy if exists "delete_own_iowork_devices" on public.iowork_devices;
create policy "delete_own_iowork_devices" on public.iowork_devices
  for delete using (auth.uid() = user_id);

revoke insert, update on public.iowork_devices from anon, authenticated;

comment on table public.iowork_devices is
  'Computers connected to an account for iowork. Holds no path and no file name (IOWORK-SECURITY-PLAN §4). Written by api/iowork only; the account reads its own and may delete one.';

create table if not exists public.iowork_pairings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  claim_secret_hash text not null,
  platform text not null check (platform in ('mac', 'windows')),
  label text not null,
  user_id uuid references auth.users(id) on delete cascade,
  claimed_at timestamptz,
  collected_at timestamptz,
  created_at timestamptz not null default now()
);

-- The claim looks a pairing up by its code, and the sweep below finds the
-- old ones by age.
create index if not exists iowork_pairings_created_idx on public.iowork_pairings (created_at);

alter table public.iowork_pairings enable row level security;

revoke all on public.iowork_pairings from anon, authenticated;

comment on table public.iowork_pairings is
  'Pending pairings, ten minutes each (src/lib/iowork/pairing.ts PAIRING_TTL_MINUTES). RLS on with no policy on purpose: only the service role reads or writes it, so a pending code cannot be harvested from the browser.';
