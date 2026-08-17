-- ============================================================================
-- V3 — Task 3: Universal Integrations.
--
-- Standalone, additive, idempotent. Safe to run on a project that already
-- has supabase_full_project_backup.sql applied.
--
-- WHAT MAKES THIS TABLE DIFFERENT FROM EVERY OTHER ONE IN THIS SCHEMA:
-- every other table holds data the user typed into us. This one holds keys
-- to a DIFFERENT building — a Google access token is read access to
-- somebody's actual mail. A leak here is not "our data leaked", it is
-- "their Gmail leaked, through us".
--
-- So the tokens in these columns are CIPHERTEXT, produced by
-- lib/integrations/crypto.ts (AES-256-GCM) with a key that lives in the
-- environment and never in the database. A dump of this table, on its own,
-- is worthless. The column names say _encrypted so that nobody writing a
-- future INSERT has to guess.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- user_integrations — one row per (user, provider).
-- ----------------------------------------------------------------------------
create table if not exists public.user_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- 'gmail' | 'google_drive' | 'slack'. Gmail and Drive are separate rows
  -- even though they share one Google OAuth client: a user who wants the
  -- AI to read their files should not have to hand over their mail to get
  -- it, and "disconnect Gmail" has to be expressible on its own.
  provider text not null check (provider in ('gmail', 'google_drive', 'slack')),

  -- CIPHERTEXT. Never a raw token. Format: v1.<iv>.<tag>.<ciphertext>,
  -- base64url, with the user id and the token kind bound in as GCM
  -- additional authenticated data — so a ciphertext moved between rows or
  -- between columns fails to decrypt instead of quietly working.
  access_token_encrypted text not null,
  -- Null for providers that issue no refresh token (Slack bot tokens do
  -- not expire unless the workspace enables rotation).
  refresh_token_encrypted text,
  expires_at timestamptz,

  -- What was actually granted, which is not always what was asked for —
  -- a user can untick a scope on Google's consent screen. Stored so the
  -- app can tell "connected" from "connected but useless".
  scopes text[] not null default '{}',

  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sync_at timestamptz,

  --   connected — usable
  --   expired   — the refresh token was rejected; needs reconnecting
  --   revoked   — the user revoked access on the provider's side
  --   error     — repeated failures; needs reconnecting
  status text not null default 'connected'
    check (status in ('connected', 'expired', 'revoked', 'error')),

  -- NON-SENSITIVE display data only: the connected account's email
  -- address, the Slack workspace name, the bot user id. Anything that is
  -- a credential belongs in the _encrypted columns above. jsonb rather
  -- than columns because it differs per provider.
  metadata jsonb not null default '{}'::jsonb
);

-- One connection per provider per user. A second "Connect" replaces the
-- first rather than accumulating orphaned grants nobody can revoke.
create unique index if not exists user_integrations_user_provider_key
  on public.user_integrations (user_id, provider);

create index if not exists user_integrations_user_status_idx
  on public.user_integrations (user_id, status);

-- The refresh sweep's query.
create index if not exists user_integrations_expires_at_idx
  on public.user_integrations (expires_at)
  where status = 'connected';

alter table public.user_integrations enable row level security;

drop policy if exists "select_own_user_integrations" on public.user_integrations;
create policy "select_own_user_integrations" on public.user_integrations
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_integrations" on public.user_integrations;
create policy "insert_own_user_integrations" on public.user_integrations
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_user_integrations" on public.user_integrations;
create policy "update_own_user_integrations" on public.user_integrations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Delete is what "Disconnect" does, and it must be the user's own right —
-- GDPR erasure of a third-party grant cannot depend on us running a job.
drop policy if exists "delete_own_user_integrations" on public.user_integrations;
create policy "delete_own_user_integrations" on public.user_integrations
  for delete using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.user_integrations;
create trigger set_updated_at before update on public.user_integrations
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- integration_sync_log — an audit trail the USER can read.
--
-- Not for us: for them. "What has the AI actually looked at?" is a
-- question a person is entitled to be able to answer about a system that
-- reads their mail, and an answer that exists only in our server logs is
-- not an answer they have.
--
-- It records COUNTS and OUTCOMES, never content. There is no column that
-- could hold the subject of an email or the name of a file.
-- ----------------------------------------------------------------------------
create table if not exists public.integration_sync_log (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.user_integrations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  synced_at timestamptz not null default now(),
  items_synced integer not null default 0,
  status text not null default 'success' check (status in ('success', 'failed')),
  -- A short, user-facing reason. Never a provider error body: those
  -- routinely echo the request, and the request carried a token.
  error text,
  -- What triggered the read, so "the AI read my mail" is attributable.
  --   chat        — the user asked a question in Ionexa Chat
  --   agent       — a scheduled agent run
  --   life_context — the ambient context assembled for the AI
  --   manual      — the user pressed Sync
  source text not null default 'chat'
    check (source in ('chat', 'agent', 'life_context', 'manual'))
);

create index if not exists integration_sync_log_integration_synced_idx
  on public.integration_sync_log (integration_id, synced_at desc);

create index if not exists integration_sync_log_user_synced_idx
  on public.integration_sync_log (user_id, synced_at desc);

alter table public.integration_sync_log enable row level security;

-- Read-only to the owner. Only the service-role client writes here: an
-- audit trail a user can edit is not an audit trail.
drop policy if exists "select_own_integration_sync_log" on public.integration_sync_log;
create policy "select_own_integration_sync_log" on public.integration_sync_log
  for select using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Housekeeping: the sync log is append-only and unbounded by nature.
-- 90 days is long enough to answer "what did it read last quarter" and
-- short enough that the table stays small. Called from the daily cron.
-- ----------------------------------------------------------------------------
create or replace function public.prune_integration_sync_log()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer;
begin
  delete from public.integration_sync_log
    where synced_at < now() - interval '90 days';
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.prune_integration_sync_log() from public;
revoke all on function public.prune_integration_sync_log() from anon;
revoke all on function public.prune_integration_sync_log() from authenticated;
grant execute on function public.prune_integration_sync_log() to service_role;

-- ----------------------------------------------------------------------------
-- Agents can now deliver to Slack as well as email (V3 Task 1 + Task 3).
--
-- The CHECK is replaced rather than dropped: an agent row must still never
-- hold a delivery method nothing can honour.
-- ----------------------------------------------------------------------------
alter table public.user_agents
  drop constraint if exists user_agents_delivery_method_check;
alter table public.user_agents
  add constraint user_agents_delivery_method_check
  check (delivery_method in ('email', 'slack'));
