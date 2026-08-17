-- ===========================================================================
-- GRANDFATHERING: THE BACKFILL.
--
-- Safe to run more than once. No DROP, no TRUNCATE, no unqualified DELETE,
-- no constraint removal. Every statement is additive or a bounded UPDATE.
--
-- WHY IT IS ITS OWN FILE, DATED AFTER THE BASELINE.
--
-- This was `supabase_grandfathering_migration.sql`, one of twenty loose
-- .sql files at the repository root. When the schema was consolidated into
-- supabase/migrations, its COLUMNS came through — the baseline carries
-- legacy_plan_tier, legacy_free_chat_messages, legacy_free_chat_history_limit,
-- legacy_free_chat_max_output_tokens, legacy_entitlements_until,
-- legacy_entitlements_backfilled_at and the partial index over them — but
-- the UPDATE that POPULATES them did not.
--
-- A structure dump carries structure. It cannot carry a statement, and the
-- consolidation was built from one, so the one part of that file that was
-- not structure was the one part that went missing. The effect is silent
-- and only visible on a rebuilt database: every column is there, every
-- read succeeds, and every paying account gets NULL — which
-- lib/billing/legacy-entitlements.ts correctly reads as "no entitlement"
-- and quietly hands them the lower post-ceiling allowance they were
-- promised they would keep.
--
-- WHAT IT IS FOR
--
-- The combined ceiling (1/M + every free quota <= 25% of price) lowered
-- what a plan grants:
--
--   free chat messages   120 / 300 / 600 / 1200  ->  43 / 107 / 215 / 430
--   history window       6 turns                 ->  2 turns
--   reply cap            800 tokens              ->  600 tokens
--
-- Nobody who was already paying should lose either. These columns record,
-- per account, what that account keeps.
--
-- IT IS A DELIBERATE, BOUNDED BREACH OF THE CEILING: a grandfathered
-- Professional account costs EUR 18.82/month in worst-case free chat
-- against a EUR 20.00 combined budget — 38.8% of its revenue, a combined
-- 2.58x rather than 4x. That is the price of not taking something back.
-- What is not acceptable is paying it invisibly, so the cohort is
-- countable; the query is at the bottom of this file.
--
-- FOUR GUARDS, so the exception cannot outlive its reason:
--   1. legacy_plan_tier — honoured ONLY while the account is still on the
--      plan it was granted for. This is what stops a beta account
--      (plan_tier 'ultimate', silently collapsing to Free when
--      beta_expires_at passes, with no Stripe event to clear anything)
--      keeping Ultimate's 1,200 free messages on a plan that pays nothing.
--   2. syncCreditsForPlan calls clearLegacyEntitlements on every
--      subscription change Stripe reports.
--   3. legacy_entitlements_until — optional expiry, same mechanism as
--      beta_expires_at. NULL here means "until the plan changes".
--   4. The envelope numbers are stored as DATA, so the exception keeps
--      meaning the same thing after the next envelope change instead of
--      silently tracking it.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The columns.
--
-- The baseline already creates all six. Repeated here, guarded, so this
-- file can be applied to a database that predates the consolidation
-- without needing the baseline to have run first.
-- ---------------------------------------------------------------------------
alter table public.user_credits
  add column if not exists legacy_plan_tier text,
  add column if not exists legacy_free_chat_messages integer,
  add column if not exists legacy_free_chat_history_limit integer,
  add column if not exists legacy_free_chat_max_output_tokens integer,
  add column if not exists legacy_entitlements_until timestamptz,
  add column if not exists legacy_entitlements_backfilled_at timestamptz;

comment on column public.user_credits.legacy_plan_tier is
  'Plan the grandfathered entitlement was granted for. Honoured only while plan_tier still matches.';
comment on column public.user_credits.legacy_free_chat_messages is
  'Free-chat allowance this account keeps from before the combined-ceiling change.';
comment on column public.user_credits.legacy_entitlements_until is
  'When the entitlement lapses. NULL = until the plan changes.';

-- Partial index: the cohort query and the per-request read both filter on
-- "has an entitlement at all", which is a small minority of rows.
create index if not exists user_credits_legacy_entitlements_idx
  on public.user_credits (legacy_plan_tier)
  where legacy_free_chat_messages is not null;

