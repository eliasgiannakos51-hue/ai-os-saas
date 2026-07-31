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
