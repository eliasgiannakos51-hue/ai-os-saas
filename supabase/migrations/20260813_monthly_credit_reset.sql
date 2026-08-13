-- ============================================================================
-- The monthly credit reset for accounts Stripe never resets.
--
-- WHY THE CRON ROUTE COULD NOT SIMPLY BE SCHEDULED AS IT WAS.
--
-- /api/cron/reset-credits existed but was wired to nothing, so Free accounts
-- never got their allowance back after the first month. The obvious fix —
-- add it to vercel.json — would have introduced a worse bug than the one it
-- fixed, because the route reset EVERY row:
--
--     const { data: rows } = await admin.from("user_credits")
--       .select("user_id, credits_total");            -- every account
--     for (const row of rows) await resetCreditsToTotal(row.user_id, ...);
--
-- Meanwhile the Stripe webhook already resets paid accounts. invoice.paid
-- (app/api/webhooks/stripe/route.ts) calls syncSubscriptionToUser, which
-- calls syncCreditsForPlan, which sets credits_remaining = credits_total =
-- the plan's monthly allotment. That fires on the subscriber's own billing
-- anniversary.
--
-- So a Starter subscriber billed on the 15th would have been topped up by
-- Stripe on the 15th AND by this cron on the 1st: two full allowances every
-- month, given away, for as long as they stayed subscribed. Wiring the route
-- unchanged would have cost real money.
--
-- Two guards, and the reset is now a single atomic statement:
--
--   1. ONLY UNBILLED ACCOUNTS. plan_tier = 'free' AND no active Stripe
--      subscription id in the account's metadata. Either signal saying
--      "paid" is enough to skip — skipping a reset is recoverable, double
--      granting is not. Beta accounts keep plan_tier 'free' with a Free
--      allotment in credits_total (their Ultimate access comes from
--      beta_expires_at, not from credits), so they are correctly included.
--
--   2. ONCE PER CALENDAR MONTH. last_monthly_reset records the period, and
--      the UPDATE's WHERE clause excludes rows already stamped with it. Two
--      runs in the same month cannot both grant, and neither can two
--      overlapping runs: the row lock the UPDATE takes serialises them, and
--      the second re-evaluates the WHERE against the stamped row.
--
-- Safe to run more than once.
-- ============================================================================

-- Which period this account was last reset for. Null for every existing row,
-- which is what makes the first run after this migration reset everybody who
-- is due — exactly the intended catch-up.
alter table public.user_credits
  add column if not exists last_monthly_reset date;

-- The cron scans by this column every month.
create index if not exists user_credits_last_monthly_reset_idx
  on public.user_credits (last_monthly_reset);


-- ----------------------------------------------------------------------------
-- reset_monthly_credits_for_unbilled
--
-- p_period must be the first day of the month being granted. Passed in by
-- the caller rather than derived from now(), for the same reason
-- increment_daily_ai_spend takes its date: the application thinks in UTC and
-- a session TimeZone must not be able to disagree with it.
--
-- Returns one row per account actually reset, so the caller can report a
-- truthful count and a replay can report zero.
-- ----------------------------------------------------------------------------
create or replace function public.reset_monthly_credits_for_unbilled(
  p_period date default (date_trunc('month', now() at time zone 'utc'))::date
)
returns table (user_id uuid, credits_granted integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', p_period)::date;
begin
  return query
  with reset as (
    update public.user_credits uc
       set credits_remaining  = uc.credits_total,
           last_monthly_reset = v_period,
           updated_at         = now()
     where uc.plan_tier = 'free'
       -- Already done this month. Also the concurrency guard: a second
       -- caller re-evaluates this against the row the first one stamped.
       and (uc.last_monthly_reset is null or uc.last_monthly_reset < v_period)
       -- Nothing to give back.
       and uc.credits_total > 0
       -- Not already full — a user who has spent nothing needs no reset, and
       -- counting them would overstate what this actually did.
       and uc.credits_remaining < uc.credits_total
       -- Belt and braces against the double-grant: if Stripe still holds an
       -- active subscription for this account, invoice.paid is what resets
       -- it, whatever plan_tier happens to say.
       and not exists (
         select 1 from auth.users au
         where au.id = uc.user_id
           and coalesce(au.raw_user_meta_data ->> 'stripe_subscription_id', '') <> ''
       )
    returning uc.user_id, (uc.credits_total - 0) as granted
  ),
  logged as (
    insert into public.credit_transactions (user_id, amount, action_type, description)
    select r.user_id, r.granted, 'plan_renewal',
           'Monthly free-plan credit reset for ' || to_char(v_period, 'YYYY-MM')
      from reset r
    returning 1
  )
  select r.user_id, r.granted from reset r;
end;
$$;


-- Service-role only: this hands out credits.
revoke all on function public.reset_monthly_credits_for_unbilled(date) from public;
revoke all on function public.reset_monthly_credits_for_unbilled(date) from anon;
revoke all on function public.reset_monthly_credits_for_unbilled(date) from authenticated;
grant execute on function public.reset_monthly_credits_for_unbilled(date) to service_role;
