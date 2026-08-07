-- ============================================================================
-- IONEXA AI — FULL PROJECT DATABASE SCHEMA (CONSOLIDATED BACKUP)
-- Generated: 2026-08-03
--
-- WHAT THIS FILE IS
-- Every table, column, index, RLS policy, trigger, function, and storage
-- bucket/policy this project has ever shipped, from the original 13-module
-- MVP schema through every V2 feature built since (Knowledge Graph,
-- Mission Control / AI Company, Website Builder + reference images +
-- reliability hardening, Gamification, Scheduled Agent Runs, Real
-- Automations, the AI cost circuit breaker, and the credits system) — in
-- one file, in the order features were actually built, each section
-- carrying the same explanatory comments as the source files it was
-- assembled from. This is a documentation/backup artifact, not a new
-- migration path: it is the union of every *.sql file in the repo root as
-- of this date, not a replacement for any of them.
--
-- HOW TO USE THIS FILE
-- Every statement in this file is idempotent (create table IF NOT EXISTS,
-- add column IF NOT EXISTS, drop-policy-then-create, drop-constraint-then-
-- add) EXCEPT the unconditional "create table" statements inherited
-- verbatim from the original supabase_schema.sql for the tables that were
-- always meant to be fully re-created on every run of that file (the 12
-- non-"ideas" original modules, chat_conversations/messages, team_members,
-- the Build-module tables, ai_coding_requests and friends,
-- account_deletion_requests, chat_memory, known_devices, rate_limit_log,
-- entity_links, ai_missions, user_websites, website_versions,
-- website_reference_images, user_energy_checkins, user_achievements,
-- scheduled_agent_runs, user_automations) — each of those is preceded by
-- its own "drop table if exists ... cascade", exactly as in the original
-- files. That was a safe, deliberate design choice on a project with no
-- production data yet (see the original file's own header comment); on a
-- project that now holds real user data, do NOT run this file wholesale
-- against production without first confirming you're fine with those
-- specific tables being dropped and recreated empty. If you only need the
-- tables you don't already have, run the individual dedicated migration
-- file for that feature instead (listed below) — every one of those is
-- purely additive (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) with no drops
-- at all.
--
-- SOURCE FILES THIS WAS ASSEMBLED FROM (all still present in the repo
-- root, none deleted by creating this file):
--   1. supabase_schema.sql              — base schema, kept continuously
--                                          up to date; this file's backbone
--   2. supabase_credits_schema.sql      — credits system (folded in below,
--                                          previously never merged into
--                                          supabase_schema.sql itself)
--   3. supabase_v2_consolidated.sql     — an earlier partial consolidation
--                                          (Knowledge Graph through Real
--                                          Automations) — fully superseded
--                                          by this file, kept for history
--   4. website_status_migration.sql     — Website Builder background-job
--                                          status/error_message columns
--   5. website_reference_images_migration.sql — multi reference images
--   6. website_reliability_migration.sql — attempt_count +
--                                          has_reference_images columns
--   7. scheduled_agent_runs_migration.sql
--   8. user_automations_migration.sql
--   9. daily_ai_spend_tracking_migration.sql — AI cost circuit breaker
--
-- FEATURES WITH NO SCHEMA — CONFIRMED NEVER BUILT, NOT AN OMISSION
-- Two features do not appear anywhere in this file because no code for
-- them exists anywhere in the app (confirmed by a full-repo search, not
-- assumed): a "Daily Briefing" cron/widget, and a real Marketplace
-- publish/listing flow (the Marketplace page is an intentional, honest
-- empty state with a disabled "Coming Soon" button — see
-- src/app/dashboard/marketplace/page.tsx — not a broken feature that
-- regressed). If either of these gets built for real, its migration
-- belongs in a new section appended to this file.
-- ============================================================================

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
-- Platform-wide daily AI spend tracking — one row per UTC calendar date,
-- incremented on every single Claude API call across the whole app (see
-- lib/ai-circuit-breaker.ts's recordAiCallForDailySpend, called from every
-- AI-calling route after a call is allowed to proceed). Backs the
-- MAX_DAILY_AI_CALLS platform-wide circuit breaker: once total_calls for
-- today reaches that env var's value, every new AI call anywhere in the
-- app is rejected with a clear message until the date rolls over.
-- estimated_cost is tracked alongside call count purely for visibility
-- (not itself gated on) — a rough running total in credits.
-- Same "no owner, admin-client-only" access pattern as rate_limit_log:
-- RLS enabled, no policies, so only the service-role client can read or
-- write it — there is no legitimate reason for any single user's session
-- to see or touch the platform-wide total.
-- ============================================================================

create table if not exists public.daily_ai_spend_tracking (
  date date primary key,
  total_calls integer not null default 0,
  estimated_cost numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.daily_ai_spend_tracking enable row level security;

-- ============================================================================
-- Credits system — user_credits (current balance) + credit_transactions
-- (append-only ledger). Originally shipped as a standalone file,
-- supabase_credits_schema.sql (run once, after the base schema, on the
-- same project) — folded into this consolidated file verbatim so this one
-- file is a complete backup. That standalone file still exists in the repo
-- and is safe to keep running on its own; every statement below is
-- idempotent, so running it here or there (or both) is a no-op on a
-- project that already has it.
--
-- user_credits: one row per user, the current balance. credits_remaining
-- decreases as actions are taken (see api/create, api/chat,
-- api/modules/create) and is reset to credits_total on plan
-- renewal/upgrade or by the monthly cron reset (api/cron/reset-credits).
--
-- credit_transactions: append-only ledger — every grant (signup, purchase,
-- plan renewal) and every debit (an AI action) gets a row here. Never
-- updated or deleted.
--
-- Both tables are writable ONLY via the service-role key (see
-- lib/supabase/admin.ts) — RLS below intentionally grants authenticated
-- users SELECT on their own rows only, no INSERT/UPDATE/DELETE. Every
-- credit mutation happens server-side, inside an API route that has
-- already verified the action it's charging for, so the client can never
-- award or spend its own credits directly.
-- ============================================================================

create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits_remaining integer not null default 0,
  credits_total integer not null default 0,
  plan_tier text not null default 'free',
  updated_at timestamptz not null default now()
);

-- beta_expires_at: set only for accounts that signed up with a valid beta
-- invite code (see api/signup/route.ts, lib/beta.ts) — 30 days out from
-- signup. null for everyone else. Ultimate-tier access granted by a beta
-- code is only actually in effect while this is still in the future
-- (resolveEffectivePlanSlug / hasActiveBetaBypass in
-- lib/billing/credits.ts and lib/beta.ts); once it passes, those accounts
-- fall back to Free automatically, with no manual/cron step required.
alter table public.user_credits add column if not exists beta_expires_at timestamptz;

-- The cheapest euro-per-credit rate this account has ever bought a ONE-TIME
-- CREDIT PACK at, or null if it never bought one. Packs are sold in bulk
-- below the €0.02 list price (€100 / 8,000 credits = €0.0125 each), so
-- charging an action at the list price would silently drop the margin
-- multiplier from 4.00x to 2.50x for anyone holding pack credits.
-- Settlement divides by min(list price, plan rate, this) — see
-- effectiveCreditPriceEurForAccount in lib/billing/credit-formula.ts.
-- Written by recordPackPurchaseRate (lib/billing/credits.ts) from the
-- Stripe webhook's pack grant, kept as a running MINIMUM because credits
-- are fungible once granted: a later small pack must not erase the cheap
-- credits an earlier big pack already put in the balance.
alter table public.user_credits
  add column if not exists min_pack_credit_price_eur numeric(12, 8);

alter table public.user_credits enable row level security;

drop policy if exists "select_own_user_credits" on public.user_credits;
create policy "select_own_user_credits" on public.user_credits
  for select using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.user_credits;
create trigger set_updated_at before update on public.user_credits
  for each row execute function public.set_updated_at();

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null, -- negative = debit (an action), positive = credit (grant/purchase)
  action_type text not null, -- e.g. 'chat_message', 'create_anything', 'agent_create',
                              -- 'website_create', 'app_create', 'automation_create',
                              -- 'signup_grant', 'plan_renewal', 'purchase', 'admin_adjustment'
  description text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists credit_transactions_user_id_created_at_idx
  on public.credit_transactions (user_id, created_at desc);

alter table public.credit_transactions enable row level security;

drop policy if exists "select_own_credit_transactions" on public.credit_transactions;
create policy "select_own_credit_transactions" on public.credit_transactions
  for select using (auth.uid() = user_id);


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
  -- Hard circuit-breaker backstop against ANY scenario (client bug,
  -- double-submit race, retried keepalive request) that could cause
  -- api/websites/generate/process to run more than once for the same
  -- row — incremented at the start of every processing attempt; once it
  -- would exceed MAX_GENERATION_ATTEMPTS the route refuses to call the
  -- AI at all and forces status='failed' immediately. Defaults to 0 so
  -- it's a no-op for every row that already existed before this column
  -- did.
  attempt_count integer not null default 0,
  -- Set once at creation (api/websites/generate/route.ts) from whether
  -- this generation actually has reference images attached — vision
  -- input measurably slows down generation, so a job with images gets a
  -- longer stale-job grace period (see lib/website-generation-limits.ts)
  -- before api/websites/status force-fails it as dead. Defaults to false
  -- so it's a no-op for every row that already existed before this
  -- column did.
  has_reference_images boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.user_websites
  drop constraint if exists user_websites_status_check;
alter table public.user_websites
  add constraint user_websites_status_check
  check (status in ('pending', 'processing', 'completed', 'failed'));

alter table public.user_websites
  add column if not exists has_reference_images boolean not null default false;

alter table public.user_websites
  add column if not exists attempt_count integer not null default 0;

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
--
-- PUBLIC READ, owner-only write. Files are stored under a `${auth.uid()}/...`
-- path prefix, which is what the write policies below check
-- (storage.foldername(name))[1] against.
--
-- WHY PUBLIC: the whole point of a reference image is that the generated
-- website EMBEDS it — lib/website-reference-image-server.ts resolves each
-- upload with getPublicUrl() and hands that URL to Claude, which writes it
-- into an <img src>. getPublicUrl() happily builds a /object/public/ URL
-- for a private bucket too, but that URL answers 400, so every generated
-- site rendered broken images while the HTML looked correct. That is the
-- "my uploaded images don't appear" bug, and no prompt change could fix
-- it: the model was doing exactly what it was told.
--
-- Signed URLs are not an option here: the user downloads the generated
-- HTML and hosts it wherever they like, so any expiry turns their live
-- site's images into 400s later. A public read is what "put this photo on
-- my website" actually means.
--
-- The exposure is bounded: paths are `<uuid>/<random>`, not enumerable
-- (listing still requires the select policy below), and writes/deletes
-- remain owner-only.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('website-references', 'website-references', true)
on conflict (id) do update set public = true;

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

-- ============================================================================
-- Documents module — freeform Notion-lite notes/documents. Not an AI-
-- generated artifact (no credit cost, no AI call, unlike the "Build"
-- modules below), so it's its own table rather than living in
-- ai_documents (the old Build-module placeholder at this same
-- /dashboard/documents route, replaced by this — ai_documents itself is
-- left in place, unused, rather than dropped, since dropping it isn't
-- needed to ship this and a DROP TABLE is not something to do lightly).
-- content is jsonb ({ html: string } today, from the contentEditable
-- editor) so the shape can grow later without another migration.
-- ============================================================================

create table public.user_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled',
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_documents_user_id_updated_at_idx
  on public.user_documents (user_id, updated_at desc);

alter table public.user_documents enable row level security;

drop policy if exists "select_own_user_documents" on public.user_documents;
create policy "select_own_user_documents" on public.user_documents
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_documents" on public.user_documents;
create policy "insert_own_user_documents" on public.user_documents
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_user_documents" on public.user_documents;
create policy "update_own_user_documents" on public.user_documents
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_user_documents" on public.user_documents;
create policy "delete_own_user_documents" on public.user_documents
  for delete using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.user_documents;
create trigger set_updated_at before update on public.user_documents
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Email notification preferences + daily send cap
-- (settings/email-notification-settings.tsx, lib/email/email-gate.ts)
-- ============================================================================

-- One row per user, created lazily the first time they toggle anything in
-- Settings. NO row means "all defaults on" — the gate treats a missing row
-- and an all-true row identically, so nothing has to backfill this for
-- existing accounts.
--
-- Only the OPTIONAL email types get a column. Account-lifecycle and
-- security-confirmation mail (welcome, delete-account confirmation, team
-- invites addressed to a third party) is deliberately not switchable, and
-- lib/email/email-gate.ts enforces that server-side regardless of what is
-- stored here.
create table if not exists public.user_email_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  new_device_login boolean not null default true,
  weekly_digest boolean not null default true,
  scheduled_run_complete boolean not null default true,
  stuck_generation boolean not null default true,
  website_form_submission boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_email_preferences enable row level security;

drop policy if exists "select_own_user_email_preferences" on public.user_email_preferences;
create policy "select_own_user_email_preferences" on public.user_email_preferences
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_email_preferences" on public.user_email_preferences;
create policy "insert_own_user_email_preferences" on public.user_email_preferences
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_user_email_preferences" on public.user_email_preferences;
create policy "update_own_user_email_preferences" on public.user_email_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.user_email_preferences;
create trigger set_updated_at before update on public.user_email_preferences
  for each row execute function public.set_updated_at();

-- Append-only record of every email actually handed to Resend. Read by
-- checkEmailAllowed to count a user's sends in the trailing 24h and stop
-- at MAX_EMAILS_PER_DAY (20) — a rolling window rather than "since local
-- midnight", because this app's users span many timezones and there is no
-- single correct reset hour.
create table if not exists public.email_send_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email_type text not null,
  sent_at timestamptz not null default now()
);