-- ---------------------------------------------------------------------------
-- 2. The backfill.
--
-- IDEMPOTENT: only rows that do not already carry an entitlement are
-- touched, so a second run reports 0 and changes nothing. Re-running after
-- someone has been cleared (by a plan change) will NOT re-grant them —
-- `legacy_entitlements_backfilled_at` records that the row was considered.
-- ---------------------------------------------------------------------------
with old_policy(tier, messages, history_limit, max_output_tokens) as (
  values
    ('starter',      120, 6, 800),
    ('growth',       300, 6, 800),
    ('professional', 600, 6, 800),
    ('ultimate',    1200, 6, 800),
    ('enterprise',  1200, 6, 800)
)
update public.user_credits uc
   set legacy_plan_tier                   = uc.plan_tier,
       legacy_free_chat_messages          = op.messages,
       legacy_free_chat_history_limit     = op.history_limit,
       legacy_free_chat_max_output_tokens = op.max_output_tokens,
       legacy_entitlements_until          = null,
       legacy_entitlements_backfilled_at  = now()
  from old_policy op
 where uc.plan_tier = op.tier
   and uc.legacy_entitlements_backfilled_at is null
   -- A beta grant is not a purchase. Those accounts carry a paid
   -- plan_tier they never paid for and drop to Free when the window
   -- closes; grandfathering them would hand a free account the most
   -- expensive allowance in the product. (legacy_plan_tier would refuse
   -- to honour it after expiry anyway — this keeps the row clean rather
   -- than relying on the second guard.)
   and (uc.beta_expires_at is null or uc.beta_expires_at < now());

-- ---------------------------------------------------------------------------
-- 3. OPTIONAL — Free accounts.
--
-- NOT run by default, and the omission is deliberate rather than an
-- oversight. A Free account's message COUNT did not change (15 before, 15
-- now); only the envelope did, so what it would preserve is a longer memory
-- window and a longer reply, at roughly EUR 0.12/account/month.
--
-- Free accounts are also the abuse surface and can be created in bulk, so
-- this is a business decision rather than a technical one. Uncomment to
-- include them.
-- ---------------------------------------------------------------------------
-- update public.user_credits uc
--    set legacy_plan_tier                   = 'free',
--        legacy_free_chat_messages          = 15,
--        legacy_free_chat_history_limit     = 6,
--        legacy_free_chat_max_output_tokens = 800,
--        legacy_entitlements_until          = null,
--        legacy_entitlements_backfilled_at  = now()
--  where uc.plan_tier = 'free'
--    and uc.legacy_entitlements_backfilled_at is null;

-- ---------------------------------------------------------------------------
-- 4. WATCH THE COHORT SHRINK.
--
-- Run this whenever the margin question comes up. It is the amount the
-- combined ceiling is knowingly over by, in euros per month, and it should
-- only ever go down.
--
--   per-message worst case, OLD envelope (6 turns / 800 tokens): EUR 0.031360
--   per-message worst case, NEW envelope (2 turns / 600 tokens): EUR 0.023235
-- ---------------------------------------------------------------------------
-- select
--   uc.plan_tier,
--   count(*)                                        as accounts,
--   sum(uc.legacy_free_chat_messages)               as legacy_messages,
--   round((sum(uc.legacy_free_chat_messages) * 0.031360)::numeric, 2)
--                                                   as legacy_worst_case_eur,
--   round((count(*) * case uc.plan_tier
--            when 'starter' then 43 when 'growth' then 107
--            when 'professional' then 215 else 430 end * 0.023235)::numeric, 2)
--                                                   as published_worst_case_eur
-- from public.user_credits uc
-- where uc.legacy_free_chat_messages is not null
--   and uc.legacy_plan_tier = uc.plan_tier
--   and (uc.legacy_entitlements_until is null or uc.legacy_entitlements_until > now())
-- group by uc.plan_tier
-- order by 1;

-- ---------------------------------------------------------------------------
-- 5. TO END GRANDFATHERING LATER.
--
-- Give everyone 90 days' notice rather than cutting at once. Bounded and
-- reversible; it never deletes a row.
-- ---------------------------------------------------------------------------
-- update public.user_credits
--    set legacy_entitlements_until = now() + interval '90 days'
--  where legacy_free_chat_messages is not null
--    and legacy_entitlements_until is null;
