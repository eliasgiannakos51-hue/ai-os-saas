-- ============================================================================
-- The affiliate programme.
--
-- Standalone, additive, idempotent.
--
-- FOUR TABLES, AND THE MONEY RULES ARE IN THE INDEXES.
--
-- Every anti-fraud rule in lib/affiliate/rules.ts is also a database
-- constraint here, on purpose. A rule enforced only in application code is
-- enforced until the next code path — and the code paths that touch this
-- data are a webhook, a cron and a signup handler, three places that can
-- each be reached twice for the same event. The constraints are what make
-- "paid once" true rather than intended:
--
--   affiliate_referrals.referred_user_id  UNIQUE
--     One referrer per person, ever. Re-attribution would reset
--     converted_at and hand out a fresh twelve months of commission, which
--     is the cheapest way to farm this programme.
--
--   affiliate_commissions.stripe_invoice_id UNIQUE
--     One commission per invoice. A replayed webhook, a retried delivery
--     and two events describing the same payment all collapse to one row.
--
--   affiliates.user_id UNIQUE
--     One affiliate account per user.
--
-- NOBODY CAN WRITE ANY OF IT FROM A BROWSER. Every table has a select
-- policy scoped to the owner and no insert, update or delete policy at
-- all: this is money, and the only writers are the service-role paths that
-- have a Stripe event or a verified session behind them.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- affiliates — one row per participant.
-- ----------------------------------------------------------------------------
create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,

  -- The code in the share link (/r/<code>). Uppercase, no 0/O/1/I/L — see
  -- lib/affiliate/rules.ts for why: this gets read off a screen and spoken
  -- down a phone.
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),

  -- 0.20-0.30, the band the programme promises. The CHECK is the backstop
  -- for clampRate(): a rate outside the band is a configuration mistake
  -- and it must not be storable, not merely un-writable by today's code.
  commission_rate numeric(4, 3) not null default 0.250
    check (commission_rate >= 0.200 and commission_rate <= 0.300),

  status text not null default 'active' check (status in ('active', 'suspended')),
  -- Recorded when suspended, because "why is this person not being paid"
  -- must have an answer that is not "somebody remembers".
  suspended_reason text,

  -- Stripe Connect (Express). Null until the affiliate has been through
  -- onboarding. payouts_enabled mirrors Stripe's OWN flag, which only goes
  -- true once identity and bank details are verified — never set by us
  -- from anything other than a Stripe response.
  stripe_account_id text unique,
  payouts_enabled boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists affiliates_status_idx on public.affiliates (status);

alter table public.affiliates enable row level security;

drop policy if exists "select_own_affiliate" on public.affiliates;
create policy "select_own_affiliate" on public.affiliates
  for select using (auth.uid() = user_id);
-- No insert/update/delete policy. Joining the programme, changing a rate
-- and suspending an account are all server-side actions.

-- ----------------------------------------------------------------------------
-- affiliate_referrals — who was referred by whom.
-- ----------------------------------------------------------------------------
create table if not exists public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,

  -- UNIQUE, and this is the single most important line in the file.
  -- First touch wins and it wins permanently.
  --
  -- ON DELETE CASCADE rather than SET NULL: if the referred person deletes
  -- their account, the record of having referred them goes too. Keeping a
  -- row that says "this affiliate referred the person who used to be
  -- user X" would be retaining a relationship about someone who asked to
  -- be forgotten. Commissions already PAID are unaffected — those live in
  -- Stripe's own ledger.
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,

  -- The code as it was used, kept even if the affiliate later rotates it.
  code text not null,

  --   pending   — signed up, has not paid for anything yet
  --   converted — first paid invoice; the twelve-month clock starts HERE
  --   void      — reversed for fraud or a refund
  status text not null default 'pending' check (status in ('pending', 'converted', 'void')),
  void_reason text,

  created_at timestamptz not null default now(),
  converted_at timestamptz
);

create index if not exists affiliate_referrals_affiliate_idx
  on public.affiliate_referrals (affiliate_id, created_at desc);

alter table public.affiliate_referrals enable row level security;