-- The exact shape of the cap query: filter by user_id, range-scan sent_at.
create index if not exists email_send_log_user_id_sent_at_idx
  on public.email_send_log (user_id, sent_at desc);

alter table public.email_send_log enable row level security;

-- Read-only to the owner (so "what did you send me?" is answerable from
-- the client). There is deliberately NO insert/update/delete policy: only
-- the service-role client writes here, and service role bypasses RLS. A
-- user who could insert rows here could also silence their own cap, and a
-- user who could delete them could bypass it entirely.
drop policy if exists "select_own_email_send_log" on public.email_send_log;
create policy "select_own_email_send_log" on public.email_send_log
  for select using (auth.uid() = user_id);

-- ============================================================================
-- Margin-guaranteed credit billing: cost log + reservations + atomic RPCs
-- (lib/billing/pricing-config.ts, credit-formula.ts, reservations.ts)
-- ============================================================================

-- Every billable AI action, with the REAL measured cost of every sub-call
-- that made it up — not just the main generation call. This is what makes
-- the margin claim checkable against reality instead of assumed.
create table if not exists public.ai_cost_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,

  -- Measured usage, summed across every sub-call of the action.
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  web_searches integer not null default 0,
  ai_calls integer not null default 0,

  -- numeric, never float: these are money. Binary floating point cannot
  -- represent most decimal fractions exactly, and summing thousands of
  -- rows of drifting values to report margin would compound the error.
  -- 18,8 comfortably holds sub-cent per-action costs.
  real_cost_usd numeric(18, 8) not null default 0,
  real_cost_eur numeric(18, 8) not null default 0,

  credits_charged integer not null default 0,

  -- The multiplier CONFIGURED at the time of the action, and the margin
  -- ACTUALLY achieved. Storing both means a later change to
  -- CREDIT_MARGIN_MULTIPLIER never rewrites history, and the two can be
  -- compared to catch a feature whose real margin drifts from target.
  margin_multiplier numeric(6, 2),
  achieved_margin numeric(12, 4),

  -- Per-stage USD, so an expensive action can be traced to the sub-call
  -- responsible (generation vs security review vs retries).
  stage_breakdown jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

-- The margin report groups by feature over a trailing window; this index
-- matches that access pattern exactly.
create index if not exists ai_cost_log_feature_created_at_idx
  on public.ai_cost_log (feature, created_at desc);
create index if not exists ai_cost_log_user_id_created_at_idx
  on public.ai_cost_log (user_id, created_at desc);

alter table public.ai_cost_log enable row level security;

-- Read-only to the owner. No insert/update/delete policy at all: only the
-- service-role client writes here, and a user who could edit their own
-- cost rows could rewrite the billing record.
drop policy if exists "select_own_ai_cost_log" on public.ai_cost_log;
create policy "select_own_ai_cost_log" on public.ai_cost_log
  for select using (auth.uid() = user_id);


