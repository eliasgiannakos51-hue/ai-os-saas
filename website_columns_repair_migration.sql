-- ============================================================================
-- REPAIR: the four user_websites columns a restore lost, and the status
-- value the CHECK constraint forbade.
--
-- Run this on any project whose schema came from
-- supabase_full_project_backup.sql before this file existed. It is
-- idempotent and safe to run on a healthy project — every statement is
-- `if not exists` or a constraint replacement.
--
-- WHAT WENT WRONG. The backup file contains
--
--     drop table if exists public.user_websites cascade;
--     create table public.user_websites ( ... );
--
-- and the recreated table was missing four columns that shipped code
-- reads and writes. Every one of the reported failures traces back here:
--
--   "Cannot coerce the result to a single JSON object"
--     /api/websites/generate/process. See the note below — this is the
--     one that needed a code change as well, because the message told
--     nobody anything.
--
--   "column user_websites.stuck_notified_at does not exist"
--     /api/cron/scheduled-runs, three times. The stuck-generation
--     notifier filters on it.
--
--   generation refusing to start at all
--     /api/websites/generate INSERTs `description` and
--     `is_large_request`. PostgREST rejects an insert naming a column
--     that does not exist (PGRST204).
--
--   a flagged website never finishing
--     the last UPDATE of a generation writes status 'flagged', which the
--     old CHECK did not allow.
-- ============================================================================

alter table public.user_websites
  add column if not exists description text;

alter table public.user_websites
  add column if not exists is_large_request boolean not null default false;

alter table public.user_websites
  add column if not exists free_retry_used boolean not null default false;

alter table public.user_websites
  add column if not exists stuck_notified_at timestamptz;

alter table public.user_websites
  add column if not exists attempt_count integer not null default 0;

alter table public.user_websites
  add column if not exists has_reference_images boolean not null default false;

-- 'flagged' is written by api/websites/generate/process when the AI
-- Output Protection Layer rejects a generated page. It is a real, reached
-- state, not a hypothetical one.
alter table public.user_websites
  drop constraint if exists user_websites_status_check;
alter table public.user_websites
  add constraint user_websites_status_check
  check (status in ('pending', 'processing', 'completed', 'failed', 'flagged'));

-- The DB-level double-submit guard api/websites/generate catches (23505)
-- and turns into "you already started this one" instead of a second paid
-- generation.
create unique index if not exists user_websites_pending_dedup_idx
  on public.user_websites (user_id, name) where status = 'pending';

-- ----------------------------------------------------------------------------
-- Three more columns the same restore lost, found by
-- scripts/tests/schema-drift.test.mjs while fixing the four above. None of
-- them had been reported yet; all three break a shipped feature.
-- ----------------------------------------------------------------------------

-- api/websites/edit claims a row with this and refuses to start on one
-- claimed recently. Without it, two concurrent edits of one site both
-- spend money and race each other's HTML.
alter table public.user_websites
  add column if not exists editing_started_at timestamptz;

-- lib/mission-plan-steps.ts writes back with .eq("plan_steps_version",
-- current) and treats zero rows as "somebody else changed it". Without the
-- column there is no race check and two tabs overwrite each other.
alter table public.ai_missions
  add column if not exists plan_steps_version integer not null default 0;

-- Free-chat allowance accounting (lib/billing/free-chat-usage.ts).
alter table public.user_credits
  add column if not exists free_chat_used integer not null default 0;
alter table public.user_credits
  add column if not exists free_chat_period_start timestamptz;

-- ----------------------------------------------------------------------------
-- Verification. Run this after the statements above: every row must read
-- ok, and status_check_allows_flagged must be true.
-- ----------------------------------------------------------------------------
select
  c.column_name,
  case when c.column_name is null then 'MISSING' else 'ok' end as state
from (values
  ('description'), ('is_large_request'), ('free_retry_used'),
  ('stuck_notified_at'), ('attempt_count'), ('has_reference_images')
) as required(column_name)
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = 'user_websites'
 and c.column_name = required.column_name;

select
  pg_get_constraintdef(oid) like '%flagged%' as status_check_allows_flagged,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.user_websites'::regclass
  and conname = 'user_websites_status_check';
