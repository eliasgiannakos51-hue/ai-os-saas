-- Ionexa Payments: subscriptions table.
-- Tracks recurring subscriptions that the Ionexa user's CUSTOMERS have.
-- The seller (user_id) sees these; their customer interacts via Stripe.
--
-- How to undo: drop table public.payments_subscriptions cascade;

create table if not exists public.payments_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.payments_accounts(id) on delete cascade,
  product_id uuid not null references public.payments_products(id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_customer_id text not null,
  customer_email text,
  customer_name text,
  status text not null default 'active'
    check (status in ('active','past_due','canceled','trialing','paused','unpaid')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default now(),
  cancel_at_period_end boolean not null default false,
  trial_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for user queries (dashboard).
create index if not exists idx_payments_subscriptions_user
  on public.payments_subscriptions(user_id, status);

-- Index for webhook lookups by Stripe subscription ID.
create index if not exists idx_payments_subscriptions_stripe
  on public.payments_subscriptions(stripe_subscription_id);

-- RLS: deny all by default — all access through service role.
alter table public.payments_subscriptions enable row level security;

-- No RLS policies: the table is accessed only through the admin client
-- (service role). @service-role-justified: subscriptions are written by
-- webhooks (no user session) and read by the dashboard through the
-- payments API routes, which verify user ownership.
revoke all on public.payments_subscriptions from anon, authenticated;
