-- ============================================================================
-- REVENUE ENGINE AND THE NUMBERS BEHIND IT (V4 #25 + #26)
-- ============================================================================
--
-- ----------------------------------------------------------------------
-- THE MRR QUESTION, ANSWERED FIRST — BECAUSE IT WAS ALREADY ANSWERED
-- ----------------------------------------------------------------------
-- "subscription_tier lives in auth user_metadata, so we need a table or a
-- view." Half of that is already built and the other half is the wrong
-- shape, so it is worth being exact about which is which.
--
-- WHAT EXISTS. 20260823000000_cost_alerts.sql added public.mrr_inputs(),
-- a SECURITY DEFINER aggregate over auth.users returning
-- (tier, billing_interval, subscribers, seats). It is deliberately NOT a
-- table: a subscriptions table would be a SECOND source of truth for the
-- fact that gates features, and two sources disagree exactly at a plan
-- change, which is when a revenue figure matters most. It is deliberately
-- NOT a view either: a view over auth.users exposes one row per user and
-- then has to be locked down; an aggregate function cannot enumerate
-- customers even if its grants were loosened by accident.
--
-- So "what is MRR right now" needs nothing new. #16's 2% alert is not
-- blocked on schema — it reads mrr_inputs() today.
--
-- WHAT DOES NOT EXIST, and genuinely needs tables: HISTORY.
-- auth.users holds the CURRENT tier and nothing else. It cannot answer
-- "what was MRR 30 days ago", "who cancelled last month", "did the
-- accounts that stayed spend more or less" — and churn, retention, NRR,
-- LTV, payback and every 30/90-day trend are questions about the past.
-- No view over a table with no history can produce one.
--
-- Hence the two tables below, and the rule they follow: they are a LOG,
-- never an authority. Nothing reads them to decide what a customer may
-- do. If they disagree with auth.users, auth.users is right and the log
-- has a gap — which is a reporting problem, not an entitlement one.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

-- ----------------------------------------------------------------------
-- 1. subscription_events — what changed, when
-- ----------------------------------------------------------------------
-- Written by the Stripe webhook at the one moment both the old and the
-- new tier are known. That moment already exists in the code: the webhook
-- reads previousTier BEFORE overwriting it, to decide whether to reset
-- credits. Recording the transition there costs one insert and is the
-- only place it can be done without guessing.
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- What happened, in revenue terms rather than in Stripe's terms. Stripe
  -- says "customer.subscription.updated" for a card change and for an
  -- upgrade; only one of those is revenue.
  kind text not null check (kind in ('started', 'upgraded', 'downgraded', 'cancelled', 'reactivated', 'seats_changed', 'interval_changed')),

  from_tier text,
  to_tier text,
  from_interval text,
  to_interval text,
  from_seats int,
  to_seats int,

  -- Monthly euros before and after, computed in TypeScript from
  -- lib/billing/plans.ts. Stored so a historical figure survives a PRICE
  -- CHANGE: re-deriving last March's MRR from today's price list would
  -- rewrite history every time the pricing page changes.
  from_mrr_eur numeric(10, 2),
  to_mrr_eur numeric(10, 2),

  -- IDEMPOTENCE. Stripe retries; a retried webhook must not become a
  -- second cancellation in the churn count.
  stripe_event_id text unique,

  at timestamptz not null default now()
);

create index if not exists subscription_events_at_idx on public.subscription_events (at desc);
create index if not exists subscription_events_user_idx on public.subscription_events (user_id, at desc);

alter table public.subscription_events enable row level security;

-- OWNER-ONLY, and that means the BUSINESS owner, not the row's user. A
-- customer has no reason to read the churn log, and it is the raw
-- material of a revenue dashboard rather than of their account. There is
-- deliberately no select policy at all: only the service-role client
-- reads it, and admin-ness is decided in TypeScript by isAdminEmail —
-- the same gate the margin report already uses, rather than a second
-- notion of "owner" living in the database.
revoke all on public.subscription_events from anon, authenticated;