-- Credits held for an action that is currently running. A row exists only
-- between reserve and settle.
create table if not exists public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  credits integer not null check (credits > 0),
  status text not null default 'active' check (status in ('active', 'settled', 'released', 'expired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz
);

-- Partial index: the hot query is "sum active holds for this user", and
-- settled/released rows are dead weight in it.
create index if not exists credit_reservations_active_idx
  on public.credit_reservations (user_id) where status = 'active';
create index if not exists credit_reservations_expiry_idx
  on public.credit_reservations (expires_at) where status = 'active';

alter table public.credit_reservations enable row level security;

drop policy if exists "select_own_credit_reservations" on public.credit_reservations;
create policy "select_own_credit_reservations" on public.credit_reservations
  for select using (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- reserve_credits: atomically check available balance and place a hold.
--
-- "Available" is credits_remaining MINUS everything already held. Doing
-- that check in application code and inserting afterwards leaves a window
-- where two concurrent actions both see the full balance and both pass.
-- The row lock below closes it: the second call blocks until the first
-- has committed its reservation, then re-reads and sees the reduced
-- availability.
-- ----------------------------------------------------------------------------
create or replace function public.reserve_credits(
  p_user_id uuid,
  p_credits integer,
  p_action text,
  p_expires_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns table (reservation_id uuid, available integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
  v_held integer;
  v_available integer;
  v_id uuid;
begin
  -- FOR UPDATE serialises concurrent reservations for this one user.
  select credits_remaining into v_remaining
    from public.user_credits
    where user_id = p_user_id
    for update;

  if v_remaining is null then
    return query select null::uuid, 0;
    return;
  end if;

  -- Expired holds are treated as already gone, so an abandoned action
  -- can't lock a user out until the sweeper next runs.
  select coalesce(sum(credits), 0) into v_held
    from public.credit_reservations
    where user_id = p_user_id and status = 'active' and expires_at > now();

  v_available := v_remaining - v_held;

  if v_available < p_credits then
    return query select null::uuid, v_available;
    return;
  end if;

  insert into public.credit_reservations (user_id, action, credits, expires_at, metadata)
    values (p_user_id, p_action, p_credits, p_expires_at, p_metadata)
    returning id into v_id;

  return query select v_id, v_available;
end;
$$;


-- ----------------------------------------------------------------------------
-- settle_reservation: charge the real cost, release the hold, log it.
--
-- All three happen in one function so they share a transaction — a
-- partial failure that charged without releasing would silently double
-- count against the user's balance.
-- ----------------------------------------------------------------------------
create or replace function public.settle_reservation(
  p_user_id uuid,
  p_reservation_id uuid,
  p_credits_to_charge integer,
  p_feature text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cache_write_tokens integer,
  p_cache_read_tokens integer,
  p_web_searches integer,
  p_ai_calls integer,
  p_real_cost_usd numeric,
  p_real_cost_eur numeric,
  p_margin_multiplier numeric,
  p_achieved_margin numeric,
  p_stage_breakdown jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reservation_id is not null then
    update public.credit_reservations
      set status = 'settled', resolved_at = now()
      where id = p_reservation_id and user_id = p_user_id and status = 'active';
  end if;

  if p_credits_to_charge > 0 then
    -- greatest(...,0) so a settlement can never drive the balance
    -- negative, even if a reservation expired mid-action and was swept
    -- before this ran.
    update public.user_credits
      set credits_remaining = greatest(credits_remaining - p_credits_to_charge, 0),
          updated_at = now()
      where user_id = p_user_id;

    insert into public.credit_transactions (user_id, amount, action_type, description)
      values (p_user_id, -p_credits_to_charge, p_feature, 'AI usage (settled at real cost)');
  end if;

  insert into public.ai_cost_log (
    user_id, feature, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens,
    web_searches, ai_calls, real_cost_usd, real_cost_eur, credits_charged,
    margin_multiplier, achieved_margin, stage_breakdown, metadata
  ) values (
    p_user_id, p_feature, p_input_tokens, p_output_tokens, p_cache_write_tokens,
    p_cache_read_tokens, p_web_searches, p_ai_calls, p_real_cost_usd, p_real_cost_eur,
    p_credits_to_charge, p_margin_multiplier, p_achieved_margin, p_stage_breakdown, p_metadata
  );
end;
$$;


-- Release a hold for an action that failed before costing anything.
create or replace function public.release_reservation(p_user_id uuid, p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.credit_reservations
    set status = 'released', resolved_at = now()
    where id = p_reservation_id and user_id = p_user_id and status = 'active';
end;
$$;


-- Sweeper for holds whose action died mid-flight. Called by the daily cron.
create or replace function public.release_expired_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.credit_reservations
    set status = 'expired', resolved_at = now()
    where status = 'active' and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- These run as service-role only (called from lib/billing/reservations.ts
-- with the admin client). Revoking the default PUBLIC execute grant stops
-- a logged-in user from calling them directly with the anon key and
-- settling their own reservation for zero.
revoke all on function public.reserve_credits(uuid, integer, text, timestamptz, jsonb) from public;
revoke all on function public.settle_reservation(uuid, uuid, integer, text, integer, integer, integer, integer, integer, integer, numeric, numeric, numeric, numeric, jsonb, jsonb) from public;
revoke all on function public.release_reservation(uuid, uuid) from public;
revoke all on function public.release_expired_reservations() from public;
grant execute on function public.reserve_credits(uuid, integer, text, timestamptz, jsonb) to service_role;
grant execute on function public.settle_reservation(uuid, uuid, integer, text, integer, integer, integer, integer, integer, integer, numeric, numeric, numeric, numeric, jsonb, jsonb) to service_role;
grant execute on function public.release_reservation(uuid, uuid) to service_role;
grant execute on function public.release_expired_reservations() to service_role;

-- ============================================================================
-- COVERAGE CHECKLIST — every table in this file, grouped by feature/date,
-- so this doubles as a manifest. Cross-checked against every table name
-- referenced anywhere in src/ via Supabase's .from("...") calls — nothing
-- found in the codebase is missing from this list.
--
-- Original MVP (13 modules):
--   ideas, competitors, research, finance_entries, learning_entries,
--   trades, decisions, products, content, leads, feedback, metrics,
--   automations, create_requests
-- Ionexa Chat:
--   chat_conversations, chat_messages, chat_memory
-- Team / billing:
--   team_members, user_credits, credit_transactions
-- "Build" modules (idea/status trackers, no AI generation):
--   ai_agents, ai_websites, ai_apps, ai_images, ai_videos,
--   ai_coding_requests, ai_data_analysis_requests, ai_documents,
--   ai_presentations, ai_campaigns
-- Account security / infra:
--   account_deletion_requests, known_devices, rate_limit_log,
--   daily_ai_spend_tracking
-- V2 — Knowledge Graph:
--   entity_links
-- V2 — Mission Control / AI Company:
--   ai_missions
-- V2 — Website Builder:
--   user_websites (+ status/error_message, attempt_count,
--   has_reference_images columns), website_versions,
--   website_reference_images, storage bucket "website-references"
-- V2 — AI Life Context:
--   user_energy_checkins
-- V2 — Gamification:
--   user_achievements
-- V2 — Scheduled Agent Runs / Real Automations:
--   scheduled_agent_runs, user_automations
-- Documents module (Notion-lite notes, replaces the old ai_documents
-- Build-module placeholder at the same /dashboard/documents route —
-- ai_documents itself still exists in the DB, just unreferenced now):
--   user_documents
-- Email notification preferences + per-user daily send cap:
--   user_email_preferences, email_send_log
-- Margin-guaranteed credit billing:
--   ai_cost_log, credit_reservations
--   (+ RPCs reserve_credits, settle_reservation, release_reservation,
--      release_expired_reservations)
--
-- Tables that are intentionally NOT here because they were never built:
--   any "daily_briefings" table, any "marketplace_listings" table.
-- ============================================================================

-- ============================================================================
-- V3 — Task 1: Autonomous AI Agents.
--
-- Applied from v3_autonomous_agents_migration.sql, mirrored here so this
-- file stays the single readable picture of the whole schema (and so the
-- RLS coverage check in scripts/tests/security-posture.test.mjs, which
-- reads THIS file, can see the new tables).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- user_agents — one row per agent the user owns.
-- ----------------------------------------------------------------------------
create table if not exists public.user_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Shown on the card. Written by the AI builder from the user's sentence,
  -- editable afterwards.
  name text not null,
  description text,

  -- The task the agent performs on every run, in natural language. This is
  -- DATA, never instructions: lib/agents/agent-runner.ts wraps it in a
  -- delimited block and the system prompt states explicitly that nothing
  -- inside it can change the agent's rules. See the prompt-injection notes
  -- in lib/agents/agent-config.ts.
  prompt text not null,

  -- Standard 5-field cron (minute hour day-of-month month day-of-week),
  -- interpreted in `timezone` — NOT in UTC. Validated by
  -- lib/agents/cron-expression.ts before it ever reaches this table, which
  -- also enforces the "at most one run per hour" rule (the minute field
  -- must resolve to exactly one value).
  schedule_cron text not null,
  -- IANA zone id ("Europe/Athens"). The existing cron
  -- (api/cron/scheduled-runs) has a documented UTC-only limitation; this
  -- feature does not inherit it, because "every morning" has to mean the
  -- user's morning or the agent is useless to them.
  timezone text not null default 'UTC',

  -- Only 'email' today. Telegram/Slack/Discord are a later part; the CHECK
  -- is what makes adding one a deliberate migration rather than a typo that
  -- silently stores a delivery method nothing can honour.
  delivery_method text not null default 'email'
    check (delivery_method in ('email')),
  -- Where the result goes. Constrained in application code to the account's
  -- OWN verified email address — see the anti-abuse note in
  -- lib/agents/agent-config.ts. Stored rather than derived so a future
  -- multi-target delivery does not need a schema change.
  delivery_target text not null,

  --   active   — runs on schedule
  --   paused   — the user turned it off, or they ran out of credits
  --   disabled — 5 consecutive failures; needs the user to re-enable it
  status text not null default 'active'
    check (status in ('active', 'paused', 'disabled')),

  -- Builder output that is not a first-class column: whether the task needs
  -- a web search, the output format, the language to answer in. jsonb
  -- rather than columns because this is the part that will grow.
  config jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_run_at timestamptz,
  -- Null means "never scheduled" (paused/disabled). The cron selects on
  -- next_run_at <= now(), so a null can never be picked up by accident.
  next_run_at timestamptz,

  -- Reset to 0 by any successful run. At AGENT_MAX_CONSECUTIVE_FAILURES
  -- (5) the agent is auto-disabled and the owner is emailed.
  consecutive_failures int not null default 0,

  -- Atomic claim against two overlapping cron invocations both executing
  -- the same due agent — same mechanism as user_automations.
  processing_started_at timestamptz
);

-- The cron's own query: status + next_run_at, nothing else.
create index if not exists user_agents_status_next_run_at_idx
  on public.user_agents (status, next_run_at);

-- The dashboard's query.
create index if not exists user_agents_user_id_created_at_idx
  on public.user_agents (user_id, created_at desc);

-- The per-plan fair-use count ("how many agents does this user have").
create index if not exists user_agents_user_id_status_idx
  on public.user_agents (user_id, status);

alter table public.user_agents enable row level security;

drop policy if exists "select_own_user_agents" on public.user_agents;
create policy "select_own_user_agents" on public.user_agents
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_agents" on public.user_agents;
create policy "insert_own_user_agents" on public.user_agents
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_user_agents" on public.user_agents;
create policy "update_own_user_agents" on public.user_agents
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_user_agents" on public.user_agents;
create policy "delete_own_user_agents" on public.user_agents
  for delete using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.user_agents;
create trigger set_updated_at before update on public.user_agents
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- agent_runs — the execution history. One row per attempt, including the
-- ones that failed, so "why did I stop getting my email" is answerable.
-- ----------------------------------------------------------------------------
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.user_agents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'success', 'failed')),

  -- What the agent produced, verbatim — the same text that was emailed.
  output text,
  -- User-facing failure reason. Never a stack trace, never a provider
  -- error body: those go to lib/log-error.ts, not to a row the user reads.
  error text,

  -- Written at settlement, from the SettlementResult — not estimated.
  credits_charged int not null default 0,
  tokens_used int not null default 0,

  trigger_source text not null default 'schedule'
    check (trigger_source in ('schedule', 'manual')),
  -- 1 on the first try, 2 or 3 after a retry (AGENT_MAX_ATTEMPTS = 3, i.e.
  -- the initial attempt plus the two retries the brief asks for).
  attempts int not null default 1
);

create index if not exists agent_runs_user_id_started_at_idx
  on public.agent_runs (user_id, started_at desc);

create index if not exists agent_runs_agent_id_started_at_idx
  on public.agent_runs (agent_id, started_at desc);

-- The per-user hourly execution cap counts rows in this table.
create index if not exists agent_runs_user_id_started_at_status_idx
  on public.agent_runs (user_id, started_at desc, status);

alter table public.agent_runs enable row level security;

-- Read-only to the owner. There is deliberately NO insert/update/delete
-- policy: only the service-role client writes here (the cron and the
-- "Run now" route both use createAdminClient), and service role bypasses
-- RLS. A user who could insert rows here could fabricate a run history;
-- one who could delete them could hide a run they were charged for.
drop policy if exists "select_own_agent_runs" on public.agent_runs;
create policy "select_own_agent_runs" on public.agent_runs
  for select using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Email preference for agent results.
--
-- 'agent_run_result' is an OPTIONAL email type (lib/email/email-types.ts),
-- so it needs its own column here or checkEmailAllowed's
-- `select(OPTIONAL_EMAIL_TYPES.join(","))` fails for every user.
--
-- 'agent_disabled' is deliberately NOT here: it is critical mail. An agent
-- that has switched itself off after five failures is a state change the
-- owner has to know about to fix, and suppressing it because a busy day
-- hit the 20-email cap would leave them silently without the thing they
-- built the agent for.
-- ----------------------------------------------------------------------------
alter table public.user_email_preferences
  add column if not exists agent_run_result boolean not null default true;

-- V3 — Autonomous Agents:
--   user_agents, agent_runs
--   (+ user_email_preferences.agent_run_result)

-- ============================================================================
-- V3 — Task 2: Website Hosting & Publishing.
--
-- Applied from v3_website_hosting_migration.sql, mirrored here so this file
-- stays the single readable picture of the whole schema (and so the RLS
-- coverage check in scripts/tests/security-posture.test.mjs, which reads
-- THIS file, can see the new tables).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- published_sites — one row per live site.
--
-- html_content is stored HERE rather than read from user_websites on every
-- request, deliberately. The published copy is a SNAPSHOT: a user editing
-- a draft in the builder must not silently change what the public sees,
-- and the live site must keep serving even while a regeneration is
-- mid-flight (user_websites.html_content is empty for the whole duration
-- of a 'pending'/'processing' generation — reading through would take
-- every published site down for minutes every time its owner clicked
-- "regenerate").
-- ----------------------------------------------------------------------------
create table if not exists public.published_sites (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.user_websites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- 3-30 chars, [a-z0-9-], not starting/ending with a hyphen, not on the
  -- reserved blocklist. Validated in lib/publishing/subdomain.ts before it
  -- ever reaches here; the CHECK is the backstop that makes a bypassed
  -- validator a database error rather than a live site at /s/admin.
  subdomain text not null,
  -- Infrastructure only for now: there is no domain to point at yet, so
  -- the verification flow exists and nothing serves from it.
  custom_domain text,
  custom_domain_verification_token text,
  custom_domain_verified_at timestamptz,

  html_content text not null,

  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  --   live        — served
  --   unpublished — withdrawn by the owner; the subdomain is kept so a
  --                 re-publish reuses it and old links start working again
  status text not null default 'live'
    check (status in ('live', 'unpublished')),

  -- Denormalised running total, incremented by the public route. The
  -- per-day breakdown lives in site_analytics; this exists so a list of 30
  -- sites is one query rather than 30 aggregations.
  view_count bigint not null default 0,
  is_active boolean not null default true
);

-- The unique constraint that makes a subdomain a namespace.
--
-- Case is folded because subdomains are case-insensitive in DNS and in
-- URLs: without lower(), "Acme" and "acme" would be two different sites
-- reachable at the same address. Application code lowercases on the way
-- in; this makes that impossible to forget.
create unique index if not exists published_sites_subdomain_key
  on public.published_sites (lower(subdomain));

-- The public route's only query.
create index if not exists published_sites_subdomain_active_idx
  on public.published_sites (lower(subdomain), is_active);

create index if not exists published_sites_user_id_idx
  on public.published_sites (user_id, published_at desc);

-- One published site per website. Re-publishing updates the row rather
-- than creating a second one, which is what keeps "how many sites has this
-- account published" a truthful count.
create unique index if not exists published_sites_website_id_key
  on public.published_sites (website_id);

alter table public.published_sites enable row level security;

drop policy if exists "select_own_published_sites" on public.published_sites;
create policy "select_own_published_sites" on public.published_sites
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_published_sites" on public.published_sites;
create policy "insert_own_published_sites" on public.published_sites
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_published_sites" on public.published_sites;
create policy "update_own_published_sites" on public.published_sites
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_published_sites" on public.published_sites;
create policy "delete_own_published_sites" on public.published_sites
  for delete using (auth.uid() = user_id);

-- NO public select policy, on purpose. The public route reads through the
-- service-role client (which bypasses RLS) and selects only the columns a
-- visitor needs. An "anyone can read published_sites" policy would expose
-- user_id and the full row of every site on the platform to anyone holding
-- the anon key, which is printed in the client bundle.

drop trigger if exists set_updated_at on public.published_sites;
create trigger set_updated_at before update on public.published_sites
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- site_versions — every version that was ever LIVE.
--
-- Distinct from website_versions, which tracks the draft in the builder. A
-- user can edit a draft ten times and publish once; only the publish is a
-- version of the live site, and rollback has to mean "what the public saw
-- on Tuesday", not "what I had in the editor on Tuesday".
-- ----------------------------------------------------------------------------
create table if not exists public.site_versions (
  id uuid primary key default gen_random_uuid(),
  published_site_id uuid not null references public.published_sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  html_content text not null,
  published_at timestamptz not null default now(),
  version_number int not null,
  -- What changed, in the user's words or the AI's — shown in the timeline.
  change_description text
);

create unique index if not exists site_versions_site_version_key
  on public.site_versions (published_site_id, version_number);

create index if not exists site_versions_site_published_at_idx
  on public.site_versions (published_site_id, published_at desc);

alter table public.site_versions enable row level security;

drop policy if exists "select_own_site_versions" on public.site_versions;
create policy "select_own_site_versions" on public.site_versions
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_site_versions" on public.site_versions;
create policy "insert_own_site_versions" on public.site_versions
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete_own_site_versions" on public.site_versions;
create policy "delete_own_site_versions" on public.site_versions
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- site_analytics — views per site per day.
--
-- GDPR-shaped by construction: there is no column that could hold personal
-- data. No IP, no user agent, no cookie, no visitor id, no referrer, no
-- path. A day and two counters. "unique_visitors" is derived from a
-- rotating, salted, truncated hash held only in memory for the current day
-- (see lib/publishing/analytics.ts) — it is a COUNT, and nothing that
-- could identify a person is ever written here.
-- ----------------------------------------------------------------------------
create table if not exists public.site_analytics (
  id uuid primary key default gen_random_uuid(),
  published_site_id uuid not null references public.published_sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  views integer not null default 0,
  unique_visitors integer not null default 0
);

create unique index if not exists site_analytics_site_date_key
  on public.site_analytics (published_site_id, date);

create index if not exists site_analytics_user_date_idx
  on public.site_analytics (user_id, date desc);

alter table public.site_analytics enable row level security;

-- Read-only to the owner: only the service-role client (the public serving
-- route) writes counts. A user who could write here could fabricate
-- traffic; one who could delete could hide it.
drop policy if exists "select_own_site_analytics" on public.site_analytics;
create policy "select_own_site_analytics" on public.site_analytics
  for select using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- record_site_view — one atomic call per public page view.
--
-- Doing this as read-then-write from the route would lose counts under any
-- concurrency at all, which is exactly the condition a popular page is in.
-- SECURITY DEFINER because the public route holds no session; it is
-- callable only with the service-role key, which the client never sees.
-- ----------------------------------------------------------------------------
create or replace function public.record_site_view(
  p_site_id uuid,
  p_user_id uuid,
  p_is_unique boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.published_sites
    set view_count = view_count + 1
    where id = p_site_id;

  insert into public.site_analytics (published_site_id, user_id, date, views, unique_visitors)
    values (p_site_id, p_user_id, current_date, 1, case when p_is_unique then 1 else 0 end)
  on conflict (published_site_id, date) do update
    set views = public.site_analytics.views + 1,
        unique_visitors = public.site_analytics.unique_visitors
          + case when p_is_unique then 1 else 0 end;
end;
$$;

revoke all on function public.record_site_view(uuid, uuid, boolean) from public;
revoke all on function public.record_site_view(uuid, uuid, boolean) from anon;
revoke all on function public.record_site_view(uuid, uuid, boolean) from authenticated;
grant execute on function public.record_site_view(uuid, uuid, boolean) to service_role;

-- V3 — Website Hosting & Publishing:
--   published_sites, site_versions, site_analytics
--   (+ RPC record_site_view)

-- ============================================================================
-- V3 — Task 3: Universal Integrations.
--
-- Applied from v3_integrations_migration.sql, mirrored here so this file
-- stays the single readable picture of the whole schema (and so the RLS
-- coverage check in scripts/tests/security-posture.test.mjs, which reads
-- THIS file, can see the two tables that hold third-party OAuth tokens —
-- the last tables in the product that should be outside that check).
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

-- V3 — Universal Integrations:
--   user_integrations, integration_sync_log
--   (+ RPC prune_integration_sync_log, and user_agents.delivery_method
--      widened to ('email','slack'))
-- ============================================================================
-- V3 — Task 4: File Workspace + Deep Research.
--
-- Standalone, additive, idempotent. Safe to run on a project that already
-- has supabase_full_project_backup.sql applied.
--
-- WHAT IS DIFFERENT ABOUT THIS ONE: the bytes a user uploads are theirs,
-- not ours, and a PDF is routinely the single most sensitive object a
-- small business owns — a contract, a payroll run, a medical letter. So
-- the bucket is PRIVATE with no public read at all, every download goes
-- through a short-lived signed URL minted only after an ownership check,
-- and the extracted text lives in a table whose RLS is scoped to the
-- owner exactly like every other one here.
--
-- The extracted text is stored in the DATABASE rather than re-derived
-- from the object on every question. That is deliberate: extraction is
-- the expensive, failure-prone step, and asking a question should not be
-- able to fail because a PDF parser had a bad day. It also means "delete
-- this file" has to clear BOTH the object and the row, which the delete
-- route does in that order.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- user_files — one row per uploaded file.
-- ----------------------------------------------------------------------------
create table if not exists public.user_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- As the user named it, sanitised for display. NOT used to build the
  -- storage path: a filename is attacker-controlled and a path built from
  -- one is a traversal waiting to happen.
  filename text not null,

  -- The normalised kind, not the browser's Content-Type header (which is
  -- client-supplied and therefore a hint, never a fact).
  file_type text not null check (file_type in ('pdf', 'docx', 'xlsx', 'txt', 'csv', 'md')),

  size_bytes bigint not null check (size_bytes >= 0),

  -- `<user_id>/<uuid>.<ext>` inside the PRIVATE 'user-files' bucket. The
  -- leading segment is what the storage RLS policies below match on, so
  -- it is the ownership proof and not merely an organisational choice.
  storage_path text not null,

  -- The text the AI actually reads. Null while processing, and null
  -- forever for a file we could not read (a scanned PDF with no text
  -- layer), in which case `error` says so in words a person can act on.
  extracted_text text,
  page_count integer,
  -- Characters of extracted text. Cheap to read for the cost estimate
  -- without pulling the whole document into memory.
  char_count integer not null default 0,

  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  --   pending    — row exists, bytes uploaded, extraction not started
  --   processing — extraction running
  --   ready      — extracted_text is usable
  --   failed     — see `error`; the file is still downloadable
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'ready', 'failed')),
  -- A short, user-facing reason. Never a parser stack trace.
  error text
);

