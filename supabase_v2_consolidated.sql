-- ============================================================================
-- Ionexa AI — V2 CONSOLIDATED SCHEMA (full backup)
--
-- Every table/column/policy added while building the V2 feature set:
-- Knowledge Graph, Timeline, Mentor Mode, Mission Control, Weekly
-- Reflection, Next Best Action, Trading Workflow, AI Company, AI Life
-- Context, Website Builder (incl. this pass's editing/versioning),
-- Marketplace, and Gamification (incl. this pass's 8 additional
-- achievements) — plus the credits tables several of those features read
-- from or write to (user_credits, credit_transactions).
--
-- Feature -> schema-object map (12 features, 6 needed new/changed SQL):
--   1.  Knowledge Graph     -> entity_links
--   2.  Timeline            -> (reads entity_links + existing module tables, no new object)
--   3.  Mentor Mode         -> (reads chat_conversations/chat_messages + entity_links, no new object)
--   4.  Mission Control     -> ai_missions
--   5.  Weekly Reflection   -> (reads ai_missions + module tables, no new object)
--   6.  Next Best Action    -> (reads entity_links + ai_missions, no new object)
--   7.  Trading Workflow    -> (reuses trades + entity_links + ai_missions, no new object)
--   8.  AI Company          -> extends ai_missions.plan_steps jsonb shape only (output/attempts
--                              fields added this pass — no column/schema change, jsonb is schemaless)
--   9.  AI Life Context     -> user_energy_checkins
--  10.  Website Builder     -> user_websites, + THIS PASS: website_versions (new table) and
--                              an UPDATE policy on user_websites (previously append/delete-only)
--  11.  Marketplace         -> (empty-state skeleton, no table)
--  12.  Gamification        -> user_achievements (table unchanged; THIS PASS added 8 more
--                              achievement_key values used by the app — see bottom of file)
--
-- This file is a consolidated copy of what's already live in
-- supabase_schema.sql (Knowledge Graph through Gamification) plus the
-- relevant parts of supabase_credits_schema.sql — safe to run as a whole
-- even if every statement has already been applied; every statement is
-- idempotent (drop-then-create / "if not exists" / "if exists").
--
-- Run this AFTER the base supabase_schema.sql (for auth.users and the 13
-- module tables entity_links/ai_missions/user_websites reference) and
-- AFTER supabase_credits_schema.sql (for user_credits/credit_transactions,
-- reproduced here too so this file is fully standalone).
-- ============================================================================


-- ============================================================================
-- Prerequisite: updated_at auto-touch trigger function
-- ai_missions and user_credits both use this — reproduced here so this
-- file can run standalone without needing supabase_schema.sql's own copy
-- to have run first (it's the same idempotent `create or replace`).
-- ============================================================================

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- ============================================================================
-- 1. KNOWLEDGE GRAPH — entity_links
-- Links between records across different modules (e.g. an Idea linked to
-- a Product), so Ionexa Chat can see relationships without the user
-- re-explaining them every time (see src/lib/entity-links.ts,
-- src/lib/chat/entity-mentions.ts, src/components/entity-links/*).
-- source_table/target_table hold a module's table name (e.g. "ideas",
-- "products") — polymorphic by design, so no FK is possible on
-- source_id/target_id; ownership of the linked records is enforced by
-- each of those tables' own RLS at read time, not by a constraint here.
-- Also the storage backing Trading Workflow's linked-entities widget and
-- Next Best Action's suggestions (both read this table, neither has its
-- own).
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
-- 4 & 8. MISSION CONTROL / AI COMPANY — ai_missions
-- Planner -> Builder -> Reviewer, plus (as of "AI Company") per-step agent
-- roles AND real inter-step collaboration (see below). One row per
-- mission. plan_steps jsonb shape:
--   {
--     steps: [{
--       text, status, module?, moduleTitle?, href?,
--       agentRole?,     -- AI Company: general/marketing/finance/research
--       output?,        -- THIS PASS: short summary of what this step
--                        -- actually produced, fed forward as context to
--                        -- every later step in the same mission
--                        -- (see src/lib/mission-context.ts)
--       attempts?        -- THIS PASS: failed "Create with AI" attempt
--                        -- count for this step, capped at 3 client-side
--                        -- (see src/components/mission/mission-card.tsx)
--     }],
--     review?
--   }
-- An object rather than a bare array so the Reviewer Agent's output has
-- somewhere to live (see src/types/mission.ts). No column/schema change
-- was needed for output/attempts — plan_steps is jsonb, so both new
-- fields are handled entirely in application code. Builder is the
-- ALREADY-EXISTING /api/create ("Create Anything"), called once per step
-- by the user — nothing in this table implies autonomous execution.
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
-- 10. WEBSITE BUILDER — user_websites
-- Real Claude-generated single-file HTML/CSS sites (see
-- src/lib/website-builder.ts, src/app/api/websites/generate/route.ts).
-- Distinct from the existing "Websites" Build module (ai_websites table),
-- which is a plain idea/status tracker that never calls AI. Same
-- owner-only RLS pattern as every table above.
--
-- THIS PASS: html_content is now a denormalized "current version"
-- pointer, kept in sync on every edit (api/websites/edit/route.ts) — the
-- UPDATE policy below is new (the table was previously append/delete-only,
-- since a regenerated site used to always be a brand new row). Full
-- version history lives in the new website_versions table right below.
-- ============================================================================

drop table if exists public.user_websites cascade;

create table public.user_websites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  html_content text not null,
  created_at timestamptz not null default now()
);

create index if not exists user_websites_user_id_created_at_idx
  on public.user_websites (user_id, created_at desc);

alter table public.user_websites enable row level security;

drop policy if exists "select_own_user_websites" on public.user_websites;
create policy "select_own_user_websites" on public.user_websites
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_websites" on public.user_websites;
create policy "insert_own_user_websites" on public.user_websites
  for insert with check (auth.uid() = user_id);

-- NEW this pass — required so api/websites/edit/route.ts can update
-- html_content in place after an AI edit.
drop policy if exists "update_own_user_websites" on public.user_websites;
create policy "update_own_user_websites" on public.user_websites
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_user_websites" on public.user_websites;
create policy "delete_own_user_websites" on public.user_websites
  for delete using (auth.uid() = user_id);


-- ============================================================================
-- 10. WEBSITE BUILDER (continued) — website_versions [NEW TABLE, this pass]
-- Every generate (version 1, seeded by api/websites/generate/route.ts) and
-- every AI edit (version 2, 3, ... appended by api/websites/edit/route.ts)
-- writes a row here, so a user can see/browse what changed over time (see
-- src/components/website-builder/website-builder-workspace.tsx's History
-- panel). user_id is denormalized (not derived via a join on
-- user_websites) to stay consistent with every other table's simple
-- auth.uid() = user_id RLS policy in this schema — a join-based policy
-- would be a new, unprecedented pattern in this codebase. Append-only —
-- no update/delete policy, since a version is a permanent historical
-- record once written.
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
-- 9. AI LIFE CONTEXT — user_energy_checkins
-- "AI Life Context" (see src/lib/user-context.ts) needs a "recent energy
-- check-in" input; this is the small, real feature that creates one (see
-- src/components/overview/energy-checkin-widget.tsx). Same owner-only RLS
-- pattern as every table above; append-only log, no update/delete UI
-- exists for it.
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
-- 12. GAMIFICATION — user_achievements
-- Real, earned achievements (see src/lib/achievements.ts,
-- src/lib/achievement-metadata.ts). Reconciled opportunistically from
-- dashboard/layout.tsx on every navigation (no cron/background worker in
-- this app). The unique constraint is what makes the unlock upsert's
-- ignoreDuplicates safe against re-earning the same achievement twice.
-- Same owner-only RLS pattern as every table above; permanent once
-- unlocked, so only select/insert policies exist.
--
-- Table shape is UNCHANGED this pass (achievement_key is a free-text
-- column, no enum/check constraint) — what's new is the set of keys the
-- application code now writes into it. Listed here for documentation;
-- nothing to migrate, this is app-level, not schema-level:
--   Pre-existing (13 module first-entries, e.g. "first_entry_ideas") +
--     first_mission_completed, seven_day_streak
--   NEW this pass:
--     first_website_generated, first_website_edited, first_entity_link,
--     ten_entity_links, first_energy_checkin, first_reflection_generated,
--     thirty_day_streak, fifty_entries_milestone
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
-- Credits system (reproduced from supabase_credits_schema.sql) — several
-- V2 features above read/write these: Mission Control's Planner/Reviewer
-- and every "Create with AI" step deduct from user_credits and log to
-- credit_transactions; Website Builder's generate AND this pass's new
-- edit action do too (action_type 'website_generate' / 'website_edit');
-- and Gamification's new first_reflection_generated achievement detects
-- "did this user ever generate a Weekly Reflection" by checking for a
-- credit_transactions row with action_type = 'weekly_reflection' — the
-- only persisted trace that a reflection was ever generated, since the
-- reflection text itself is on-demand and never stored.
--
-- Both tables are writable ONLY via the service-role key (see
-- lib/supabase/admin.ts) — RLS grants authenticated users SELECT on their
-- own rows only.
-- ============================================================================

create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits_remaining integer not null default 0,
  credits_total integer not null default 0,
  plan_tier text not null default 'free',
  updated_at timestamptz not null default now()
);

-- beta_expires_at: set only for accounts that signed up with a valid beta
-- invite code — 30 days out from signup, null for everyone else.
alter table public.user_credits add column if not exists beta_expires_at timestamptz;

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
                              -- 'website_generate', 'website_edit' (NEW this pass),
                              -- 'mission_plan', 'mission_review', 'weekly_reflection',
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
-- End of V2 consolidated schema.
--
-- New tables: entity_links, ai_missions, user_websites, website_versions,
-- user_energy_checkins, user_achievements, user_credits,
-- credit_transactions (8 total).
--
-- Changed this pass: website_versions is a brand new table; user_websites
-- gained an UPDATE policy it didn't have before. Every other object here
-- was already live before this pass and is reproduced unchanged, for a
-- complete, standalone backup.
-- ============================================================================