-- ----------------------------------------------------------------------
-- 2. subscriber_months — one row per paying account per month
-- ----------------------------------------------------------------------
-- THE TABLE CHURN AND NRR ACTUALLY NEED.
--
-- Churn is "how many of the accounts that were paying at the start are
-- not paying now", and NRR is "what did the accounts that stayed do to
-- their spend". Both are comparisons between two months, per account.
-- An aggregate cannot answer either: two months with the same subscriber
-- count can be the same twenty customers or forty, with twenty of them
-- gone.
create table if not exists public.subscriber_months (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Always the first of the month, so a month is one value rather than a
  -- range everything has to agree on.
  month date not null,

  tier text not null,
  billing_interval text not null default 'month',
  seats int not null default 1,
  -- Monthly recurring euros for this account in this month. Annual
  -- subscribers are divided down, which is what makes MRR comparable.
  mrr_eur numeric(10, 2) not null default 0,

  updated_at timestamptz not null default now(),

  primary key (user_id, month),
  constraint subscriber_months_first_of_month check (extract(day from month) = 1)
);

create index if not exists subscriber_months_month_idx on public.subscriber_months (month, mrr_eur desc);

alter table public.subscriber_months enable row level security;
revoke all on public.subscriber_months from anon, authenticated;

-- ----------------------------------------------------------------------
-- 3. revenue_snapshots — one row per day
-- ----------------------------------------------------------------------
-- The 30- and 90-day trend. Deliberately small and deliberately
-- AGGREGATE: a daily per-user copy would be a second per-user revenue
-- table and would grow without bound.
create table if not exists public.revenue_snapshots (
  day date primary key,

  mrr_eur numeric(12, 2) not null default 0,
  arr_eur numeric(12, 2) not null default 0,
  paying_subscribers int not null default 0,
  total_accounts int not null default 0,

  -- What the day's AI actually cost us, from ai_cost_log. The other half
  -- of gross margin, and the only cost this database can see by itself.
  ai_cost_eur numeric(12, 4) not null default 0,
  credits_charged bigint not null default 0,

  -- The raw tier breakdown, kept so a mistake in the euro arithmetic can
  -- be recomputed from the day's real counts rather than being lost.
  tiers jsonb not null default '[]'::jsonb,

  -- TRUE when at least one subscriber was on a tier with no listed price
  -- (today only "enterprise"). A dashboard that cannot say "this number
  -- is incomplete" reports a smaller MRR than the real one and calls it
  -- the MRR.
  incomplete boolean not null default false,

  taken_at timestamptz not null default now()
);

alter table public.revenue_snapshots enable row level security;
revoke all on public.revenue_snapshots from anon, authenticated;

-- ----------------------------------------------------------------------
-- 4. business_inputs — the numbers this database cannot know
-- ----------------------------------------------------------------------
-- CAC needs marketing spend. Burn needs salaries, hosting and everything
-- else that is not an AI call. Runway needs a bank balance. None of the
-- three is in this product, and none can be derived from anything that
-- is.
--
-- The alternative to this table was showing a CAC computed from zero
-- marketing spend, which is a number that looks like a metric and is a
-- lie. So the owner enters what only they know, per month, and any
-- metric whose inputs are missing SAYS SO instead of rendering a figure.
create table if not exists public.business_inputs (
  month date primary key,

  -- Everything spent to acquire customers in this month.
  marketing_spend_eur numeric(12, 2),
  -- Everything that is not marketing and not AI: salaries, hosting,
  -- tools, accounting.
  fixed_costs_eur numeric(12, 2),
  -- Cash in the bank at the END of this month. Runway is cash / burn, and
  -- a runway from a stale balance is worse than none.
  cash_balance_eur numeric(12, 2),

  note text,
  updated_at timestamptz not null default now(),

  constraint business_inputs_first_of_month check (extract(day from month) = 1),
  constraint business_inputs_non_negative check (
    coalesce(marketing_spend_eur, 0) >= 0
    and coalesce(fixed_costs_eur, 0) >= 0
    and coalesce(cash_balance_eur, 0) >= 0
  )
);

