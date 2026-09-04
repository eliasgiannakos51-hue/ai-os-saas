-- MRR COUNTED TWELVE SUBSCRIBERS ON AN ACCOUNT WITH NO PAYMENTS.
--
-- Reported from /dashboard/business-health: "MRR EUR 2,000, ARR EUR 24,000,
-- 12 subscribers — I have not received a single payment."
--
-- WHERE THE NUMBER CAME FROM. mrr_inputs() (20260823000000_cost_alerts.sql)
-- groups auth.users by raw_user_meta_data ->> 'subscription_tier' and
-- counts every account whose tier names a priced plan. That field is
-- written by the Stripe webhook — and ALSO by api/signup/route.ts, which
-- sets subscription_tier: "ultimate" for anybody who signs up with a valid
-- beta invite code, without Stripe ever being involved, and never writes
-- it back to "free" when the thirty-day window closes (lib/beta.ts says
-- so in as many words). A tier in metadata is therefore not evidence of a
-- payment. It is evidence that SOMETHING granted the tier, and the beta
-- code is something.
--
-- So twelve beta testers on "ultimate" read as twelve subscribers, and
-- their plan price times twelve read as MRR. Not seed data — nothing in
-- this repository inserts into revenue_snapshots or subscriber_months —
-- but a metric computed from the wrong column.
--
-- THE RULE NOW: a subscriber is an account with a LIVE STRIPE
-- SUBSCRIPTION. The webhook writes stripe_subscription_id on every
-- checkout and subscription event and sets it to null when the
-- subscription ends (api/webhooks/stripe/route.ts: `stripe_subscription_id:
-- isActive ? subscription.id : null`). An account with a paid tier and no
-- subscription id is counted as FREE here — it still gets the tier's
-- features (plan resolution reads the metadata, not this function), it
-- just is not revenue, because it is not.
--
-- The same rule is applied in lib/billing/revenue-history.ts's
-- writeSubscriberMonths, which walks auth.users in TypeScript for the
-- per-account cohort rows. Two readers, one definition of "paying".
--
-- HOW TO SEE IT ON THE LIVE DATABASE, before and after (the number this
-- migration changes is the grouped count):
--
--   select coalesce(raw_user_meta_data ->> 'subscription_tier', 'free') as tier,
--          (raw_user_meta_data ->> 'stripe_subscription_id') is not null as paying,
--          (raw_user_meta_data ->> 'is_beta_tester') = 'true'            as beta,
--          count(*)
--     from auth.users
--    where deleted_at is null
--    group by 1, 2, 3
--    order by 1, 2, 3;
--
-- Idempotent: create or replace, same signature, same return shape, no
-- grant changes — the existing revoke-from-anon in 20260823000000 stands.

create or replace function public.mrr_inputs()
returns table (tier text, billing_interval text, subscribers bigint, seats bigint)
language sql
security definer
set search_path = public
as $$
  select
    -- A tier is revenue only with a Stripe subscription behind it.
    case
      when u.raw_user_meta_data ->> 'stripe_subscription_id' is not null
        then coalesce(u.raw_user_meta_data ->> 'subscription_tier', 'free')
      else 'free'
    end as tier,
    case
      when u.raw_user_meta_data ->> 'stripe_subscription_id' is not null
        then coalesce(u.raw_user_meta_data ->> 'billing_interval', 'month')
      else 'month'
    end as billing_interval,
    count(*) as subscribers,
    -- A seat count of 0 or null still means the account itself, or a
    -- one-seat plan would contribute nothing.
    sum(greatest(coalesce((u.raw_user_meta_data ->> 'seat_count')::int, 1), 1)) as seats
  from auth.users u
  where u.deleted_at is null
  group by 1, 2;
$$;

comment on function public.mrr_inputs() is
  'Subscriber counts per (tier, interval) for MRR. A tier counts only with a live stripe_subscription_id in user_metadata; beta grants and hand-set tiers are free here. See 20260923000000_mrr_paid_only.sql.';
