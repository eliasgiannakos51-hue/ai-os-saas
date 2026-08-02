-- ============================================================================
-- Ionexa AI — Credits system schema
-- Run this once in the Supabase SQL editor, AFTER supabase_schema.sql, on
-- the same project. Additive only — does not touch or drop any existing
-- table.
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