alter table public.business_inputs enable row level security;
revoke all on public.business_inputs from anon, authenticated;

-- ----------------------------------------------------------------------
-- 5. usage_overage_settings — consent that cannot be implied
-- ----------------------------------------------------------------------
-- THE DEFAULT IS OFF, AND THAT IS THE WHOLE FEATURE.
--
-- "Continue at EUR0.03/credit?" is a question, and the only safe answer
-- to a question nobody asked is no. `enabled` defaults false, and there
-- is no code path that sets it except the route the user's own click
-- reaches — so an account that never saw the dialog cannot be charged a
-- cent above its plan, whatever else goes wrong.
create table if not exists public.usage_overage_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,

  enabled boolean not null default false,

  -- THE USER'S OWN CEILING, in euros per calendar month. Not optional:
  -- consent to "keep going" without a limit is consent to an unbounded
  -- bill, which nobody means.
  monthly_cap_eur numeric(10, 2),

  -- THE PRICE THEY AGREED TO, snapshotted. If the list price changes, an
  -- account that consented at EUR0.03 keeps being charged EUR0.03 until
  -- they consent again — a price rise applied to standing consent is a
  -- charge nobody agreed to.
  price_per_credit_eur numeric(10, 4),

  -- When, and to what. The version is bumped when the terms change, and
  -- a stale version means consent has to be taken again rather than
  -- assumed to carry over.
  consented_at timestamptz,
  consent_version int,

  -- Set when the 80% and 100% warnings for the CURRENT month were sent,
  -- so a cron cannot send them again every ten minutes.
  warned_80_month date,
  warned_100_month date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- ENABLED IMPLIES ALL THREE. A row that says "on" with no cap, no price
  -- and no consent timestamp is a row that can charge somebody an
  -- unbounded amount at an unagreed rate — the database refuses to hold
  -- one rather than trusting every future writer to check.
  constraint usage_overage_settings_consent_complete check (
    enabled = false
    or (monthly_cap_eur is not null and monthly_cap_eur > 0
        and price_per_credit_eur is not null and price_per_credit_eur > 0
        and consented_at is not null and consent_version is not null)
  ),
  constraint usage_overage_settings_cap_sane check (monthly_cap_eur is null or monthly_cap_eur <= 10000)
);

alter table public.usage_overage_settings enable row level security;

drop policy if exists usage_overage_settings_select_own on public.usage_overage_settings;
create policy usage_overage_settings_select_own on public.usage_overage_settings
  for select using (auth.uid() = user_id);

-- THE DELETE POLICY, WITHOUT WHICH THE GRANT BELOW IS A LIE.
--
-- A GRANT WITHOUT A POLICY IS AN OPEN DOOR ONTO AN EMPTY ROOM: with row
-- level security on and only a SELECT policy, a customer's DELETE is not
-- refused — it MATCHES NO ROWS and reports success. Cancelling would have
-- looked like it worked, every time, and left overage on. Found by
-- revenue-engine.dbtest.mjs, which deleted the row as the customer and
-- then went and looked.
drop policy if exists usage_overage_settings_delete_own on public.usage_overage_settings;
create policy usage_overage_settings_delete_own on public.usage_overage_settings
  for delete using (auth.uid() = user_id);

-- READ AND DELETE, NEVER INSERT OR UPDATE.
--
-- Turning overage ON is a consent event: it must record when, at what
-- price and to which version of the terms, and a client that could write
-- the row could set enabled = true with a price of its choosing. So the
-- server writes it. DELETE is granted because CANCELLING MUST BE EASY —
-- deleting the row is a complete opt-out, needs no server round trip to
-- be correct, and cannot fail in a way that leaves overage on.
grant select, delete on public.usage_overage_settings to authenticated;
revoke insert, update on public.usage_overage_settings from authenticated;
revoke all on public.usage_overage_settings from anon;

