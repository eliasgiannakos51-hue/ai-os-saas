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