create index if not exists user_files_user_uploaded_idx
  on public.user_files (user_id, uploaded_at desc);

create index if not exists user_files_user_status_idx
  on public.user_files (user_id, processing_status);

alter table public.user_files enable row level security;

drop policy if exists "select_own_user_files" on public.user_files;
create policy "select_own_user_files" on public.user_files
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_files" on public.user_files;
create policy "insert_own_user_files" on public.user_files
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_user_files" on public.user_files;
create policy "update_own_user_files" on public.user_files
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_user_files" on public.user_files;
create policy "delete_own_user_files" on public.user_files
  for delete using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.user_files;
create trigger set_updated_at before update on public.user_files
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- file_collections — a named group of files to ask questions against.
-- ----------------------------------------------------------------------------
create table if not exists public.file_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists file_collections_user_created_idx
  on public.file_collections (user_id, created_at desc);

alter table public.file_collections enable row level security;

drop policy if exists "select_own_file_collections" on public.file_collections;
create policy "select_own_file_collections" on public.file_collections
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_file_collections" on public.file_collections;
create policy "insert_own_file_collections" on public.file_collections
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_file_collections" on public.file_collections;
create policy "update_own_file_collections" on public.file_collections
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_file_collections" on public.file_collections;
create policy "delete_own_file_collections" on public.file_collections
  for delete using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.file_collections;
create trigger set_updated_at before update on public.file_collections
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- file_collection_items — the membership join.
--
-- user_id is denormalised here rather than derived through a join, for
-- the same reason it is on website_versions and site_versions: this
-- schema's RLS is `auth.uid() = user_id` everywhere, and a policy that
-- has to join to find its owner is a policy nobody can read at a glance.
-- The FKs to both parents mean a row can only ever name a collection and
-- a file that exist; the CHECK on insert (in application code) means they
-- must both belong to the same person.
-- ----------------------------------------------------------------------------
create table if not exists public.file_collection_items (
  collection_id uuid not null references public.file_collections(id) on delete cascade,
  file_id uuid not null references public.user_files(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, file_id)
);

create index if not exists file_collection_items_file_idx
  on public.file_collection_items (file_id);
create index if not exists file_collection_items_user_idx
  on public.file_collection_items (user_id);

alter table public.file_collection_items enable row level security;

drop policy if exists "select_own_file_collection_items" on public.file_collection_items;
create policy "select_own_file_collection_items" on public.file_collection_items
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_file_collection_items" on public.file_collection_items;
create policy "insert_own_file_collection_items" on public.file_collection_items
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete_own_file_collection_items" on public.file_collection_items;
create policy "delete_own_file_collection_items" on public.file_collection_items
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- research_reports — Deep Research jobs and their results.
--
-- A long-running job that spends real money, so it follows the Website
-- Builder's shape exactly: a row exists in 'pending' BEFORE the work
-- starts, so a run killed mid-flight leaves a visible record instead of
-- no trace, and `processing_started_at` is the atomic claim that stops
-- two invocations working the same job.
-- ----------------------------------------------------------------------------
create table if not exists public.research_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  topic text not null,
  -- The user's own language, so the report comes back in it.
  language text not null default 'en',

  --   pending    — created, not claimed
  --   planning   — breaking the topic into research questions
  --   researching— running the searches
  --   synthesising — writing the report
  --   ready      — `sections` is populated
  --   failed     — see `error`
  status text not null default 'pending'
    check (status in ('pending', 'planning', 'researching', 'synthesising', 'ready', 'failed')),

  -- The 3-6 questions the AI decided to research. Shown to the user
  -- BEFORE the expensive part starts, because "here is what I am about to
  -- spend your credits looking up" is the one moment they can say no.
  questions jsonb not null default '[]'::jsonb,
  -- The finished report: [{ heading, body, sourceIndexes }]
  sections jsonb not null default '[]'::jsonb,
  -- [{ title, url }] — every claim in the report points at one of these.
  sources jsonb not null default '[]'::jsonb,

  -- Set once the report has been saved into the Documents module, so the
  -- user's report lives where the rest of their writing does.
  document_id uuid,

  credits_charged numeric not null default 0,
  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  -- The atomic claim. Null means unclaimed.
  processing_started_at timestamptz
);

create index if not exists research_reports_user_created_idx
  on public.research_reports (user_id, created_at desc);
create index if not exists research_reports_status_idx
  on public.research_reports (status, created_at);

