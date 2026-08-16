-- Finish the purchased-credits migration on a database that ran the
-- original and then the lockdown hotfix.
--
-- IDEMPOTENT. No DROP TABLE, no TRUNCATE, no unqualified DELETE, no DROP
-- CONSTRAINT, no DROP POLICY. It adds one column and RAISES a figure that
-- the ledger already proves; it never lowers anything.
--
-- ============================================================================
-- WHY THIS FILE EXISTS
-- ============================================================================
-- 20260815_purchased_credits.sql shipped, was found to have three defects,
-- and was fixed. The fix arrived as two things: a small standalone lockdown
-- hotfix, and a corrected version of the big file. The hotfix was pasteable
-- and said "run this now"; the corrected file was a reference to a commit.
-- Predictably, the hotfix ran and the corrected file did not.
--
-- The result is a database where:
--   purchased_credits                 EXISTS   (from the original)
--   user_credits_purchased_credits_check EXISTS (from the original)
--   all five functions                EXIST and are LOCKED (from the hotfix)
--   the stale 8-arg overload          GONE     (from the hotfix)
--   purchased_credits_backfilled_at   MISSING  <- the only gap
--
-- This file closes that gap alone. Running the corrected 20260815 instead
-- would also work, but this is smaller, and smaller is easier to read
-- before running it against money.
--
-- ============================================================================
-- THE BACKFILL IS LEDGER-BASED, NOT BALANCE-BASED
-- ============================================================================
-- The original backfill said: anything above the plan's monthly allotment
-- was bought. That is a reasonable guess on a database where nothing has
-- happened since, and a WRONG one on this database, where the original
-- migration already ran and normal activity has continued. A goodwill
-- grant, a beta top-up or an admin adjustment also puts a balance above
-- its allotment, and the balance cannot say which it was.
--
-- The LEDGER can. A pack purchase is a credit_transactions row with
-- action_type = 'purchase'; a goodwill grant is 'admin_adjustment'. So
-- instead of guessing from the balance, this reconciles against what was
-- actually bought:
--
--     proven_purchased = total ever bought
--                      - everything spent since the first purchase
--     clamped to [0, credits_remaining]
--
-- and then only ever RAISES purchased_credits to it:
--
--     purchased_credits := greatest(purchased_credits, proven_purchased)
--
-- greatest() is what makes a second run a no-op and makes a partial first
-- run harmless: once the figure is at or above what the ledger proves,
-- nothing moves. It also means this cannot take credits away from someone
-- the original backfill already credited more generously.
--
-- The clamp to credits_remaining is not cosmetic: the CHECK constraint
-- user_credits_purchased_credits_check refuses purchased_credits >
-- credits_remaining, so without it this statement would abort on any
-- account that has already spent part of a pack.
--
-- SPENT-SINCE is deliberately over-counted rather than under-counted. It
-- sums every debit since the first purchase, including debits that the
-- monthly allowance actually paid for. That makes proven_purchased a LOWER
-- bound, so the worst case is that someone is credited less than they
-- might be — never more. Restoring what earlier resets destroyed is a
-- separate, deliberate act: the restitution block at the bottom of
-- 20260815_purchased_credits.sql.
-- ============================================================================

-- 1. The marker column -------------------------------------------------------
alter table public.user_credits
  add column if not exists purchased_credits_backfilled_at timestamptz;

comment on column public.user_credits.purchased_credits_backfilled_at is
  'When the purchased-credits backfill considered this row. Set once; its presence is what makes a re-run a no-op.';

-- 2. Reconcile against the ledger -------------------------------------------
with purchases as (
  select user_id,
         sum(amount)     as purchased_total,
         min(created_at) as first_purchase_at
    from public.credit_transactions
   where action_type = 'purchase' and amount > 0
   group by user_id
),
spend as (
  select ct.user_id, coalesce(sum(-ct.amount), 0) as spent_since
    from public.credit_transactions ct
    join purchases p on p.user_id = ct.user_id
   where ct.amount < 0
     and ct.created_at >= p.first_purchase_at
   group by ct.user_id
),
proven as (
  select uc.user_id,
         greatest(
           least(
             p.purchased_total - coalesce(s.spent_since, 0),
             uc.credits_remaining          -- the CHECK constraint's ceiling
           ),
           0
         )::integer as proven_purchased
    from public.user_credits uc
    join purchases p on p.user_id = uc.user_id
    left join spend s on s.user_id = uc.user_id
)
update public.user_credits uc
   set purchased_credits = greatest(uc.purchased_credits, pr.proven_purchased),
       updated_at        = now()
  from proven pr
 where pr.user_id = uc.user_id
   and pr.proven_purchased > uc.purchased_credits;

-- 3. Mark every row as considered -------------------------------------------
-- The whole point of the marker: after this, the balance-heuristic backfill
-- in 20260815_purchased_credits.sql is a no-op on every existing row, so
-- running that file (now or later, in full) cannot reclassify a goodwill
-- grant as permanent purchased credits.
update public.user_credits
   set purchased_credits_backfilled_at = now()
 where purchased_credits_backfilled_at is null;

-- 4. What this changed --------------------------------------------------------
-- Read-only. Run it after, and again tomorrow: the second run must show the
-- same numbers, because nothing above can move a figure twice.
--
-- select uc.user_id,
--        uc.plan_tier,
--        uc.credits_remaining,
--        uc.credits_total                as monthly_allotment,
--        uc.purchased_credits,
--        uc.credits_remaining - uc.purchased_credits as monthly_part,
--        uc.purchased_credits_backfilled_at
--   from public.user_credits uc
--  where uc.purchased_credits > 0
--  order by uc.purchased_credits desc;
