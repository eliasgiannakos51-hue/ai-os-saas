-- ============================================================================
-- Ionexa AI — Supabase schema
-- 13 module tables, each scoped to the owning user via RLS (user_id =
-- auth.uid()), plus create_requests (a rate-limit log for /api/create).
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
--
-- NOTE: the 12 non-`ideas` tables below were redefined to match the exact
-- field set each dashboard module needs. The DROP TABLE statements make this
-- safe to re-run even if an earlier version of this schema already created
-- them with different columns — `ideas` is never dropped.
-- ============================================================================

create extension if not exists "pgcrypto";

drop table if exists public.competitors cascade;
drop table if exists public.research cascade;
drop table if exists public.finance_entries cascade;
drop table if exists public.learning_entries cascade;
drop table if exists public.trades cascade;
drop table if exists public.decisions cascade;
drop table if exists public.products cascade;
drop table if exists public.content cascade;
drop table if exists public.leads cascade;
drop table if exists public.feedback cascade;
drop table if exists public.metrics cascade;
drop table if exists public.automations cascade;
drop table if exists public.create_requests cascade;

-- ----------------------------------------------------------------------------
-- 1. ideas
-- ----------------------------------------------------------------------------
create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  problem text,
  customer text,
  competitors text,
  market_size text,
  mvp text,
  score integer,
  verdict text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. competitors
-- ----------------------------------------------------------------------------
create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  product text,
  pricing text,
  customers text,
  marketing text,
  strengths text,
  weaknesses text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. research
-- ----------------------------------------------------------------------------
create table public.research (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. finance_entries
-- ----------------------------------------------------------------------------
create table public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  type text not null check (type in ('income', 'expense')),
  amount numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. learning_entries
-- ----------------------------------------------------------------------------
create table public.learning_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  resources text,
  quiz text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6. trades
-- ----------------------------------------------------------------------------
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  direction text,
  result text,
  pnl numeric(18, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. decisions
-- ----------------------------------------------------------------------------
create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_names text not null,
  ranking text,
  recommendation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 8. products
-- ----------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_name text not null,
  mvp_features text,
  roadmap text,
  pricing text,
  target_audience text,
  user_journey text,
  risks text,
  launch_plan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 9. content
-- ----------------------------------------------------------------------------
create table public.content (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  caption text,
  twitter_thread text,
  hashtags text,
  content_ideas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 10. leads
-- ----------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_name text not null,
  score integer,
  cold_email text,
  follow_up_email text,
  next_steps text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 11. feedback
-- ----------------------------------------------------------------------------
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text not null,
  sentiment text,
  category text,
  suggested_response text,
  priority text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 12. metrics
-- ----------------------------------------------------------------------------
create table public.metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_name text not null,
  value numeric(18, 4),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 13. automations
-- ----------------------------------------------------------------------------
create table public.automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_name text not null,
  idea text,
  tools_needed text,
  suggested_workflow text,
  time_saved text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- create_requests — not one of the 13 modules. Append-only log used to rate
-- limit /api/create (max 20 Claude API calls per user per rolling hour).
-- No update/delete policies or updated_at trigger — rows are never modified.
-- ----------------------------------------------------------------------------
create table public.create_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists create_requests_user_id_created_at_idx
  on public.create_requests (user_id, created_at);

alter table public.create_requests enable row level security;

drop policy if exists "select_own_create_requests" on public.create_requests;
create policy "select_own_create_requests" on public.create_requests
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_create_requests" on public.create_requests;
create policy "insert_own_create_requests" on public.create_requests
  for insert with check (auth.uid() = user_id);

-- ============================================================================
-- Row Level Security
-- Every table: owner-only access, scoped by user_id = auth.uid().
-- ============================================================================

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'ideas', 'competitors', 'research', 'finance_entries', 'learning_entries',
      'trades', 'decisions', 'products', 'content', 'leads', 'feedback',
      'metrics', 'automations'
    ])
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format(
      'drop policy if exists "select_own_%1$s" on public.%1$s;', t
    );
    execute format(
      'create policy "select_own_%1$s" on public.%1$s for select using (auth.uid() = user_id);', t
    );

    execute format(
      'drop policy if exists "insert_own_%1$s" on public.%1$s;', t
    );
    execute format(
      'create policy "insert_own_%1$s" on public.%1$s for insert with check (auth.uid() = user_id);', t
    );

    execute format(
      'drop policy if exists "update_own_%1$s" on public.%1$s;', t
    );
    execute format(
      'create policy "update_own_%1$s" on public.%1$s for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t
    );

    execute format(
      'drop policy if exists "delete_own_%1$s" on public.%1$s;', t
    );
    execute format(
      'create policy "delete_own_%1$s" on public.%1$s for delete using (auth.uid() = user_id);', t
    );
  end loop;
end $$;

-- ============================================================================
-- updated_at auto-touch trigger (applied to every table above)
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'ideas', 'competitors', 'research', 'finance_entries', 'learning_entries',
      'trades', 'decisions', 'products', 'content', 'leads', 'feedback',
      'metrics', 'automations'
    ])
  loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();', t
    );
  end loop;