alter table public.research_reports enable row level security;

drop policy if exists "select_own_research_reports" on public.research_reports;
create policy "select_own_research_reports" on public.research_reports
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_research_reports" on public.research_reports;
create policy "insert_own_research_reports" on public.research_reports
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_research_reports" on public.research_reports;
create policy "update_own_research_reports" on public.research_reports
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_research_reports" on public.research_reports;
create policy "delete_own_research_reports" on public.research_reports
  for delete using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.research_reports;
create trigger set_updated_at before update on public.research_reports
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Storage: the 'user-files' bucket.
--
-- PRIVATE, unlike 'website-references'. That bucket is public because the
-- user downloads the generated HTML and hosts it elsewhere, so any expiry
-- would break their live site later. Nothing about a payroll PDF wants
-- that trade. Every read here goes through a signed URL minted by
-- api/files/[id]/download after an ownership check, and those expire in
-- 60 seconds.
--
-- `public = false` is forced on conflict so that a bucket accidentally
-- created public in the dashboard is CORRECTED by running this file,
-- rather than silently left open.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('user-files', 'user-files', false)
on conflict (id) do update set public = false;

-- The first path segment is the owner's uuid. These policies are what
-- makes that true rather than merely conventional.
drop policy if exists "select_own_user_files_objects" on storage.objects;
create policy "select_own_user_files_objects" on storage.objects
  for select using (
    bucket_id = 'user-files' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "insert_own_user_files_objects" on storage.objects;
create policy "insert_own_user_files_objects" on storage.objects
  for insert with check (
    bucket_id = 'user-files' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "update_own_user_files_objects" on storage.objects;
create policy "update_own_user_files_objects" on storage.objects
  for update using (
    bucket_id = 'user-files' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "delete_own_user_files_objects" on storage.objects;
create policy "delete_own_user_files_objects" on storage.objects
  for delete using (
    bucket_id = 'user-files' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ----------------------------------------------------------------------------
-- Account deletion must remove the OBJECTS too, not just the rows.
--
-- `on delete cascade` clears user_files, but storage.objects has no FK to
-- auth.users — so without this the bytes of a deleted account's contracts
-- would sit in the bucket forever. That is not a tidiness problem, it is
-- the erasure right in Article 17 not being honoured.
--
-- Called by api/delete-account/confirm before it deletes the auth user.
-- ----------------------------------------------------------------------------
create or replace function public.delete_user_file_objects(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer;
begin
  delete from storage.objects
    where bucket_id = 'user-files'
      and (storage.foldername(name))[1] = target_user_id::text;
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.delete_user_file_objects(uuid) from public;
revoke all on function public.delete_user_file_objects(uuid) from anon;
revoke all on function public.delete_user_file_objects(uuid) from authenticated;
grant execute on function public.delete_user_file_objects(uuid) to service_role;


-- ============================================================================
-- V3 — Task 5: Presentation Builder.
--
-- Standalone, additive, idempotent. Safe to run on a project that already
-- has supabase_full_project_backup.sql and the earlier V3 migrations
-- applied.
--
-- WHAT IS DIFFERENT ABOUT THIS ONE: /dashboard/presentations already
-- exists as a TRACKER — rows in `ai_agents`-style module tables where the
-- user typed a name and a status by hand and nothing was ever generated.
-- This migration does not touch those tables. The new feature is a new
-- table, so an account that had tracker rows keeps them and the module
-- page simply stops being the thing that renders them. Dropping the old
-- rows to make the new page tidy would be deleting the user's notes to
-- save ourselves a migration.
--
-- The deck itself is JSONB rather than a slides TABLE. A deck is edited
-- as a whole — reordering is an array permutation, an AI edit rewrites
-- every slide at once, and a version is a snapshot of all of it. Modelled
-- as rows, every one of those becomes a multi-statement transaction that
-- can half-apply, and "slide 4 vanished during a reorder" is the bug that
-- follows. The trade is that we cannot query INTO a deck, which nothing
-- here needs to do.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- user_presentations — one row per deck.
-- ----------------------------------------------------------------------------
create table if not exists public.user_presentations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  title text not null default '',

  -- The user's original description. Kept after generation because it is
  -- what "regenerate" and every AI edit are relative to, and because a
  -- deck whose brief is gone cannot be explained to the person looking
  -- at it six months later.
  brief text not null default '',

  -- The locale the deck was WRITTEN in, which is not necessarily the
  -- locale the UI is in now. A deck generated in Greek stays Greek when
  -- its owner switches the interface to English; regenerating it in the
  -- new UI language without being asked would silently destroy work.
  language text not null default 'en',

  theme text not null default 'professional',

  -- The deck. An array of slide objects — see lib/presentations/slides.ts,
  -- which is the single definition of that shape and normalises anything
  -- that does not match it rather than trusting this column.
  slides jsonb not null default '[]'::jsonb,

  -- Where the facts came from: [{title, url}]. Rendered as the deck's
  -- sources and kept so a figure on a slide can be traced back.
  sources jsonb not null default '[]'::jsonb,

  --   generating — the row exists, the AI call is in flight
  --   ready      — slides is usable
  --   failed     — see `error`
  status text not null default 'generating'
    check (status in ('generating', 'ready', 'failed')),
  -- Short and user-facing. Never a stack trace.
  error text,

  -- Credits actually settled for the generation, for the activity list.
  credits_charged numeric(12, 4) not null default 0,

  -- ------------------------------------------------------------------
  -- Public sharing.
  -- ------------------------------------------------------------------
  --
  -- A RANDOM TOKEN, not a user-chosen address. Published websites (Task
  -- 2) let the user pick their address and therefore needed ~70 reserved
  -- names and a case-folded uniqueness index, because an address is a
  -- namespace someone can squat or impersonate through. A share link is
  -- not a namespace — nobody types it, they follow it — so the whole
  -- class of problem is avoided by not having names at all.
  --
  -- Unguessable is the security property that matters, and it is
  -- enforced where the token is MINTED (crypto random, 32 hex chars),
  -- not here. Nullable because a deck has no link until someone asks
  -- for one.
  share_slug text unique,
  -- Separate from share_slug being null so that turning sharing off and
  -- on again returns the SAME link. Revoking has to be possible, but a
  -- user who toggles the switch twice did not intend to break every
  -- copy of the URL they had already sent out. `rotate` in the API is
  -- the deliberate way to invalidate one.
  share_enabled boolean not null default false,
  shared_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_presentations_user_created_idx
  on public.user_presentations (user_id, created_at desc);

-- The public route looks a deck up by token on every visit. Partial:
-- only shared decks are ever fetched this way, and the index should not
-- carry the decks that are not.
create index if not exists user_presentations_share_slug_idx
  on public.user_presentations (share_slug)
  where share_slug is not null;

-- The monthly fair-use count (lib/presentations/presentation-limits.ts)
-- is a COUNT over one user's rows in a date window, on every generation.
create index if not exists user_presentations_user_month_idx
  on public.user_presentations (user_id, created_at);

alter table public.user_presentations enable row level security;

drop policy if exists "select_own_user_presentations" on public.user_presentations;
create policy "select_own_user_presentations" on public.user_presentations
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_presentations" on public.user_presentations;
create policy "insert_own_user_presentations" on public.user_presentations
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_user_presentations" on public.user_presentations;
create policy "update_own_user_presentations" on public.user_presentations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_user_presentations" on public.user_presentations;
create policy "delete_own_user_presentations" on public.user_presentations
  for delete using (auth.uid() = user_id);

-- NO public select policy, on purpose — the same call the published-sites
-- migration made and for the same reason. The share route reads through
-- the SERVICE-ROLE client and returns only the columns a viewer needs.
-- An "anyone can read a shared presentation" policy would be evaluated
-- against the ANON key, which is printed in the client bundle: anyone
-- could then enumerate the table directly and read `brief` and
-- `credits_charged` off every shared deck in the database, not just the
-- one slide deck they were sent a link to.

-- ----------------------------------------------------------------------------
-- presentation_versions — a snapshot per generation and per accepted edit.
-- ----------------------------------------------------------------------------
--
-- APPEND-ONLY, like site_versions. "Undo" adds a version whose content is
-- an older one rather than deleting forward history, so undoing an undo
-- works and no button in this product can erase what the user had.
--
-- The ceiling (MAX_VERSIONS_PER_PRESENTATION, 20) is enforced in the API
-- by deleting the OLDEST rows, which is the one deletion allowed here.
create table if not exists public.presentation_versions (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.user_presentations(id) on delete cascade,

  -- Denormalised from the parent so RLS on this table is a plain
  -- `auth.uid() = user_id` rather than a subquery into user_presentations.
  -- A policy that joins is a policy that can be defeated by a row the
  -- join does not see; this one cannot.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- 1-based, unique per deck. Assigned by the API under the row's own
  -- ordering, and unique here so a concurrent double-submit fails loudly
  -- instead of producing two "version 4"s.
  version_number integer not null check (version_number > 0),

  title text not null default '',
  slides jsonb not null default '[]'::jsonb,

  -- What changed, in one sentence: the AI edit's own summary, or a fixed
  -- label for a generation or a manual save.
  change_summary text not null default '',

  created_at timestamptz not null default now(),

  unique (presentation_id, version_number)
);

create index if not exists presentation_versions_deck_idx
  on public.presentation_versions (presentation_id, version_number desc);

alter table public.presentation_versions enable row level security;

drop policy if exists "select_own_presentation_versions" on public.presentation_versions;
create policy "select_own_presentation_versions" on public.presentation_versions
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_presentation_versions" on public.presentation_versions;
create policy "insert_own_presentation_versions" on public.presentation_versions
  for insert with check (auth.uid() = user_id);

-- No UPDATE policy at all: a version is a snapshot, and a snapshot that
-- can be edited is not one. Rolling back writes a NEW version.
drop policy if exists "delete_own_presentation_versions" on public.presentation_versions;
create policy "delete_own_presentation_versions" on public.presentation_versions
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- updated_at.
-- ----------------------------------------------------------------------------
create or replace function public.touch_user_presentations_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_presentations_touch_updated_at on public.user_presentations;
create trigger user_presentations_touch_updated_at
  before update on public.user_presentations
  for each row execute function public.touch_user_presentations_updated_at();

-- ============================================================================
-- V3 — Task 6: Marketplace with payments.
--
-- Standalone, additive, idempotent. Safe to run on a project that already
-- has supabase_full_project_backup.sql and the earlier V3 migrations
-- applied.
--
-- WHAT IS DIFFERENT ABOUT THIS ONE: every other table in this project
-- holds one user's data, read by that user. This one holds a MARKET —
-- rows written by a seller and read by strangers, with money moving
-- between them. Two consequences shaped the whole schema:
--
--   1. THE PAYLOAD IS THE MERCHANDISE, so it lives in its own table.
--      RLS is row-level, not column-level: a "published listings are
--      readable by everyone" policy on a table with a `payload` column
--      hands the goods to anyone with the anon key — which is printed in
--      the client bundle. Splitting it is not tidiness, it is the only
--      way the browse page and the paywall can coexist.
--
--   2. THE MONEY FIELDS ARE WRITTEN BY THE PLATFORM, NEVER THE SELLER.
--      purchase_count, the rating aggregate and every cent column are
--      service-role-only. A seller who could update their own
--      purchase_count could manufacture a bestseller; one who could
--      update seller_cents could manufacture a payout.
--
-- The feature ships DARK. MARKETPLACE_ENABLED is off by default because
-- Stripe Connect needs a legally accountable account holder, and this
-- deployment cannot pay anyone out until the company behind it exists.
-- The schema is here so that turning it on is configuration rather than a
-- migration under time pressure.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- seller_accounts — one row per user who has started selling.
-- ----------------------------------------------------------------------------
create table if not exists public.seller_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- The Stripe Connect (Express) account id, `acct_...`. Not a secret,
  -- but it is the identifier a payout is aimed at, so it is written only
  -- by the server after Stripe returns it — never accepted from a
  -- request body.
  stripe_account_id text unique,

  --   none       — the row exists, onboarding not started
  --   pending    — Stripe onboarding started, not finished
  --   active     — Stripe reports the account can take charges
  --   restricted — Stripe has paused it (failed verification, etc.)
  onboarding_status text not null default 'none'
    check (onboarding_status in ('none', 'pending', 'active', 'restricted')),

  -- Mirrored from Stripe on every webhook. Stored rather than fetched
  -- per request because the seller dashboard reads them on every load,
  -- and treated as a CACHE: the authority is Stripe, and the publish
  -- path re-checks rather than trusting these.
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,

  -- The country the seller onboarded in, for display. Payout rules
  -- differ per country and showing the wrong one is worse than showing
  -- none.
  country text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seller_accounts enable row level security;

drop policy if exists "select_own_seller_account" on public.seller_accounts;
create policy "select_own_seller_account" on public.seller_accounts
  for select using (auth.uid() = user_id);

-- No insert/update/delete policies at all. A seller account is created
-- and maintained by the server after Stripe answers — every column here
-- is either a Stripe identifier or a Stripe verdict, and neither is
-- something the account holder gets to assert about themselves.

-- ----------------------------------------------------------------------------
-- marketplace_listings — the shop window. NO payload here.
-- ----------------------------------------------------------------------------
create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,

  kind text not null
    check (kind in ('website_template', 'agent_config', 'mission_template',
                    'presentation_template', 'automation')),

  title text not null,
  summary text not null default '',
  description text not null default '',
  category text not null default 'other',

  -- EUR CENTS. Integer, never numeric: money in floating point is a
  -- rounding error waiting to be found by an accountant.
  price_cents integer not null check (price_cents >= 0),

  -- What a browser may see BEFORE paying — a title, a slide count, a
  -- screenshot-free structural outline. Built by the server from the
  -- payload (lib/marketplace/payload.ts), never supplied by the seller,
  -- so a preview cannot quietly contain the thing being sold.
  preview jsonb not null default '{}'::jsonb,

  --   draft          — being written, invisible to everyone else
  --   pending_review — submitted; the security scan is running
  --   published      — live
  --   rejected       — the scan refused it; review_notes says why
  --   unpublished    — withdrawn by the seller or by us
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'published', 'rejected', 'unpublished')),
  -- Why a listing was rejected, in words the seller can act on.
  review_notes text,

  -- Platform-written aggregates. Kept denormalised because the browse
  -- page sorts on them and a count(*) per listing per sort is the query
  -- that makes a marketplace slow at exactly the point it starts working.
  purchase_count integer not null default 0 check (purchase_count >= 0),
  rating_sum integer not null default 0 check (rating_sum >= 0),
  rating_count integer not null default 0 check (rating_count >= 0),

  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_listings_seller_idx
  on public.marketplace_listings (seller_id, created_at desc);

-- The browse page: published only, filtered by kind/category, sorted by
-- one of five orders. Partial so the index carries the live rows only.
create index if not exists marketplace_listings_browse_idx
  on public.marketplace_listings (status, category, kind, published_at desc)
  where status = 'published';

create index if not exists marketplace_listings_popular_idx
  on public.marketplace_listings (status, purchase_count desc)
  where status = 'published';

alter table public.marketplace_listings enable row level security;

-- A seller sees all of their own listings, in any status.
drop policy if exists "select_own_marketplace_listings" on public.marketplace_listings;
create policy "select_own_marketplace_listings" on public.marketplace_listings
  for select using (auth.uid() = seller_id);

-- Everyone signed in sees the PUBLISHED ones. `auth.uid() is not null`
-- rather than a bare `status = 'published'`: without it the policy is
-- satisfied by the anon key alone, and the shop window becomes a public
-- API for scraping every seller's title, price and sales count.
drop policy if exists "select_published_marketplace_listings" on public.marketplace_listings;
create policy "select_published_marketplace_listings" on public.marketplace_listings
  for select using (status = 'published' and auth.uid() is not null);

drop policy if exists "delete_own_marketplace_listings" on public.marketplace_listings;
create policy "delete_own_marketplace_listings" on public.marketplace_listings
  for delete using (auth.uid() = seller_id);

-- NO insert or update policy, deliberately, and the insert one is the
-- important omission.
--
-- The obvious policy — `for insert with check (auth.uid() = seller_id)`
-- — is wrong, and wrong in a way that is easy to miss because it looks
-- exactly like the insert policy on every other table here. Those tables
-- hold rows whose every column the owner is entitled to assert. This one
-- has `status`. A seller holding the anon key (which is printed in the
-- client bundle) could insert a row with `status = 'published'` directly
-- and be live without the mandatory security scan ever running — the
-- scan is enforced by the publish ROUTE, so any path that reaches the
-- table without passing through it defeats it entirely.
--
-- The same argument applies to update, for `status`, `purchase_count`
-- (manufacturing a bestseller) and the rating aggregate. Postgres has no
-- column-level grant that composes with RLS here, so the choice is
-- writes that go through a route which whitelists columns, or a policy
-- that trusts the seller with all of them. Every write to this table is
-- therefore on the service-role client, behind
-- /api/marketplace/listings.

-- ----------------------------------------------------------------------------
-- marketplace_listing_payloads — the merchandise.
-- ----------------------------------------------------------------------------
--
-- Separate table, and the reason is the entire security model of this
-- feature: RLS is ROW-level. A `payload` column on marketplace_listings
-- would be readable by exactly the same policy that makes the shop
-- window browsable, so every buyer could read every product without
-- paying by selecting the column the UI happens not to render.
--
-- Here, the only select policy is the seller's own. A buyer never reads
-- this table at all — the install route reads it with the service-role
-- client AFTER verifying a paid purchase, and writes the result into the
-- buyer's own table.
create table if not exists public.marketplace_listing_payloads (
  listing_id uuid primary key references public.marketplace_listings(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,

  -- The configuration being sold. Shape depends on `kind` — see
  -- lib/marketplace/payload.ts, which is the only thing that builds one
  -- and the only thing that installs one.
  payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketplace_listing_payloads enable row level security;

drop policy if exists "select_own_marketplace_payloads" on public.marketplace_listing_payloads;
create policy "select_own_marketplace_payloads" on public.marketplace_listing_payloads
  for select using (auth.uid() = seller_id);

-- No insert/update/delete policies: a payload is written by the publish
-- route, which has already run the mandatory security scan on it. A
-- seller who could write here directly could publish a scanned listing
-- and then swap the goods.

-- ----------------------------------------------------------------------------
-- marketplace_purchases — the receipt, and the entitlement.
-- ----------------------------------------------------------------------------
create table if not exists public.marketplace_purchases (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  -- Denormalised so the seller dashboard is a single-table read and so a
  -- deleted listing does not orphan the sale. `on delete restrict` above
  -- backs this up: a listing with sales against it cannot be deleted,
  -- because a buyer's receipt must outlive the seller changing their mind.
  seller_id uuid not null references auth.users(id) on delete cascade,

  -- The split, frozen at purchase time. The commission percentage is
  -- stored WITH each row rather than read from the environment when the
  -- seller dashboard renders: changing the platform fee must not
  -- retroactively rewrite what past sales earned.
  price_cents integer not null check (price_cents >= 0),
  platform_fee_cents integer not null check (platform_fee_cents >= 0),
  seller_cents integer not null check (seller_cents >= 0),
  commission_percent integer not null check (commission_percent between 0 and 100),

  -- Unique, and it is what makes fulfilment idempotent. Stripe retries
  -- webhooks; without this a retried checkout.session.completed installs
  -- the product a second time and credits the seller twice.
  stripe_session_id text unique,
  stripe_payment_intent text,

  status text not null default 'pending'
    check (status in ('pending', 'paid', 'refunded', 'failed')),

  -- The row created in the BUYER's own table. Null until fulfilment
  -- succeeds, which is what "have I received what I paid for" is read
  -- from — not the payment status, because a paid purchase whose install
  -- failed is precisely the case that needs finding.
  installed_entity_id uuid,
  installed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_purchases_buyer_idx
  on public.marketplace_purchases (buyer_id, created_at desc);
create index if not exists marketplace_purchases_seller_idx
  on public.marketplace_purchases (seller_id, created_at desc);
create index if not exists marketplace_purchases_listing_idx
  on public.marketplace_purchases (listing_id);

alter table public.marketplace_purchases enable row level security;

drop policy if exists "select_own_marketplace_purchases" on public.marketplace_purchases;
create policy "select_own_marketplace_purchases" on public.marketplace_purchases
  for select using (auth.uid() = buyer_id or auth.uid() = seller_id);

-- No insert/update/delete. A purchase is created by the checkout route
-- and completed by the Stripe webhook, both on the service-role client.
-- An insertable purchases table is a free-products button.

-- ----------------------------------------------------------------------------
-- marketplace_reviews — one per buyer per listing.
-- ----------------------------------------------------------------------------
create table if not exists public.marketplace_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,

  -- The purchase this review is evidence of. NOT NULL, and that is the
  -- anti-astroturf mechanism: you cannot review what you did not buy,
  -- and the uniqueness below means you cannot buy once and review twice.
  purchase_id uuid not null references public.marketplace_purchases(id) on delete cascade,

  rating smallint not null check (rating between 1 and 5),
  body text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (listing_id, buyer_id)
);

create index if not exists marketplace_reviews_listing_idx
  on public.marketplace_reviews (listing_id, created_at desc);

alter table public.marketplace_reviews enable row level security;

-- Reviews on a PUBLISHED listing are readable by anyone signed in —
-- that is what a review is for. The join is to marketplace_listings
-- rather than a bare `true` so reviews of a withdrawn listing stop being
-- served with it.
drop policy if exists "select_marketplace_reviews" on public.marketplace_reviews;
create policy "select_marketplace_reviews" on public.marketplace_reviews
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from public.marketplace_listings l
      where l.id = marketplace_reviews.listing_id and l.status = 'published'
    )
  );

drop policy if exists "select_own_marketplace_reviews" on public.marketplace_reviews;
create policy "select_own_marketplace_reviews" on public.marketplace_reviews
  for select using (auth.uid() = buyer_id);

-- Writing is the API's job: the rating aggregate on the listing has to
-- move in the same breath, and a policy cannot do that.

-- ----------------------------------------------------------------------------
-- updated_at.
-- ----------------------------------------------------------------------------
create or replace function public.touch_marketplace_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists seller_accounts_touch on public.seller_accounts;
create trigger seller_accounts_touch before update on public.seller_accounts
  for each row execute function public.touch_marketplace_updated_at();

drop trigger if exists marketplace_listings_touch on public.marketplace_listings;
create trigger marketplace_listings_touch before update on public.marketplace_listings
  for each row execute function public.touch_marketplace_updated_at();

drop trigger if exists marketplace_listing_payloads_touch on public.marketplace_listing_payloads;
create trigger marketplace_listing_payloads_touch before update on public.marketplace_listing_payloads
  for each row execute function public.touch_marketplace_updated_at();

drop trigger if exists marketplace_purchases_touch on public.marketplace_purchases;
create trigger marketplace_purchases_touch before update on public.marketplace_purchases
  for each row execute function public.touch_marketplace_updated_at();

drop trigger if exists marketplace_reviews_touch on public.marketplace_reviews;
create trigger marketplace_reviews_touch before update on public.marketplace_reviews
  for each row execute function public.touch_marketplace_updated_at();

-- ----------------------------------------------------------------------------
-- Rating aggregate.
-- ----------------------------------------------------------------------------
--
-- Recomputed from the reviews rather than incremented, so it cannot
-- drift: an increment that runs twice on a webhook retry is wrong
-- forever, while a recount is wrong for as long as it takes to run again.
create or replace function public.recompute_listing_rating(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.marketplace_listings l
     set rating_sum = coalesce(agg.total, 0),
         rating_count = coalesce(agg.n, 0)
    from (
      select sum(rating)::int as total, count(*)::int as n
        from public.marketplace_reviews
       where listing_id = p_listing_id
    ) agg
   where l.id = p_listing_id;
end;
$$;

revoke all on function public.recompute_listing_rating(uuid) from public;
revoke all on function public.recompute_listing_rating(uuid) from anon;
revoke all on function public.recompute_listing_rating(uuid) from authenticated;
grant execute on function public.recompute_listing_rating(uuid) to service_role;

-- ============================================================================
-- V3 — Task 8: Affiliate program.
--
-- Standalone, additive, idempotent.
--
-- Someone refers a customer; for twelve months of that customer's paid
-- invoices, the referrer earns a share. Three tables, and the shape of
-- each is driven by one question: what happens when the numbers are
-- disputed a year from now?
--
--   A COMMISSION IS A LIABILITY, NOT A CALCULATION. It is written once,
--   from a Stripe invoice that really was paid, with the percentage and
--   both cent figures FROZEN onto the row. Recomputing "20% of what they
--   paid" at display time means changing the programme's rate silently
--   rewrites what past referrals earned — which is the same mistake the
--   marketplace avoids by freezing its split per purchase.
--
--   THE CLOCK STARTS AT THE FIRST PAYMENT, NOT AT SIGNUP. A referral who
--   takes three months to convert would otherwise earn nine months of
--   commission instead of twelve, and the person who did the referring
--   has no way to see why.
--
-- Payouts reuse the marketplace's Stripe Connect account
-- (`seller_accounts`) rather than adding a second one. Commissions ACCRUE
-- regardless — they are owed whether or not we can currently pay them —
-- but sending the money needs Connect live, which is the same gate the
-- marketplace is behind.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- affiliate_accounts — one row per user who joined the programme.
-- ----------------------------------------------------------------------------
create table if not exists public.affiliate_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- The public referral code, appearing in URLs as ?ref=<code>. Minted
  -- server-side from crypto randomness and case-folded to lowercase, so
  -- the same code typed in a different case resolves to the same
  -- affiliate rather than to nothing.
  code text not null unique,

  status text not null default 'active'
    check (status in ('active', 'suspended')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.affiliate_accounts enable row level security;

drop policy if exists "select_own_affiliate_account" on public.affiliate_accounts;
create policy "select_own_affiliate_account" on public.affiliate_accounts
  for select using (auth.uid() = user_id);

-- No insert or update policy. `code` is the identifier commissions are
-- attributed through and `status` is our judgement about the account —
-- neither is something the account holder gets to assert. Both are
-- written by the API on the service-role client.

-- ----------------------------------------------------------------------------
-- affiliate_referrals — who referred whom.
-- ----------------------------------------------------------------------------
create table if not exists public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_user_id uuid not null references auth.users(id) on delete cascade,

  -- UNIQUE. A person is referred once, by one person, forever. Without
  -- this, a second signup path or a replayed request creates a second
  -- referral and every invoice pays commission twice.
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,

  -- The code as it was used, kept even if the affiliate later changes
  -- it: a referral is evidence of what happened, not a pointer to
  -- current configuration.
  code text not null,

  signed_up_at timestamptz not null default now(),

  -- Null until the referred account pays for the first time. The twelve
  -- month window is measured from HERE, so a referral that takes three
  -- months to convert still earns a full twelve months.
  first_paid_at timestamptz,
  commission_ends_at timestamptz,

  created_at timestamptz not null default now(),

  -- Self-referral is refused in the API too, but a constraint is what
  -- makes it impossible rather than merely checked. A programme paying
  -- people to refer themselves is not a programme.
  constraint affiliate_referrals_no_self check (affiliate_user_id <> referred_user_id)
);

create index if not exists affiliate_referrals_affiliate_idx
  on public.affiliate_referrals (affiliate_user_id, signed_up_at desc);

alter table public.affiliate_referrals enable row level security;

-- The AFFILIATE sees their own referrals. The referred person does not
-- see this row at all: "who gets paid for you" is not information they
-- were given, and surfacing it invites arguments we cannot settle.
drop policy if exists "select_own_affiliate_referrals" on public.affiliate_referrals;
create policy "select_own_affiliate_referrals" on public.affiliate_referrals
  for select using (auth.uid() = affiliate_user_id);

-- ----------------------------------------------------------------------------
-- affiliate_commissions — what was actually earned.
-- ----------------------------------------------------------------------------
create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.affiliate_referrals(id) on delete cascade,
  -- Denormalised so the affiliate dashboard is a single-table read.
  affiliate_user_id uuid not null references auth.users(id) on delete cascade,

  -- UNIQUE, and this is what makes the webhook safe to replay. Stripe
  -- retries invoice.paid; without this a retry pays the commission
  -- twice, and unlike a display bug that one leaves the building.
  stripe_invoice_id text not null unique,

  -- What the customer ACTUALLY paid, from the invoice — net of
  -- discounts, proration and credit. Commission on list price would pay
  -- out more than came in on any discounted subscription.
  invoice_amount_cents integer not null check (invoice_amount_cents >= 0),
  commission_cents integer not null check (commission_cents >= 0),
  -- Frozen. Changing the programme's rate must not rewrite history.
  percent integer not null check (percent between 0 and 100),

  earned_at timestamptz not null default now(),
  paid_out_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists affiliate_commissions_affiliate_idx
  on public.affiliate_commissions (affiliate_user_id, earned_at desc);
create index if not exists affiliate_commissions_unpaid_idx
  on public.affiliate_commissions (affiliate_user_id)
  where paid_out_at is null;

alter table public.affiliate_commissions enable row level security;

drop policy if exists "select_own_affiliate_commissions" on public.affiliate_commissions;
create policy "select_own_affiliate_commissions" on public.affiliate_commissions
  for select using (auth.uid() = affiliate_user_id);

-- No write policies anywhere in this file. Every row here is money owed,
-- written from a Stripe event on the service-role client. An insertable
-- commissions table is a "pay me" button.

-- ----------------------------------------------------------------------------
-- updated_at.
-- ----------------------------------------------------------------------------
drop trigger if exists affiliate_accounts_touch on public.affiliate_accounts;
create trigger affiliate_accounts_touch before update on public.affiliate_accounts
  for each row execute function public.touch_marketplace_updated_at();

-- ============================================================================
-- V3 Task 11 — Collaborative projects (missions shared across accounts).
--
-- The "project" is a mission (ai_missions): the one entity in the product
-- with a goal, a plan and a lifecycle. Collaboration here is DISTINCT from
-- the Business plan's team seats and coexists with them: a team seat puts
-- somebody inside the owner's account at the owner's tier; a collaborator
-- is an INDEPENDENT account with its own plan and its own credits that has
-- been granted access to exactly one mission. Nothing a collaborator does
-- is charged to the owner — every AI route charges the session user, and
-- the session user is the collaborator.
--
-- THE PROJECT STAYS WITH THE OWNER. Ownership is never transferred or
-- shared: insert and delete on ai_missions remain owner-only, the owner
-- can revoke any collaborator at any time (delete their row), and deleting
-- the mission cascades every collaboration table away.
--
-- ACCESS IS GRANTED BY EXACTLY ONE CODE PATH. project_collaborators has NO
-- insert policy — deliberately, same reasoning as marketplace_listings: the
-- obvious `with check (auth.uid() = owner_id)` would let an owner mint
-- collaborator rows for users who never consented, and a `with check
-- (auth.uid() = user_id)` would let anyone add themselves to any project.
-- Membership rows are created only by the accept route (service role)
-- after it has verified the token, the invite's status, its age, that the
-- inviter still owns the mission, and that the accepting account's email
-- is the one the invite was addressed to.
-- ============================================================================

-- Invites. Writable by the inviter (owner_id = auth.uid()); the token is
-- what travels in the email. An invite row is NOT access — even a forged
-- row pointing at somebody else's mission grants nothing, because the
-- accept route re-checks that owner_id actually owns project_id before it
-- creates the membership. That check is what makes the permissive insert
-- policy below safe.
create table if not exists public.collaboration_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ai_missions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('editor', 'viewer')),
  -- 32 hex chars from crypto.randomBytes(16) — same entropy budget as the
  -- presentation share slug; this is a credential, not an id.
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_user_id uuid references auth.users(id) on delete set null,
  -- The growth measurement the feature was asked to carry: true when the
  -- account that accepted was CREATED after the invite was sent, i.e. the
  -- invite is what brought them to the product.
  signup_attributed boolean not null default false,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create index if not exists collaboration_invites_owner_idx
  on public.collaboration_invites (owner_id, created_at desc);
create index if not exists collaboration_invites_project_idx
  on public.collaboration_invites (project_id);

alter table public.collaboration_invites enable row level security;

drop policy if exists "select_own_collaboration_invites" on public.collaboration_invites;
create policy "select_own_collaboration_invites" on public.collaboration_invites
  for select using (auth.uid() = owner_id);

drop policy if exists "insert_own_collaboration_invites" on public.collaboration_invites;
create policy "insert_own_collaboration_invites" on public.collaboration_invites
  for insert with check (auth.uid() = owner_id);

-- Owners can revoke (status change) and tidy up. The invitee never
-- touches this table directly — the accept route acts for them.
drop policy if exists "update_own_collaboration_invites" on public.collaboration_invites;
create policy "update_own_collaboration_invites" on public.collaboration_invites
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "delete_own_collaboration_invites" on public.collaboration_invites;
create policy "delete_own_collaboration_invites" on public.collaboration_invites
  for delete using (auth.uid() = owner_id);

-- Membership. NO insert policy — see the header. No update policy either:
-- changing a role is revoke + reinvite, which keeps every grant an
-- explicit, consented act.
create table if not exists public.project_collaborators (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ai_missions(id) on delete cascade,
  -- Denormalised owner: lets the owner's policies on this table avoid a
  -- join back to ai_missions, and pins WHO granted the access.
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index if not exists project_collaborators_user_idx
  on public.project_collaborators (user_id);
create index if not exists project_collaborators_project_idx
  on public.project_collaborators (project_id);

alter table public.project_collaborators enable row level security;

-- Both sides can see the membership; the owner can revoke it and the
-- collaborator can leave. Those four verbs are the whole lifecycle.
drop policy if exists "select_project_collaborators" on public.project_collaborators;
create policy "select_project_collaborators" on public.project_collaborators
  for select using (auth.uid() = owner_id or auth.uid() = user_id);

drop policy if exists "delete_project_collaborators" on public.project_collaborators;
create policy "delete_project_collaborators" on public.project_collaborators
  for delete using (auth.uid() = owner_id or auth.uid() = user_id);

-- Membership checks for OTHER tables' policies. SECURITY DEFINER on
-- purpose: a policy subquery runs as the querying user, so ai_missions'
-- shared-select policy consulting project_collaborators directly would be
-- filtered by project_collaborators' own RLS — correct here, but fragile
-- (it works only while that table's select policy covers the same rows)
-- and one policy edit away from silent lockout. The function reads with
-- definer rights, takes the project id alone, and answers only for
-- auth.uid() — it cannot be pointed at another user.
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.project_collaborators
    where project_id = p_project_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_project_editor(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.project_collaborators
    where project_id = p_project_id and user_id = auth.uid() and role = 'editor'
  );
$$;

-- The grant that makes sharing real: collaborators can read the mission,
-- editors can update it. Insert and delete are NOT extended — the project
-- stays with the owner. These are additive permissive policies; the
-- owner's own policies above them are untouched.
drop policy if exists "select_shared_ai_missions" on public.ai_missions;
create policy "select_shared_ai_missions" on public.ai_missions
  for select using (public.is_project_member(id));

drop policy if exists "update_shared_ai_missions" on public.ai_missions;
create policy "update_shared_ai_missions" on public.ai_missions
  for update using (public.is_project_editor(id))
  with check (public.is_project_editor(id));

-- Activity. Append-only by construction: no update or delete policy
-- exists, so history cannot be rewritten by anyone, owner included.
create table if not exists public.collaboration_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ai_missions(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('invited', 'joined', 'revoked', 'left', 'step_completed', 'step_reopened')),
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists collaboration_activity_project_idx
  on public.collaboration_activity (project_id, created_at desc);

alter table public.collaboration_activity enable row level security;

drop policy if exists "select_collaboration_activity" on public.collaboration_activity;
create policy "select_collaboration_activity" on public.collaboration_activity
  for select using (
    auth.uid() in (select user_id from public.ai_missions where id = project_id)
    or public.is_project_member(project_id)
  );

-- Writers log only as themselves, and only into projects they belong to.
drop policy if exists "insert_collaboration_activity" on public.collaboration_activity;
create policy "insert_collaboration_activity" on public.collaboration_activity
  for insert with check (
    auth.uid() = actor_id
    and (
      auth.uid() in (select user_id from public.ai_missions where id = project_id)
      or public.is_project_member(project_id)
    )
  );

-- ============================================================================
-- V3 — Task 16: Instant Value on Day One.
--
-- Standalone, additive, idempotent. Safe to run on a project that already
-- has supabase_full_project_backup.sql applied.
--
-- THE ROOT PROBLEM THIS FIXES FIRST.
--
-- The headline promise of this feature is an insight like "your three
-- worst trades were all Monday morning". That sentence is impossible to
-- produce from this schema as it stood, and the reason is not the
-- analysis — it is the DATA MODEL. Every module table records only
-- `created_at`, the moment the row was written. Import 400 trades from a
-- CSV and all 400 share one timestamp, to the second. Every
-- time-of-week, month-over-month or trend pattern is then not merely
-- hard to find: it does not exist in the data at all, and any system
-- that reported one would be inventing it.
--
-- So `occurred_at` is added to the three tables where a real-world date
-- is the point of the row — when the trade was taken, when the money
-- moved, when the lead arrived. It is NULLABLE and nothing is
-- backfilled: an existing row genuinely does not know when it happened,
-- and writing `created_at` into it would be manufacturing a fact. Every
-- detector treats a null `occurred_at` as "not datable" and excludes it
-- from time-based analysis rather than guessing.
--
-- `finance_entries.counterparty` exists for the same reason. "40% of
-- your revenue comes from two clients" needs to know which client; a
-- free-text description is where a bookkeeping CSV puts a memo, not
-- reliably a name.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Real-world dates, and who the money was with.
-- ----------------------------------------------------------------------------
alter table public.trades add column if not exists occurred_at timestamptz;
alter table public.finance_entries add column if not exists occurred_at timestamptz;
alter table public.leads add column if not exists occurred_at timestamptz;

-- The counterparty: the client who paid, or the supplier who was paid.
alter table public.finance_entries add column if not exists counterparty text;

-- Partial indexes: the detectors only ever scan datable rows, and a row
-- with no occurred_at is excluded by every one of them.
create index if not exists trades_user_occurred_idx
  on public.trades (user_id, occurred_at)
  where occurred_at is not null;

create index if not exists finance_entries_user_occurred_idx
  on public.finance_entries (user_id, occurred_at)
  where occurred_at is not null;

create index if not exists finance_entries_user_counterparty_idx
  on public.finance_entries (user_id, counterparty)
  where counterparty is not null;

create index if not exists leads_user_occurred_idx
  on public.leads (user_id, occurred_at)
  where occurred_at is not null;

-- ----------------------------------------------------------------------------
-- user_imports — one row per import, whatever the source.
--
-- Exists so that "what did this thing put in my account, and can I undo
-- it" is answerable. An import writes into a dozen module tables at
-- once; without a record of which rows came from which import, an
-- account that imported the wrong file has no way back except deleting
-- rows by hand.
-- ----------------------------------------------------------------------------
create table if not exists public.user_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  --   csv       — a spreadsheet the user uploaded
  --   paste     — free text the user pasted
  --   quick_add — the short question flow
  --   gmail | google_drive — pulled through a V3 Task 3 integration
  source text not null check (source in ('csv', 'paste', 'quick_add', 'gmail', 'google_drive')),

  -- Display only, sanitised. Never used to build a path.
  filename text,
  rows_imported integer not null default 0,
  rows_rejected integer not null default 0,
  -- { "<table>": <count> } — what landed where.
  modules jsonb not null default '{}'::jsonb,
  -- The column mapping that was actually applied, so a wrong import is
  -- explainable rather than mysterious.
  mapping jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_imports_user_created_idx
  on public.user_imports (user_id, created_at desc);

alter table public.user_imports enable row level security;

drop policy if exists "select_own_user_imports" on public.user_imports;
create policy "select_own_user_imports" on public.user_imports
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_imports" on public.user_imports;
create policy "insert_own_user_imports" on public.user_imports
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete_own_user_imports" on public.user_imports;
create policy "delete_own_user_imports" on public.user_imports
  for delete using (auth.uid() = user_id);

-- Every imported row carries the import it came from, so "undo this
-- import" is one delete per table rather than a guess based on
-- timestamps. Nullable: rows created by hand have no import.
alter table public.ideas            add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.competitors      add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.research         add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.finance_entries  add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.learning_entries add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.trades           add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.decisions        add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.products         add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.content          add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.leads            add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.feedback         add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.metrics          add column if not exists import_id uuid references public.user_imports(id) on delete set null;

-- ----------------------------------------------------------------------------
-- user_insights — the "here is what I found" list.
--
-- The evidence is stored ALONGSIDE the sentence, and that is the whole
-- design. An insight is a claim about somebody's business; if the
-- numbers behind it are not kept, nobody — including us — can ever check
-- whether it was true. `evidence` holds the computed facts the sentence
-- was written from, and `detector` names the code that produced them.
-- ----------------------------------------------------------------------------
create table if not exists public.user_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_id uuid references public.user_imports(id) on delete set null,

  -- Which deterministic detector found the pattern. NOT free text: an
  -- insight whose provenance is a model's imagination has no place here,
  -- and a fixed vocabulary is what makes that enforceable.
  detector text not null,
  -- Where the user should go to see it for themselves.
  module_slug text,

  headline text not null,
  detail text not null,
  -- The numbers. { "sampleSize": 41, "share": 0.62, ... } — whatever the
  -- detector measured, so the claim is auditable after the fact.
  evidence jsonb not null default '{}'::jsonb,
  -- How much of the user's data the pattern rests on. Shown, not hidden:
  -- a pattern in nine rows is a hint, and saying so is the difference
  -- between an insight and a horoscope.
  sample_size integer not null default 0,

  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);

create index if not exists user_insights_user_created_idx
  on public.user_insights (user_id, created_at desc);

create index if not exists user_insights_user_active_idx
  on public.user_insights (user_id, created_at desc)
  where dismissed_at is null;

alter table public.user_insights enable row level security;

drop policy if exists "select_own_user_insights" on public.user_insights;
create policy "select_own_user_insights" on public.user_insights
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_insights" on public.user_insights;
create policy "insert_own_user_insights" on public.user_insights
  for insert with check (auth.uid() = user_id);

-- Dismiss is an UPDATE the owner makes. Deliberately no DELETE policy:
-- an insight is dismissed, not erased, so the same pattern is not
-- re-reported to somebody who has already said they know.
drop policy if exists "update_own_user_insights" on public.user_insights;
create policy "update_own_user_insights" on public.user_insights
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- user_onboarding — one row per user, created on first sight.
--
-- Holds the two facts the flow needs to not repeat itself: whether the
-- user has finished (or skipped) it, and whether the one FREE import and
-- analysis has been spent.
--
-- The free run is an activation investment, and it has to be recorded
-- server-side on a table the user cannot write the flag on. `activation_used_at`
-- is therefore only ever set by the service-role client — the owner's
-- UPDATE policy exists for the flow's own progress fields, and the API
-- writes the billing flag with the admin client so a crafted request
-- cannot un-spend it.
-- ----------------------------------------------------------------------------
create table if not exists public.user_onboarding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- What the user said they wanted to do, from the first step.
  goal text,
  completed_at timestamptz,
  skipped_at timestamptz,
  -- Set once, by the server, when the free import+analysis is consumed.
  activation_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_onboarding enable row level security;

drop policy if exists "select_own_user_onboarding" on public.user_onboarding;
create policy "select_own_user_onboarding" on public.user_onboarding
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_onboarding" on public.user_onboarding;
create policy "insert_own_user_onboarding" on public.user_onboarding
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_user_onboarding" on public.user_onboarding;
create policy "update_own_user_onboarding" on public.user_onboarding
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.user_onboarding;
create trigger set_updated_at before update on public.user_onboarding
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Claiming the one free activation run.
--
-- A conditional UPDATE rather than a read-then-write, for the same
-- reason every other claim in this schema is one: two requests that both
-- read "not used yet" would both get a free run. `where activation_used_at
-- is null` makes exactly one of them win, in the database, and the
-- caller finds out which by whether a row came back.
--
-- SECURITY DEFINER and granted only to service_role: the flag decides
-- whether real money is spent for free, so the client must not be able
-- to reach it even though it owns the row.
-- ----------------------------------------------------------------------------
create or replace function public.claim_activation_run(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed integer;
begin
  insert into public.user_onboarding (user_id)
    values (target_user_id)
    on conflict (user_id) do nothing;

  update public.user_onboarding
    set activation_used_at = now()
    where user_id = target_user_id
      and activation_used_at is null;

  get diagnostics claimed = row_count;
  return claimed > 0;
end;
$$;

revoke all on function public.claim_activation_run(uuid) from public;
revoke all on function public.claim_activation_run(uuid) from anon;
revoke all on function public.claim_activation_run(uuid) from authenticated;
grant execute on function public.claim_activation_run(uuid) to service_role;

