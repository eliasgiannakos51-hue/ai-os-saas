-- =====================================================================
-- BADGE REMOVAL WITH CREDITS (extension of V4 #25)
-- =====================================================================
--
-- The badge came off exactly one way until now: upgrade to Starter. This
-- adds the other way — 200 credits per site per calendar month, derived
-- from the free plan's own grant and from Starter's price (the arithmetic
-- is in src/lib/publishing/badge-credits.ts, not repeated here).
--
-- ONE ROW PER (SITE, MONTH). Per SITE, never per account, because that is
-- what was asked and because the alternative silently changes price with
-- the number of sites somebody happens to own.
--
-- THE BADGE IS STILL DECIDED AT SERVE TIME. Nothing here writes into
-- published_sites.html_content and nothing may: a badge baked into stored
-- HTML survives an upgrade, misses a downgrade, and sits in the editor
-- with a delete key next to it. This table is read on the serve path
-- alongside account_tier(), and the two together decide.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.

create table if not exists public.site_badge_removals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null references public.published_sites(id) on delete cascade,

  -- First of the month this purchase covers. A CHECK rather than a
  -- convention: the renewal query is an equality, and a row dated
  -- mid-month would never be found and never be renewed.
  covers_month date not null,
  constraint site_badge_removals_first_of_month check (extract(day from covers_month) = 1),

  credits_charged int not null check (credits_charged > 0),
  -- What those credits were worth on this account when they were spent.
  -- Stored rather than recomputed: the plan can change, and a March
  -- charge must not be restated at April's rate.
  credit_price_eur numeric(12, 8),

  -- Auto-renewal is ON by default and the user may switch it off. Off
  -- means the cover runs to the end of the paid month and then stops —
  -- never a refund of a month already served, and never a badge that
  -- reappears the instant somebody clicks cancel.
  auto_renew boolean not null default true,
  cancelled_at timestamptz,

  -- Which month a "your badge returns in N days" warning has gone out
  -- for. NULL means none sent. One per month whatever the cron's
  -- cadence: a daily job that warns every day for seven days is a job
  -- whose warnings get muted, and this one costs money to ignore.
  warned_for_month date,

  at timestamptz not null default now(),

  -- AT MOST ONCE PER SITE PER MONTH, at the database level. The
  -- application refuses a second purchase too, but a retried request or
  -- two browser tabs must not be able to charge 400 credits for one
  -- month of one site.
  constraint site_badge_removals_one_per_site_month unique (site_id, covers_month)
);

create index if not exists site_badge_removals_user_idx
  on public.site_badge_removals (user_id, covers_month desc);
create index if not exists site_badge_removals_renewal_idx
  on public.site_badge_removals (covers_month, auto_renew)
  where cancelled_at is null;

alter table public.site_badge_removals enable row level security;

-- READ AND UPDATE-TO-CANCEL, NEVER INSERT.
--
-- The row is what says money moved, so only the server writes it. The
-- customer may READ what they bought and may CANCEL auto-renewal
-- themselves — cancelling must not depend on our API being reachable,
-- the same reasoning as the overage settings row.
--
-- A GRANT WITHOUT A POLICY IS AN OPEN DOOR ONTO AN EMPTY ROOM: with RLS
-- on, a granted verb with no matching policy is not refused, it matches
-- no rows and reports success. Both verbs below have one.
drop policy if exists site_badge_removals_select_own on public.site_badge_removals;
create policy site_badge_removals_select_own on public.site_badge_removals
  for select using (auth.uid() = user_id);

drop policy if exists site_badge_removals_update_own on public.site_badge_removals;
create policy site_badge_removals_update_own on public.site_badge_removals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select on public.site_badge_removals to authenticated;