drop trigger if exists set_updated_at on public.usage_overage_settings;
create trigger set_updated_at before update on public.usage_overage_settings
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------
-- 6. usage_overage_ledger — every cent, reconstructable
-- ----------------------------------------------------------------------
-- One row per overage charge. The invoice line at the end of the month is
-- the SUM of these, so "why is this EUR4.20" is answerable down to the
-- individual action rather than being a number the customer has to trust.
create table if not exists public.usage_overage_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- First of the month it belongs to, so the invoice query is an equality
  -- rather than a range whose edges two pieces of code could round
  -- differently.
  billing_month date not null,

  credits int not null check (credits > 0),
  price_per_credit_eur numeric(10, 4) not null check (price_per_credit_eur > 0),
  -- STORED, not computed on read. It is `credits * price`, and storing it
  -- means a later price change cannot silently restate an old invoice.
  amount_eur numeric(10, 2) not null check (amount_eur >= 0),

  feature text,
  reservation_id uuid,

  -- Set once the amount has been put on a Stripe invoice, so a crash
  -- between the two cannot bill it twice.
  stripe_invoice_item_id text unique,
  invoiced_at timestamptz,

  at timestamptz not null default now(),

  constraint usage_overage_ledger_first_of_month check (extract(day from billing_month) = 1)
);

create index if not exists usage_overage_ledger_month_idx
  on public.usage_overage_ledger (user_id, billing_month);
create index if not exists usage_overage_ledger_uninvoiced_idx
  on public.usage_overage_ledger (billing_month)
  where invoiced_at is null;

alter table public.usage_overage_ledger enable row level security;

drop policy if exists usage_overage_ledger_select_own on public.usage_overage_ledger;
create policy usage_overage_ledger_select_own on public.usage_overage_ledger
  for select using (auth.uid() = user_id);

-- The customer READS their own charges and can change none of them.
grant select on public.usage_overage_ledger to authenticated;
revoke insert, update, delete on public.usage_overage_ledger from authenticated;
revoke all on public.usage_overage_ledger from anon;

-- ----------------------------------------------------------------------
-- 7. account_addons — what was bought on top of the plan
-- ----------------------------------------------------------------------
create table if not exists public.account_addons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Matches ADDONS in lib/billing/addons.ts. Text with a CHECK rather
  -- than an enum so a fifth add-on is one migration line instead of an
  -- ALTER TYPE that cannot run inside a transaction.
  addon_slug text not null check (addon_slug in ('credits_1000', 'agents_5', 'storage_10gb', 'priority')),

  quantity int not null default 1 check (quantity > 0),

  -- 'active' is the only state that grants anything. A cancelled
  -- recurring add-on stays as a row so the history is not rewritten.
  status text not null default 'active' check (status in ('active', 'cancelled')),

  -- A one-off pack (credits) has no subscription item; a recurring add-on
  -- does, and cancelling it means removing that item in Stripe.
  stripe_subscription_item_id text,
  stripe_event_id text unique,

  purchased_at timestamptz not null default now(),
  cancelled_at timestamptz,
  -- A cancelled recurring add-on is paid up to the end of the period, so
  -- the entitlement survives until then rather than vanishing on click.
  expires_at timestamptz
);

create index if not exists account_addons_user_idx on public.account_addons (user_id, status);

alter table public.account_addons enable row level security;

drop policy if exists account_addons_select_own on public.account_addons;
create policy account_addons_select_own on public.account_addons
  for select using (auth.uid() = user_id);

-- Bought and cancelled through Stripe, so the server writes every row.
grant select on public.account_addons to authenticated;
revoke insert, update, delete on public.account_addons from authenticated;
revoke all on public.account_addons from anon;

