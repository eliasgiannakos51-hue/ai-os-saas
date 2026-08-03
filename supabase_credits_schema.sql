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

-- ============================================================================
-- deduct_credits_atomic — fixes a real credits race condition: the
-- previous deductCredits() implementation (lib/billing/credits.ts) did a
-- plain SELECT credits_remaining, checked it in application code, then a
-- separate UPDATE — two concurrent requests (two tabs, two fast clicks
-- across different features) could both SELECT the same balance, both
-- pass the "enough credits?" check, and both UPDATE, silently losing one
-- of the two deductions (or letting the balance go negative depending on
-- exact timing). A single UPDATE statement whose WHERE clause and SET
-- expression both reference the CURRENT row value is atomic under
-- Postgres's row-level locking — two concurrent calls for the same user
-- are serialized by the database itself, so this is a genuine fix, not
-- just a narrower race window. Also atomically initializes a first-time
-- user's row (upsert-then-decrement) so the same race can't occur on
-- account creation either.
-- ============================================================================

create or replace function public.deduct_credits_atomic(
  p_user_id uuid,
  p_amount integer,
  p_initial_credits integer,
  p_plan_tier text
)
returns table(ok boolean, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  insert into public.user_credits (user_id, credits_remaining, credits_total, plan_tier)
  values (p_user_id, p_initial_credits, p_initial_credits, p_plan_tier)
  on conflict (user_id) do nothing;

  update public.user_credits
  set credits_remaining = credits_remaining - p_amount
  where user_id = p_user_id and credits_remaining >= p_amount
  returning credits_remaining into v_remaining;

  if v_remaining is null then
    select credits_remaining into v_remaining from public.user_credits where user_id = p_user_id;
    return query select false, coalesce(v_remaining, 0);
  else
    return query select true, v_remaining;
  end if;
end;
$$;