end $$;

-- ============================================================================
-- Ionexa Chat — general-purpose AI chatbot, separate from Create Anything.
-- chat_conversations is the thread list; chat_messages holds each turn.
-- Same owner-only RLS pattern as every table above (user_id = auth.uid()),
-- and the same updated_at auto-touch trigger on chat_conversations.
-- ============================================================================

drop table if exists public.chat_messages cascade;
drop table if exists public.chat_conversations cascade;

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_conversations_user_id_updated_at_idx
  on public.chat_conversations (user_id, updated_at desc);

create index if not exists chat_messages_conversation_id_created_at_idx
  on public.chat_messages (conversation_id, created_at);

create index if not exists chat_messages_user_id_created_at_idx
  on public.chat_messages (user_id, created_at);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "select_own_chat_conversations" on public.chat_conversations;
create policy "select_own_chat_conversations" on public.chat_conversations
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_chat_conversations" on public.chat_conversations;
create policy "insert_own_chat_conversations" on public.chat_conversations
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_chat_conversations" on public.chat_conversations;
create policy "update_own_chat_conversations" on public.chat_conversations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_chat_conversations" on public.chat_conversations;
create policy "delete_own_chat_conversations" on public.chat_conversations
  for delete using (auth.uid() = user_id);

drop policy if exists "select_own_chat_messages" on public.chat_messages;
create policy "select_own_chat_messages" on public.chat_messages
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_chat_messages" on public.chat_messages;
create policy "insert_own_chat_messages" on public.chat_messages
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_chat_messages" on public.chat_messages;
create policy "update_own_chat_messages" on public.chat_messages
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_chat_messages" on public.chat_messages;
create policy "delete_own_chat_messages" on public.chat_messages
  for delete using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.chat_conversations;
create trigger set_updated_at before update on public.chat_conversations
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Team members — invite/membership records for the team-seat billing
-- add-on. Access level itself (subscription_tier) still lives on
-- auth.users.raw_user_meta_data, set by /api/webhooks/stripe for owners and
-- by the accept-pending-invite check (on login) for members — this table is
-- just the relational "who invited whom, and did they join yet" record,
-- which user_metadata alone can't answer.
-- ============================================================================

drop table if exists public.team_members cascade;

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_email text not null,
  member_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'invited' check (status in ('invited', 'active')),
  -- What this person does on the team (e.g. "Marketing", "Developer") —
  -- collected at invite time (see components/team/invite-form.tsx) as part
  -- of confirming the seat is for real work, not personal/family use.
  -- Nullable since invites sent before this field existed have none.
  role text,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  unique (owner_id, member_email)
);

create index if not exists team_members_owner_id_idx
  on public.team_members (owner_id);

create index if not exists team_members_member_email_idx
  on public.team_members (member_email);

