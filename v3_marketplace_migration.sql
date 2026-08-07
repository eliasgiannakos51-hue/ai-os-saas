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
