-- Ionexa Payments: coupons/discounts table.
-- Sellers create coupons for their own customers. Each coupon is also
-- a Stripe Coupon on the seller's connected account.
--
-- How to undo: drop table public.payments_coupons cascade;

create table if not exists public.payments_coupons (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.payments_accounts(id) on delete cascade,
  code text not null,
  stripe_coupon_id text not null,
  percent_off numeric,
  amount_off_cents integer,
  currency text not null default 'eur',
  duration text not null default 'once'
    check (duration in ('once','repeating','forever')),
  duration_months integer,
  max_redemptions integer,
  times_redeemed integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint uq_payments_coupons_user_code unique(user_id, code)
);

-- Index for user queries.
create index if not exists idx_payments_coupons_user
  on public.payments_coupons(user_id, is_active);

-- RLS: deny all by default.
alter table public.payments_coupons enable row level security;

-- @service-role-justified: coupons are created/listed through API routes
-- that verify ownership via the auth session. No direct client access.
revoke all on public.payments_coupons from anon, authenticated;
