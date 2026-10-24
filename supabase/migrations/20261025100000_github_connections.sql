-- ---------------------------------------------------------------------------
-- GITHUB CONNECTIONS FOR CODING (2026-10-25, MASTER Μέρος 20 Γ; open to
-- everyone since 2026-10-23, no switch: the connect button appears only when
-- the GitHub App's four environment variables are set).
--
-- A separate table rather than a row in user_integrations, because GitHub
-- Apps have a fundamentally different model: an installation_id that names
-- which repositories the user granted, and an access token that is the
-- user's own (not an installation token — those are ephemeral, generated
-- on demand from the App's private key, and never stored).
--
-- One row per user. A user who disconnects and reconnects gets the same
-- row upserted, never two.
--
-- How to check it after running: npm run db:pending.
-- Idempotent: if not exists, drop policy if exists.
-- How to undo: drop table if exists public.github_connections;
-- ---------------------------------------------------------------------------

create table if not exists public.github_connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  github_user_id bigint not null,
  github_login  text not null,
  access_token_encrypted text not null,
  installation_id bigint,
  connected_at  timestamptz not null default now(),
  status        text not null default 'connected'
                  check (status in ('connected', 'expired', 'revoked', 'error')),
  constraint github_connections_one_per_user unique (user_id)
);

alter table public.github_connections enable row level security;

drop policy if exists "Users read own GitHub connection" on public.github_connections;
create policy "Users read own GitHub connection"
  on public.github_connections for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.github_connections from anon, authenticated;

-- Only the server (service role) writes. The user never calls insert/
-- update/delete through the client — every mutation goes through an API
-- route that authenticates, encrypts and writes with the admin client,
-- same as user_integrations.