-- ----------------------------------------------------------------------
-- 8. The aggregate the churn and NRR maths needs
-- ----------------------------------------------------------------------
-- Two months, compared per account, in one query. Doing this in
-- TypeScript would mean pulling every subscriber row for both months into
-- the process; doing it here returns four numbers.
--
-- Returns, for the accounts paying in `p_from`:
--   retained_mrr   — what those same accounts pay in p_to
--   churned_mrr    — what the ones that left were paying
--   expansion_mrr  — increases among those that stayed
--   contraction_mrr— decreases among those that stayed
-- plus the account counts, so churn can be reported by LOGO as well as
-- by revenue. The two disagree constantly and reporting only one of them
-- is how a business misreads its own month.
create or replace function public.subscription_cohort(p_from date, p_to date)
returns table (
  start_accounts bigint,
  start_mrr numeric,
  retained_accounts bigint,
  retained_mrr numeric,
  churned_accounts bigint,
  churned_mrr numeric,
  expansion_mrr numeric,
  contraction_mrr numeric
)
language sql
security definer
set search_path = public
as $$
  with start_set as (
    select user_id, mrr_eur from public.subscriber_months
    where month = p_from and mrr_eur > 0
  ),
  end_set as (
    select user_id, mrr_eur from public.subscriber_months
    where month = p_to and mrr_eur > 0
  ),
  paired as (
    select s.user_id, s.mrr_eur as before_mrr, coalesce(e.mrr_eur, 0) as after_mrr
    from start_set s left join end_set e on e.user_id = s.user_id
  )
  select
    (select count(*) from start_set),
    coalesce((select sum(mrr_eur) from start_set), 0),
    (select count(*) from paired where after_mrr > 0),
    coalesce((select sum(after_mrr) from paired where after_mrr > 0), 0),
    (select count(*) from paired where after_mrr = 0),
    coalesce((select sum(before_mrr) from paired where after_mrr = 0), 0),
    coalesce((select sum(after_mrr - before_mrr) from paired where after_mrr > before_mrr), 0),
    coalesce((select sum(before_mrr - after_mrr) from paired where after_mrr > 0 and after_mrr < before_mrr), 0);
$$;

-- ----------------------------------------------------------------------
-- 9. EVERY NEW FUNCTION IS REVOKED FROM anon AND authenticated
-- ----------------------------------------------------------------------
-- subscription_cohort is SECURITY DEFINER over per-account revenue. A
-- customer calling it would learn what every other customer pays.
revoke all on function public.subscription_cohort(date, date) from public, anon, authenticated;
grant execute on function public.subscription_cohort(date, date) to service_role;

-- ----------------------------------------------------------------------
-- 10. The site owner's tier, for the "Made with Ionexa" badge
-- ----------------------------------------------------------------------
-- The public serving route has the site's user_id and needs one string:
-- is this owner on the free plan. It cannot read auth.users (nothing
-- public can), and the alternative — caching the tier on published_sites
-- and updating it from the webhook — is a second source of truth for the
-- fact that gates the badge, which drifts exactly when somebody upgrades
-- and then complains that the badge is still there.
--
-- ONE STRING, ONE ROW, BY PRIMARY KEY. It cannot enumerate anybody: it
-- takes a user id the caller already holds and returns a plan name. The
-- route calls it CONCURRENTLY with the view-count write it already does,
-- so it adds no wall-clock time to a visitor's page load.
create or replace function public.account_tier(p_user_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(u.raw_user_meta_data ->> 'subscription_tier', 'free')
  from auth.users u
  where u.id = p_user_id and u.deleted_at is null;
$$;

-- SERVICE ROLE ONLY, like every other function that reads auth.users. The
-- public route uses the admin client, so it has it; a signed-in customer
-- calling this would learn another account's plan.
revoke all on function public.account_tier(uuid) from public, anon, authenticated;
grant execute on function public.account_tier(uuid) to service_role;