-- The AFFILIATE can see their own referrals. Note what this policy does
-- NOT do: it never exposes the referred person's identity to them. Only
-- the row's own columns are readable, and the only identifier in them is a
-- uuid — the dashboard renders counts and dates, never an email.
drop policy if exists "select_own_affiliate_referrals" on public.affiliate_referrals;
create policy "select_own_affiliate_referrals" on public.affiliate_referrals
  for select using (
    affiliate_id in (select id from public.affiliates where user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- affiliate_commissions — one row per paid invoice that earned something.
-- ----------------------------------------------------------------------------
create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  referral_id uuid not null references public.affiliate_referrals(id) on delete cascade,

  -- UNIQUE. The webhook that writes these can be delivered more than once
  -- for the same payment; Stripe says so in its own documentation. This is
  -- what makes the second delivery a no-op instead of a second payment.
  stripe_invoice_id text not null unique,

  -- Integers, in cents. Floating-point euros are how a programme ends up
  -- transferring 4.999999999 to somebody.
  invoice_amount_cents integer not null check (invoice_amount_cents > 0),
  commission_cents integer not null check (commission_cents > 0),
  rate numeric(4, 3) not null,
  -- 1-12. Which month of the twelve-month window this invoice fell in;
  -- stored rather than derived so an old row still reports what it was
  -- paid for after the window rules change.
  period_month integer not null check (period_month between 1 and 12),

  --   accrued  — owed, not yet sent
  --   paid     — included in a payout
  --   reversed — the underlying payment was refunded or disputed
  status text not null default 'accrued' check (status in ('accrued', 'paid', 'reversed')),
  payout_id uuid,

  created_at timestamptz not null default now()
);

create index if not exists affiliate_commissions_affiliate_status_idx
  on public.affiliate_commissions (affiliate_id, status);
create index if not exists affiliate_commissions_referral_idx
  on public.affiliate_commissions (referral_id, created_at desc);

alter table public.affiliate_commissions enable row level security;

drop policy if exists "select_own_affiliate_commissions" on public.affiliate_commissions;
create policy "select_own_affiliate_commissions" on public.affiliate_commissions
  for select using (
    affiliate_id in (select id from public.affiliates where user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- affiliate_payouts — money actually sent.
-- ----------------------------------------------------------------------------
create table if not exists public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  -- Stripe's transfer id, once the transfer succeeded. Unique for the same
  -- reason the invoice id is.
  stripe_transfer_id text unique,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  failure_reason text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists affiliate_payouts_affiliate_idx
  on public.affiliate_payouts (affiliate_id, created_at desc);

alter table public.affiliate_payouts enable row level security;

drop policy if exists "select_own_affiliate_payouts" on public.affiliate_payouts;
create policy "select_own_affiliate_payouts" on public.affiliate_payouts
  for select using (
    affiliate_id in (select id from public.affiliates where user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- The one thing that genuinely needs to be atomic.
--
-- A payout marks N commission rows as paid AND creates the payout row. Two
-- concurrent payout runs (a retried cron, a manual trigger during a
-- scheduled one) would otherwise both read the same accrued rows and both
-- send the money. Doing the claim in a single statement inside a function
-- means the second run finds nothing to claim.
--
-- Returns the total claimed, in cents — zero when another run got there
-- first, which the caller treats as "nothing to pay".
-- ----------------------------------------------------------------------------
create or replace function public.claim_affiliate_commissions(
  p_affiliate_id uuid,
  p_payout_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
begin
  with claimed as (
    update public.affiliate_commissions
       set status = 'paid', payout_id = p_payout_id
     where affiliate_id = p_affiliate_id
       and status = 'accrued'
    returning commission_cents
  )
  select coalesce(sum(commission_cents), 0) into total from claimed;
  return total;
end;
$$;

revoke all on function public.claim_affiliate_commissions(uuid, uuid) from public;
revoke all on function public.claim_affiliate_commissions(uuid, uuid) from anon;
revoke all on function public.claim_affiliate_commissions(uuid, uuid) from authenticated;
grant execute on function public.claim_affiliate_commissions(uuid, uuid) to service_role;

drop trigger if exists set_updated_at on public.affiliates;
create trigger set_updated_at before update on public.affiliates
  for each row execute function public.set_updated_at();
