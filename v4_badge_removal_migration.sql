-- ============================================================================
-- V4 — #25: "Made with Ionexa" badge removal, paid with credits.
--
-- Standalone, additive, idempotent. Requires published_sites
-- (v3_website_hosting_migration.sql).
--
-- ----------------------------------------------------------------------------
-- WHY COLUMNS AND NOT A TABLE
-- ----------------------------------------------------------------------------
-- A table would be right if a site could have MANY badge-removal facts at
-- once — overlapping periods, several buyers, a history to walk. It cannot.
-- Per site there is exactly one answer to each of three single-valued
-- questions:
--
--   "paid through when?"        -> badge_removal_paid_until
--   "renew it automatically?"   -> badge_removal_auto_renew
--   "warned about expiry when?" -> badge_removal_expiry_notified_at
--
-- The HISTORY the user asked to be visible ("μηνιαία ανανέωση, ορατή στο
-- credit history") already has a table: credit_transactions, written by
-- deductCredits on every purchase and every monthly renewal. Duplicating it
-- into a badge_removal_periods table would create a second ledger that can
-- disagree with the first one, and the first one is the one the user sees.
--
-- The decisive argument, though, is the serve path. /s/[subdomain] reads
-- ONE row to answer "does this page carry a badge right now". Columns keep
-- that one row. A separate table makes the most latency-sensitive route in
-- the app do a join or a second query on every anonymous page view, to
-- learn a fact that is a single timestamp.
--
-- ----------------------------------------------------------------------------
-- WHAT IS DELIBERATELY *NOT* HERE
-- ----------------------------------------------------------------------------
-- There is no `badge_hidden boolean`. A boolean would have to be flipped
-- back by something, and whatever failed to flip it (a cron that did not
-- run, a deploy during the window, a row updated by an older code path)
-- would leave a page silently un-badged forever — revenue lost with no
-- error anywhere. An EXPIRY TIMESTAMP fails the other way: if nothing runs,
-- it lapses, the badge comes back, and the loss is a customer's goodwill
-- rather than our money. Given the choice of which direction to fail in,
-- this is the safe one.
--
-- There is also no badge flag baked into published_sites.html_content, and
-- there must never be one. See lib/publishing/badge.ts.
-- ============================================================================

alter table public.published_sites
  -- Paid through this instant. NULL = never bought. Past = lapsed, badge is
  -- back. The badge decision is `now() < badge_removal_paid_until`, read at
  -- serve time, every time.
  add column if not exists badge_removal_paid_until timestamptz;

alter table public.published_sites
  -- Whether the monthly cron re-charges when the period runs out. Default
  -- true: someone who paid to remove the badge wants it to STAY removed,
  -- and the cancel path (api/published/[id]/badge-removal DELETE) is one
  -- click. Cancelling never refunds and never re-badges early — the period
  -- already paid for runs to its end.
  add column if not exists badge_removal_auto_renew boolean not null default true;

alter table public.published_sites
  -- When the "7 days left" email went out for the CURRENT period. Compared
  -- against badge_removal_paid_until so a renewal (which pushes paid_until
  -- forward) automatically re-arms the next warning without needing a
  -- reset: the notice is stale once it predates the period it refers to.
  add column if not exists badge_removal_expiry_notified_at timestamptz;

-- The renewal cron's only query: "which live sites lapse in the next N
-- days, or have already lapsed while auto-renew was on?". Partial, because
-- the overwhelming majority of rows have never bought badge removal and
-- indexing them would be pure write cost on every publish.
create index if not exists published_sites_badge_removal_due_idx
  on public.published_sites (badge_removal_paid_until)
  where badge_removal_paid_until is not null;

-- ----------------------------------------------------------------------------
-- RLS: nothing new to add, and one thing to make impossible.
-- ----------------------------------------------------------------------------
-- published_sites already has update_own_published_sites, which lets the
-- OWNER write their own row. That policy is what powers the builder's own
-- updates — and it would also let an owner set badge_removal_paid_until to
-- the year 3000 with a single anon-key request, for free, forever.
--
-- Postgres RLS cannot express "you may update these columns but not those",
-- so the guard is a trigger: any write of the badge columns that is not
-- made by the service role is rejected. Every legitimate write goes through
-- api/published/[id]/badge-removal or the renewal cron, both of which use
-- the service-role client after charging credits.
create or replace function public.guard_badge_removal_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- current_setting('role') is unreliable across poolers; the reliable
  -- signal is the JWT claim PostgREST sets for the request.
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return new;
  end if;
  -- No JWT at all = a direct psql/migration connection (the DBA), not a
  -- request. Those are trusted; only an authenticated API caller is not.
  if coalesce(current_setting('request.jwt.claims', true), '') = ''
     and coalesce(current_setting('request.jwt.claim.role', true), '') = '' then
    return new;
  end if;

  if new.badge_removal_paid_until is distinct from old.badge_removal_paid_until then
    raise exception 'badge_removal_paid_until is set by billing, not by the client';
  end if;
  if new.badge_removal_expiry_notified_at is distinct from old.badge_removal_expiry_notified_at then
    raise exception 'badge_removal_expiry_notified_at is set by the renewal job, not by the client';
  end if;
  -- auto_renew is deliberately NOT guarded: turning your own renewal off is
  -- a preference, it costs us nothing, and a user must always be able to
  -- stop a recurring charge even if the API route is down.
  return new;
end;
$$;

drop trigger if exists guard_badge_removal on public.published_sites;
create trigger guard_badge_removal
  before update on public.published_sites
  for each row execute function public.guard_badge_removal_columns();
