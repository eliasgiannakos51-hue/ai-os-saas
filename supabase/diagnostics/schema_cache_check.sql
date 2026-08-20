-- =========================================================================
-- "not found in schema cache" — IS IT MISSING, OR IS IT THE CACHE?
--
-- Read-only. Creates nothing, drops nothing, writes nothing.
--
-- PostgREST answers "Could not find the table 'public.x' in the schema
-- cache" for BOTH cases: the object really does not exist, and the object
-- exists but PostgREST is still holding a schema snapshot taken before it
-- was created. The error text is identical, so the log cannot tell you
-- which one you have. This query can: it asks Postgres itself.
--
-- Read the `verdict` column:
--   EXISTS  — the object is really there. The error was a STALE CACHE.
--             Fix with the NOTIFY at the bottom.
--   MISSING — the object is genuinely absent. The migration that defines
--             it has not been applied to this database.
-- =========================================================================

with expected(kind, name, verdict) as (
  values
    ('table',    'public.user_integrations',
       case when to_regclass('public.user_integrations') is null then 'MISSING' else 'EXISTS' end),
    ('table',    'public.user_agents',
       case when to_regclass('public.user_agents') is null then 'MISSING' else 'EXISTS' end),
    ('table',    'public.user_delivery_channels',
       case when to_regclass('public.user_delivery_channels') is null then 'MISSING' else 'EXISTS' end),
    ('table',    'public.integration_sync_log',
       case when to_regclass('public.integration_sync_log') is null then 'MISSING' else 'EXISTS' end),
    ('function', 'public.prune_integration_sync_log()',
       case when not exists (
         select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'prune_integration_sync_log'
       ) then 'MISSING' else 'EXISTS' end),
    ('column',   'public.user_websites.stuck_notified_at',
       case when not exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'user_websites'
           and column_name = 'stuck_notified_at'
       ) then 'MISSING' else 'EXISTS' end),
    ('column',   'public.user_websites.editing_started_at',
       case when not exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'user_websites'
           and column_name = 'editing_started_at'
       ) then 'MISSING' else 'EXISTS' end),
    ('column',   'public.user_automations.processing_started_at',
       case when not exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'user_automations'
           and column_name = 'processing_started_at'
       ) then 'MISSING' else 'EXISTS' end)
)
select
  kind,
  name,
  verdict,
  case verdict
    when 'EXISTS'  then 'It is there. The error was a stale PostgREST cache — run the NOTIFY below.'
    else 'Genuinely absent. Apply the migration that defines it, then run the NOTIFY below.'
  end as what_to_do
from expected
order by verdict desc, kind, name;

-- -------------------------------------------------------------------------
-- Which migration defines each one, when the verdict is MISSING:
--   user_integrations, user_agents, integration_sync_log,
--   prune_integration_sync_log()   -> 20260803000000_baseline_schema.sql
--   user_delivery_channels          -> 20260814_agent_delivery_channels.sql
--   user_websites.stuck_notified_at,
--   user_websites.editing_started_at,
--   user_automations.processing_started_at
--                                   -> 20260817000003_schema_parity_lost_columns.sql
-- -------------------------------------------------------------------------

-- Whatever the verdicts were, this is safe and idempotent: it tells
-- PostgREST to re-read the schema. Harmless when nothing changed.
notify pgrst, 'reload schema';