alter table public.team_members enable row level security;

drop policy if exists "select_own_team_members" on public.team_members;
create policy "select_own_team_members" on public.team_members
  for select using (auth.uid() = owner_id);

drop policy if exists "insert_own_team_members" on public.team_members;
create policy "insert_own_team_members" on public.team_members
  for insert with check (auth.uid() = owner_id);

drop policy if exists "update_own_team_members" on public.team_members;
create policy "update_own_team_members" on public.team_members
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "delete_own_team_members" on public.team_members;
create policy "delete_own_team_members" on public.team_members
  for delete using (auth.uid() = owner_id);

-- ============================================================================
-- "Build" modules — AI Agents, Websites, Apps, Images, Videos. Same
-- owner-only RLS pattern as the 13 business modules above; these are purely
-- tracking/log tables for now (no real AI generation happens yet — see
-- src/lib/build-modules.ts). Kept out of the do-loops above on purpose,
-- since those loops are scoped to the original 13-module table list.
-- ============================================================================

drop table if exists public.ai_agents cascade;
drop table if exists public.ai_websites cascade;
drop table if exists public.ai_apps cascade;
drop table if exists public.ai_images cascade;
drop table if exists public.ai_videos cascade;

create table public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  status text check (status in ('planned', 'active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_websites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  url text,
  status text check (status in ('planned', 'in progress', 'live', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  platform text check (platform in ('ios', 'android', 'web', 'desktop', 'cross-platform')),
  status text check (status in ('planned', 'in progress', 'live', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  description text,
  status text check (status in ('requested', 'in progress', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  description text,
  status text check (status in ('requested', 'in progress', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'ai_agents', 'ai_websites', 'ai_apps', 'ai_images', 'ai_videos'
    ])
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format(
      'drop policy if exists "select_own_%1$s" on public.%1$s;', t
    );
    execute format(
      'create policy "select_own_%1$s" on public.%1$s for select using (auth.uid() = user_id);', t
    );

    execute format(
      'drop policy if exists "insert_own_%1$s" on public.%1$s;', t
    );
    execute format(
      'create policy "insert_own_%1$s" on public.%1$s for insert with check (auth.uid() = user_id);', t
    );

    execute format(
      'drop policy if exists "update_own_%1$s" on public.%1$s;', t
    );
    execute format(
      'create policy "update_own_%1$s" on public.%1$s for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t
    );

    execute format(
      'drop policy if exists "delete_own_%1$s" on public.%1$s;', t
    );
    execute format(
      'create policy "delete_own_%1$s" on public.%1$s for delete using (auth.uid() = user_id);', t
    );

    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();', t
    );
  end loop;
end $$;

-- ============================================================================
-- More "Build" modules — AI Coding, Data Analysis, Documents, Presentations,
-- Marketing Campaigns. Same owner-only RLS pattern and tracking-only intent
-- as the ai_agents/ai_websites/ai_apps/ai_images/ai_videos tables above.
-- AI Memory (/dashboard/memory) needs no table of its own — it reads across
-- every table listed here plus every table earlier in this file.
-- ============================================================================

drop table if exists public.ai_coding_requests cascade;
drop table if exists public.ai_data_analysis_requests cascade;
drop table if exists public.ai_documents cascade;
drop table if exists public.ai_presentations cascade;
drop table if exists public.ai_campaigns cascade;

create table public.ai_coding_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  language text,
  status text check (status in ('requested', 'in progress', 'done', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_data_analysis_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  data_source text,
  findings text,
  status text check (status in ('requested', 'in progress', 'done', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  doc_type text check (doc_type in ('memo', 'report', 'proposal', 'spec', 'other')),
  status text check (status in ('draft', 'in review', 'final', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_presentations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  slide_count integer,
  status text check (status in ('draft', 'in review', 'final', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  channel text check (channel in ('email', 'social', 'paid ads', 'content', 'seo', 'event', 'other')),
  budget numeric(14, 2),
  status text check (status in ('planned', 'active', 'paused', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'ai_coding_requests', 'ai_data_analysis_requests', 'ai_documents',
      'ai_presentations', 'ai_campaigns'
    ])
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format(
      'drop policy if exists "select_own_%1$s" on public.%1$s;', t
    );
    execute format(
      'create policy "select_own_%1$s" on public.%1$s for select using (auth.uid() = user_id);', t
    );

    execute format(
      'drop policy if exists "insert_own_%1$s" on public.%1$s;', t
    );
    execute format(
      'create policy "insert_own_%1$s" on public.%1$s for insert with check (auth.uid() = user_id);', t
    );

    execute format(
      'drop policy if exists "update_own_%1$s" on public.%1$s;', t
    );
    execute format(
      'create policy "update_own_%1$s" on public.%1$s for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t
    );

    execute format(
      'drop policy if exists "delete_own_%1$s" on public.%1$s;', t
    );
    execute format(
      'create policy "delete_own_%1$s" on public.%1$s for delete using (auth.uid() = user_id);', t
    );

    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();', t
    );
  end loop;
end $$;

-- ============================================================================
-- Account deletion confirmation tokens — "Delete Account" no longer deletes
-- immediately after the typed-email check. Instead it sends an emailed link
-- (via Resend) with a random token; the account is only actually deleted
-- when that link is opened and confirmed. Only the token's SHA-256 hash is
-- stored (never the raw token — that only ever exists in the emailed URL),
-- and it expires after 1 hour. Service-role only: RLS is enabled with no
-- policies at all, since every read/write goes through
-- /api/delete-account/request and /api/delete-account/confirm, both of
-- which use the admin (service-role) client, never the anon/browser client.
-- ============================================================================

drop table if exists public.account_deletion_requests cascade;

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_deletion_requests_token_hash_idx
  on public.account_deletion_requests (token_hash);

create index if not exists account_deletion_requests_user_id_idx
  on public.account_deletion_requests (user_id);

alter table public.account_deletion_requests enable row level security;

-- ============================================================================
-- Chat memory — durable, cross-conversation facts/preferences extracted
-- from Ionexa Chat exchanges (see src/lib/chat/memory.ts). Same owner-only
-- RLS pattern as every table above. Entries are append/delete-only (never
-- edited), so there's no update policy. Toggled on/off via
-- user_metadata.chat_memory_enabled (defaults to on when unset) — that's a
-- user preference on auth.users itself, not a column here.
-- ============================================================================

drop table if exists public.chat_memory cascade;

create table public.chat_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_text text not null,
  source_conversation_id uuid references public.chat_conversations(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists chat_memory_user_id_created_at_idx
  on public.chat_memory (user_id, created_at desc);

alter table public.chat_memory enable row level security;

drop policy if exists "select_own_chat_memory" on public.chat_memory;
create policy "select_own_chat_memory" on public.chat_memory
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_chat_memory" on public.chat_memory;
create policy "insert_own_chat_memory" on public.chat_memory
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete_own_chat_memory" on public.chat_memory;
create policy "delete_own_chat_memory" on public.chat_memory
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- Known devices — "new sign-in" security email (see
-- src/app/api/auth/device-check/route.ts). device_fingerprint is a
-- SHA-256 hash of IP + User-Agent, computed server-side — good enough to
-- recognize "have we seen this browser/network combination before" without
-- real device fingerprinting. Same owner-only RLS pattern as every table
-- above; unlike most, it's also self-service update/delete (touching
-- last_seen, removing an entry from Settings > Login Activity).
-- ============================================================================

drop table if exists public.known_devices cascade;

create table public.known_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_fingerprint text not null,
  user_agent text,
  ip_address text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (user_id, device_fingerprint)
);

create index if not exists known_devices_user_id_idx
  on public.known_devices (user_id);

alter table public.known_devices enable row level security;

drop policy if exists "select_own_known_devices" on public.known_devices;
create policy "select_own_known_devices" on public.known_devices
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_known_devices" on public.known_devices;
create policy "insert_own_known_devices" on public.known_devices
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_known_devices" on public.known_devices;
create policy "update_own_known_devices" on public.known_devices
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_known_devices" on public.known_devices;
create policy "delete_own_known_devices" on public.known_devices
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- Rate limit log — generic per-scope attempt counter backing
-- src/lib/rate-limit.ts, used to throttle abuse-prone unauthenticated/
-- low-cost endpoints (signup by IP, checkout by user id) on a serverless
-- platform with no shared in-memory state between invocations. Service-role
-- only, same pattern as account_deletion_requests: RLS is enabled with no
-- policies at all, since every read/write goes through the admin client
-- inside checkRateLimit(), never the anon/browser client.
-- ============================================================================

drop table if exists public.rate_limit_log cascade;

create table public.rate_limit_log (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  identifier text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_log_scope_identifier_created_at_idx
  on public.rate_limit_log (scope, identifier, created_at desc);

alter table public.rate_limit_log enable row level security;

-- ============================================================================
-- Knowledge graph: links between records across different modules (e.g. an
-- Idea linked to a Product), so Ionexa Chat can see relationships without
-- the user re-explaining them every time (see src/lib/entity-links.ts,
-- src/lib/chat/entity-mentions.ts, src/components/entity-links/*).
-- source_table/target_table hold a module's table name (e.g. "ideas",
-- "products") — polymorphic by design, so no FK is possible on
-- source_id/target_id; ownership of the linked records is enforced by
-- each of those tables' own RLS at read time, not by a constraint here.
-- ============================================================================

drop table if exists public.entity_links cascade;

create table public.entity_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_table text not null,
  source_id uuid not null,
  target_table text not null,
  target_id uuid not null,
  relationship_type text not null default 'related',
  created_at timestamptz not null default now()
);

create index if not exists entity_links_user_source_idx
  on public.entity_links (user_id, source_table, source_id);

create index if not exists entity_links_user_target_idx
  on public.entity_links (user_id, target_table, target_id);

alter table public.entity_links enable row level security;

drop policy if exists "select_own_entity_links" on public.entity_links;
create policy "select_own_entity_links" on public.entity_links
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_entity_links" on public.entity_links;
create policy "insert_own_entity_links" on public.entity_links
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete_own_entity_links" on public.entity_links;
create policy "delete_own_entity_links" on public.entity_links
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- Mission Control ("AI Company" concept, v1): Planner -> Builder -> Reviewer.
-- One row per mission. plan_steps holds { steps: [{ text, status,
-- module?, moduleTitle?, href? }], review? } — an object rather than a
-- bare array so the Reviewer Agent's output has somewhere to live without
-- needing a column beyond what's defined here (see src/types/mission.ts).
-- Builder is the ALREADY-EXISTING /api/create (Create Anything), called
-- once per step by the user — nothing in this table implies autonomous
-- execution.
-- ============================================================================

drop table if exists public.ai_missions cascade;

create table public.ai_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal text not null,
  status text not null default 'planning' check (status in ('planning',
    'in_progress', 'completed', 'failed')),
  plan_steps jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_missions_user_id_created_at_idx
  on public.ai_missions (user_id, created_at desc);

alter table public.ai_missions enable row level security;

drop policy if exists "select_own_ai_missions" on public.ai_missions;
create policy "select_own_ai_missions" on public.ai_missions
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_ai_missions" on public.ai_missions;
create policy "insert_own_ai_missions" on public.ai_missions
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_ai_missions" on public.ai_missions;
create policy "update_own_ai_missions" on public.ai_missions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_ai_missions" on public.ai_missions;
create policy "delete_own_ai_missions" on public.ai_missions
  for delete using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.ai_missions;
create trigger set_updated_at before update on public.ai_missions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Website Builder — real Claude-generated single-file HTML/CSS sites (see
-- src/lib/website-builder.ts, src/app/api/websites/generate/route.ts).
-- Distinct from the existing "Websites" Build module (ai_websites table,
-- see the Build modules section above), which is a plain idea/status
-- tracker that never calls AI. Same owner-only RLS pattern as every table
-- above. html_content is a denormalized "current version" pointer, kept in
-- sync on every edit (api/websites/edit/route.ts) so existing preview/
-- download code needs no changes; the update policy below is what makes
-- that possible — full version history lives in website_versions.
-- reference_image_url: optional storage path (bucket "website-references",
-- see below) to a reference image the user uploaded at generation time —
-- Claude's vision input uses it to inform colors/style, it is NOT
-- embedded into the generated html_content itself (see lib/website-builder.ts).
-- ============================================================================

drop table if exists public.user_websites cascade;

create table public.user_websites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  html_content text not null,
  -- Background-job status (see api/websites/generate/route.ts +
  -- api/websites/generate/process/route.ts): a row is created with
  -- status 'pending' and html_content '' the instant generation is
  -- requested, so the client gets a real row/id back immediately instead
  -- of blocking on the AI call. The actual generation runs as a second,
  -- independent request (client-issued, not server-continued) that flips
  -- this to 'processing' then 'completed' (with the real html_content) or
  -- 'failed' (with error_message set). Defaults to 'completed' so it's a
  -- no-op for every row that already existed before this column did.
  status text not null default 'completed',
  error_message text,
  reference_image_url text,
  created_at timestamptz not null default now()
);

alter table public.user_websites
  drop constraint if exists user_websites_status_check;
alter table public.user_websites
  add constraint user_websites_status_check
  check (status in ('pending', 'processing', 'completed', 'failed'));

create index if not exists user_websites_user_id_created_at_idx
  on public.user_websites (user_id, created_at desc);

alter table public.user_websites enable row level security;

drop policy if exists "select_own_user_websites" on public.user_websites;
create policy "select_own_user_websites" on public.user_websites
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_websites" on public.user_websites;
create policy "insert_own_user_websites" on public.user_websites
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_user_websites" on public.user_websites;
create policy "update_own_user_websites" on public.user_websites
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_user_websites" on public.user_websites;
create policy "delete_own_user_websites" on public.user_websites
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- Website Builder version history — website_versions
-- Every generate (version 1) and every AI edit (version 2, 3, ...) appends
-- a row here, so a user can see what changed over time. user_id is
-- denormalized (not derived via a join on user_websites) to stay
-- consistent with every other table's simple auth.uid() = user_id RLS
-- policy in this schema. Append-only — no update/delete policy, since a
-- version is a permanent historical record once written.
-- ============================================================================

drop table if exists public.website_versions cascade;

create table public.website_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  website_id uuid not null references public.user_websites(id) on delete cascade,
  version_number int not null,
  html_content text not null,
  change_description text,
  created_at timestamptz not null default now()
);

create index if not exists website_versions_website_id_version_idx
  on public.website_versions (website_id, version_number desc);

alter table public.website_versions enable row level security;

drop policy if exists "select_own_website_versions" on public.website_versions;
create policy "select_own_website_versions" on public.website_versions
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_website_versions" on public.website_versions;
create policy "insert_own_website_versions" on public.website_versions
  for insert with check (auth.uid() = user_id);

-- ============================================================================
-- Website Builder reference images — Storage bucket "website-references"
-- Private bucket; files are stored under a `${auth.uid()}/...` path prefix,
-- which is what the RLS policies below check (storage.foldername(name))[1]
-- against — the standard per-user-folder Supabase Storage pattern, same
-- ownership model as every table above, just expressed on storage.objects
-- instead of a public.* table. Read server-side (service role) when
-- generating so the reference image can be sent to Claude's vision input;
-- never made public.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('website-references', 'website-references', false)
on conflict (id) do nothing;

drop policy if exists "select_own_website_references" on storage.objects;
create policy "select_own_website_references" on storage.objects
  for select using (
    bucket_id = 'website-references' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "insert_own_website_references" on storage.objects;
create policy "insert_own_website_references" on storage.objects
  for insert with check (
    bucket_id = 'website-references' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "delete_own_website_references" on storage.objects;
create policy "delete_own_website_references" on storage.objects
  for delete using (
    bucket_id = 'website-references' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- Website Builder reference images — website_reference_images
-- Up to MAX_REFERENCE_IMAGES (5, see src/lib/website-builder.ts) rows per
-- website — a logo, product photos, a style-reference screenshot, etc.,
-- all sent together to Claude's vision input at generation time. Replaces
-- user_websites.reference_image_url (a single-path column from an earlier
-- pass) as the source of truth going forward — that column is left in
-- place, unused, rather than dropped, since dropping a column is
-- destructive and not needed to ship this. user_id is denormalized here
-- (not derived via a join on user_websites) for the same reason as
-- website_versions: staying consistent with this schema's simple
-- auth.uid() = user_id RLS pattern everywhere else. image_url stores the
-- Storage path (bucket "website-references" above), not a public URL.
-- Append/delete-only — no update policy, since a reference image is
-- swapped by removing and re-adding, not edited in place.
-- ============================================================================

drop table if exists public.website_reference_images cascade;

create table public.website_reference_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  website_id uuid not null references public.user_websites(id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists website_reference_images_website_id_idx
  on public.website_reference_images (website_id);

alter table public.website_reference_images enable row level security;

drop policy if exists "select_own_website_reference_images" on public.website_reference_images;
create policy "select_own_website_reference_images" on public.website_reference_images
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_website_reference_images" on public.website_reference_images;
create policy "insert_own_website_reference_images" on public.website_reference_images
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete_own_website_reference_images" on public.website_reference_images;
create policy "delete_own_website_reference_images" on public.website_reference_images
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- Energy check-ins — "AI Life Context" (see src/lib/user-context.ts) needs
-- a "recent energy check-in" input; this is the small, real feature that
-- creates one (src/components/overview/energy-checkin-widget.tsx). Same
-- owner-only RLS pattern as every table above; append-only log, no
-- update/delete UI exists for it.
-- ============================================================================

drop table if exists public.user_energy_checkins cascade;

create table public.user_energy_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  energy_level smallint not null check (energy_level between 1 and 5),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists user_energy_checkins_user_id_created_at_idx
  on public.user_energy_checkins (user_id, created_at desc);

alter table public.user_energy_checkins enable row level security;

drop policy if exists "select_own_user_energy_checkins" on public.user_energy_checkins;
create policy "select_own_user_energy_checkins" on public.user_energy_checkins
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_energy_checkins" on public.user_energy_checkins;
create policy "insert_own_user_energy_checkins" on public.user_energy_checkins
  for insert with check (auth.uid() = user_id);

-- ============================================================================
-- Gamification — real, earned achievements (see src/lib/achievements.ts,
-- src/lib/achievement-metadata.ts). Reconciled opportunistically from
-- dashboard/layout.tsx on every navigation (no cron/background worker in
-- this app). The unique constraint is what makes the unlock upsert's
-- ignoreDuplicates safe against re-earning the same achievement twice.
-- Same owner-only RLS pattern as every table above; permanent once
-- unlocked, so only select/insert policies exist.
-- ============================================================================

drop table if exists public.user_achievements cascade;

create table public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_key)
);

create index if not exists user_achievements_user_id_idx
  on public.user_achievements (user_id);

alter table public.user_achievements enable row level security;

drop policy if exists "select_own_user_achievements" on public.user_achievements;
create policy "select_own_user_achievements" on public.user_achievements
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_achievements" on public.user_achievements;
create policy "insert_own_user_achievements" on public.user_achievements
  for insert with check (auth.uid() = user_id);

-- ============================================================================
-- Scheduled Agent Runs — "Schedule for tomorrow" on a Mission Control step
-- (see components/mission/mission-card.tsx). A controlled, explicit-
-- approval-only precursor to full autonomous agents (deliberately NOT
-- that): the user always picks exactly what runs, just delayed by one day
-- and executed by a daily cron job (api/cron/scheduled-runs/route.ts)
-- instead of live in the browser. step_index/step_text are denormalized
-- copies — Mission Control's steps live inside ai_missions.plan_steps
-- (jsonb), not as separate rows, so without them the cron job would have
-- no way to know which step to write the result back to, or what to
-- actually build. Same owner-only RLS pattern as every table above, except
-- there is no update policy for regular users — only the cron job's
-- service-role (admin) client is ever meant to change status/result/
-- executed_at, matching account_deletion_requests' "no anon-client writes
-- beyond insert" convention elsewhere in this schema.
-- ============================================================================

drop table if exists public.scheduled_agent_runs cascade;

create table public.scheduled_agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id uuid not null references public.ai_missions(id) on delete cascade,
  step_index int not null,
  step_text text not null,
  agent_role text not null default 'general' check (agent_role in ('general', 'marketing', 'finance', 'research')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  result text,
  scheduled_for date not null,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists scheduled_agent_runs_user_id_scheduled_for_idx
  on public.scheduled_agent_runs (user_id, scheduled_for);

create index if not exists scheduled_agent_runs_status_scheduled_for_idx
  on public.scheduled_agent_runs (status, scheduled_for);

alter table public.scheduled_agent_runs enable row level security;

drop policy if exists "select_own_scheduled_agent_runs" on public.scheduled_agent_runs;
create policy "select_own_scheduled_agent_runs" on public.scheduled_agent_runs
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_scheduled_agent_runs" on public.scheduled_agent_runs;
create policy "insert_own_scheduled_agent_runs" on public.scheduled_agent_runs
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete_own_scheduled_agent_runs" on public.scheduled_agent_runs;
create policy "delete_own_scheduled_agent_runs" on public.scheduled_agent_runs
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- Real Automations — "Make this real" on an Automation module idea (see
-- components/automation/automation-realize-panel.tsx), built on top of
-- Scheduled Agent Runs' infrastructure: the SAME daily cron
-- (api/cron/scheduled-runs/route.ts) that executes scheduled mission steps
-- also processes due rows here. Unlike a scheduled_agent_runs row (a
-- single one-off action), a user_automations row repeats indefinitely on
-- its own frequency until the user turns it off — next_run_at is
-- recomputed after every execution instead of the row being consumed.
-- Same owner-only RLS pattern as every table above; is_active/next_run_at
-- ARE user-updatable (the toggle switch, see automation-active-list.tsx)
-- unlike scheduled_agent_runs, since there's no execution result to
-- protect from being tampered with mid-flight the way status/result are.
-- ============================================================================

drop table if exists public.user_automations cascade;

create table public.user_automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  -- Only one of these is meaningful, depending on frequency: day_of_week
  -- (0=Sunday..6=Saturday) for 'weekly', day_of_month (1-28, capped so it
  -- exists in every month) for 'monthly'. Both null for 'daily'.
  day_of_week smallint check (day_of_week between 0 and 6),
  day_of_month smallint check (day_of_month between 1 and 28),
  is_active boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists user_automations_user_id_idx
  on public.user_automations (user_id);

create index if not exists user_automations_active_next_run_idx
  on public.user_automations (is_active, next_run_at);

alter table public.user_automations enable row level security;

drop policy if exists "select_own_user_automations" on public.user_automations;
create policy "select_own_user_automations" on public.user_automations
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_automations" on public.user_automations;
create policy "insert_own_user_automations" on public.user_automations
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_user_automations" on public.user_automations;
create policy "update_own_user_automations" on public.user_automations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_user_automations" on public.user_automations;
create policy "delete_own_user_automations" on public.user_automations
  for delete using (auth.uid() = user_id);
