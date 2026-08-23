-- ============================================================================
-- WHICH MIGRATIONS HAVE NOT LANDED? — read-only, run this FIRST.
--
-- WHY THIS EXISTS. 20260819001_ai_jobs_visibility_repair.sql already records
-- the reason: large SQL pastes through the Supabase editor can stop
-- part-way WITHOUT reporting an error. So "I ran the migrations" and "the
-- objects exist" are different statements, and the app cannot tell the
-- difference — it just behaves as though a feature was never built.
--
-- Two live examples of what that looks like from the outside:
--
--   ai_jobs has no select policy  -> /api/jobs returns nothing for the
--     owner, every finished build is invisible, and the only move left is
--     to pay for it again. The build "worked"; the progress line never
--     appeared.
--   ai_jobs.consumed_at missing   -> a finished result is re-offered on
--     every visit, because nothing can record that it was shown.
--
-- SAFE. This reads catalogue views only. No CREATE, no ALTER, no DELETE,
-- no data touched. Run it as many times as you like.
--
-- HOW TO READ IT. One row per migration. status = 'OK' means every object
-- that migration creates is present. 'MISSING' means run that file. Run
-- the MISSING ones in filename order, top to bottom.
-- ============================================================================

with checks(migration, ok) as (
  values
    ('20260805_idempotent_credit_grants.sql',
      to_regclass('public.credit_transactions') is not null
      and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='credit_transactions'
                    and column_name='idempotency_key')),

    ('20260808_gdpr_erasure_gaps.sql',
      to_regprocedure('public.forget_user_in_production_errors(uuid)') is not null),

    ('20260808_web_push_subscriptions.sql',
      to_regclass('public.push_subscriptions') is not null),

    ('20260809_research_progress.sql',
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='research_reports'
                and column_name='questions_done')),

    ('20260810_chunked_research.sql',
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='research_reports'
                and column_name='partial_findings')),

    ('20260812_background_jobs.sql',
      to_regclass('public.ai_jobs') is not null),

    ('20260813_accent_insensitive_search.sql',
      to_regprocedure('public.search_fold(text)') is not null),

    ('20260813_atomic_daily_ai_spend.sql',
      to_regclass('public.daily_ai_spend_tracking') is not null),

    ('20260813_monthly_credit_reset.sql',
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='user_credits'
                and column_name='last_monthly_reset')),

    ('20260814_agent_delivery_channels.sql',
      to_regclass('public.user_delivery_channels') is not null),

    -- P0: without this a finished result is re-offered on every visit.
    ('20260814_job_consumed_at.sql',
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='ai_jobs'
                and column_name='consumed_at')),

    ('20260815_purchased_credits.sql',
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='user_credits'
                and column_name='purchased_credits')),

    ('20260815_subscription_cancellations.sql',
      to_regclass('public.subscription_cancellations') is not null),

    ('20260816_help_articles.sql',
      to_regclass('public.help_articles') is not null),

    ('20260816_help_articles_seed.sql',
      coalesce((select count(*) from public.help_articles), 0) > 0),

    ('20260817000001_grandfathering_backfill.sql',
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='user_credits'
                and column_name='legacy_plan_tier')),

    ('20260817000002_agent_runs_would_have_charged.sql',
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='agent_runs'
                and column_name='would_have_charged_credits')),

    ('20260817000003_schema_parity_lost_columns.sql',
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='ai_missions'
                and column_name='plan_steps_version')),

    ('20260817_purchased_credits_backfill_marker.sql',
      exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='user_credits'
                and column_name='purchased_credits_backfilled_at')),

    ('20260819000000_files_storage_repair.sql',
      exists (select 1 from pg_policies
              where schemaname='storage' and tablename='objects'
                and policyname='select_own_user_files_objects')),

    -- P0: without this /api/jobs returns NOTHING to the owner, so every
    -- finished build is invisible and gets paid for twice.
    ('20260819000001_ai_jobs_visibility_repair.sql',
      exists (select 1 from pg_policies
              where schemaname='public' and tablename='ai_jobs'
                and policyname='ai_jobs_select_own')),

    ('20260820000000_affiliate.sql',
      to_regclass('public.affiliates') is not null)
)
select
  migration,
  case when ok then 'OK' else 'MISSING  <-- run this file' end as status
from checks
order by migration;

-- ----------------------------------------------------------------------------
-- The two that decide whether anyone is being charged twice, on their own,
-- so they are readable even if the table above scrolls.
-- ----------------------------------------------------------------------------
select
  'ai_jobs readable by its owner' as check,
  case when exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='ai_jobs' and policyname='ai_jobs_select_own'
  ) then 'YES' else 'NO  -> every finished build is invisible; run 20260819000001' end as answer
union all
select
  'ai_jobs.consumed_at exists',
  case when exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ai_jobs' and column_name='consumed_at'
  ) then 'YES' else 'NO  -> results are re-offered forever; run 20260814_job_consumed_at' end
union all
select
  'row level security on ai_jobs',
  case when (select relrowsecurity from pg_class where oid = to_regclass('public.ai_jobs'))
    then 'ON' else 'OFF  -> run 20260819000001' end;