-- UPDATE IS GRANTED PER COLUMN, NOT PER TABLE.
--
-- `grant update` on the whole row is the same open door one step further
-- in. The policy above constrains WHICH ROW (`auth.uid() = user_id`) and
-- nothing about WHICH COLUMN, so a table-wide update let the owner of an
-- EXPIRED purchase move covers_month forward and hand themselves the
-- current month for nothing — site_shows_badge asks only whether a row
-- exists for this month — and rewrite credits_charged to 1 so the row
-- still looked paid for. Exactly the free month the missing INSERT grant
-- below refuses, reached through the door left open for the cancel
-- button.
--
-- So only the two columns cancelling actually needs are writable. The
-- REVOKE comes first because a table-level revoke also clears column
-- grants, which is what makes re-running this file idempotent.
revoke update on public.site_badge_removals from authenticated;
grant update (auto_renew, cancelled_at) on public.site_badge_removals to authenticated;

revoke insert, delete on public.site_badge_removals from authenticated;
revoke all on public.site_badge_removals from anon;
grant all on public.site_badge_removals to service_role;

-- ---------------------------------------------------------------------
-- THE SERVE-PATH QUESTION, ANSWERED IN ONE ROUND TRIP.
--
-- Every public page view of every site already calls account_tier(). A
-- second query per view would double the hot path, so this function
-- answers the whole question: does THIS site show the badge, right now.
--
-- SECURITY DEFINER over a table the anonymous role cannot read, because
-- the visitor is anonymous and the answer is about the owner's account.
-- It takes a site id and returns a boolean: it cannot enumerate
-- anything, and it exposes no tier, no user id and no credit balance.
--
-- FAILS TOWARDS THE BADGE. An unknown site returns true — the same
-- direction readOwnerTier already fails in, and for the same reason: a
-- database hiccup showing the badge on a paying site is visible to
-- somebody who can tell us, while hiding it on a free one costs us the
-- upsell silently on every view.
-- ---------------------------------------------------------------------
create or replace function public.site_shows_badge(p_site_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    -- PAID PLANS ARE DONE FIRST, and the credit question is never
    -- reached for them. Rule (ε) as a query plan: a Starter+ account
    -- cannot be charged for something its plan includes because nothing
    -- looks at whether it paid.
    when coalesce(
           (select public.account_tier(s.user_id) from public.published_sites s where s.id = p_site_id),
           'free') <> 'free'
      then false
    when exists (
      select 1 from public.site_badge_removals r
      where r.site_id = p_site_id
        and r.covers_month = date_trunc('month', now() at time zone 'utc')::date
    ) then false
    else true
  end;
$$;

revoke all on function public.site_shows_badge(uuid) from public, anon, authenticated;
grant execute on function public.site_shows_badge(uuid) to service_role;

-- ---------------------------------------------------------------------
-- What the daily cron has to look at.
--
-- Every removal whose cover ends within the warning window or has
-- already ended, with the owner's current balance so the caller does not
-- issue one query per row. Cancelled rows are excluded here rather than
-- filtered in TypeScript: a cancelled removal has nothing to renew and
-- nothing to warn about.
-- ---------------------------------------------------------------------
create or replace function public.badge_removals_due(p_days int default 7)
returns table (
  id uuid,
  user_id uuid,
  site_id uuid,
  covers_month date,
  warned_for_month date,
  credits_remaining int
)
language sql
security definer
set search_path = public
stable
as $$
  select r.id, r.user_id, r.site_id, r.covers_month, r.warned_for_month,
         coalesce(c.credits_remaining, 0) as credits_remaining
  from public.site_badge_removals r
  left join public.user_credits c on c.user_id = r.user_id
  where r.cancelled_at is null
    and r.auto_renew
    -- The cover ends on the first of the NEXT month; due when that day
    -- is within the window or already past.
    and (r.covers_month + interval '1 month')
        <= (now() at time zone 'utc') + make_interval(days => greatest(0, p_days))
    -- Nothing to do for a month that has already been renewed.
    and not exists (
      select 1 from public.site_badge_removals n
      where n.site_id = r.site_id
        and n.covers_month = (r.covers_month + interval '1 month')::date
    )
$$;

revoke all on function public.badge_removals_due(int) from public, anon, authenticated;
grant execute on function public.badge_removals_due(int) to service_role;
