-- ============================================================================
-- BASELINE, PART TWO — what the "full project backup" did not contain
--
-- supabase_full_project_backup.sql describes itself as "the union of every
-- *.sql file in the repo root". It is not. Loaded on its own into an empty
-- database and compared against the result of running every root file, it
-- is short by thirty-two objects — including USER_FAVORITES, which is the
-- Favorites feature: the table, its three policies and its indexes are in
-- supabase_schema.sql and were never carried into the consolidation.
--
-- That is the whole reason this pair of files exists rather than one. A
-- file that says it is complete and is not is worse than one that says
-- nothing, because nobody re-checks it.
--
-- Everything here was generated from a live database built by running the
-- root files in dependency order, then diffed against the baseline —
-- measured, not transcribed. Sources:
--
--   user_favorites            supabase_schema.sql / supabase_complete_schema.sql
--   security_check_log        supabase_complete_schema.sql
--   website_form_submissions  supabase_complete_schema.sql
--   production_errors         supabase_error_tracking_migration.sql
--   consume_free_chat         supabase_free_chat_migration.sql
--   release_free_chat         supabase_free_chat_migration.sql
--   deduct_credits_atomic     supabase_credits_schema.sql
--   record_production_error   supabase_error_tracking_migration.sql
--   create-attachments RLS    supabase_complete_schema.sql
--
-- IDEMPOTENT THROUGHOUT. Tables and indexes use IF NOT EXISTS; constraints
-- and policies have no such clause in Postgres, so each is wrapped in a
-- DO block that swallows only the already-exists error. No DROP TABLE, no
-- TRUNCATE, no unqualified DELETE.
-- ============================================================================

\restrict d3VfwfZaDpkDuR66U0krMTZzJPXkCgFasL3ZtbhR38EHYelOMeWt3PhpmckqNCR

create table if not exists public.production_errors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fingerprint text NOT NULL,
    error_message text NOT NULL,
    stack_trace text,
    route text DEFAULT 'unknown'::text NOT NULL,
    user_id uuid,
    affected_user_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    occurrence_count integer DEFAULT 1 NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved boolean DEFAULT false NOT NULL,
    resolved_at timestamp with time zone,
    last_alerted_at timestamp with time zone
);

create table if not exists public.security_check_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    check_result jsonb NOT NULL,
    checked_at timestamp with time zone DEFAULT now() NOT NULL
);

create table if not exists public.user_favorites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    table_name text NOT NULL,
    record_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

create table if not exists public.website_form_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    website_id uuid NOT NULL,
    user_id uuid NOT NULL,
    fields jsonb NOT NULL,
    classification text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'production_errors_fingerprint_key'
                   and conrelid = 'public.production_errors'::regclass) then
    alter table public.production_errors add constraint production_errors_fingerprint_key UNIQUE (fingerprint);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'production_errors_pkey'
                   and conrelid = 'public.production_errors'::regclass) then
    alter table public.production_errors add constraint production_errors_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'security_check_log_pkey'
                   and conrelid = 'public.security_check_log'::regclass) then
    alter table public.security_check_log add constraint security_check_log_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_favorites_pkey'
                   and conrelid = 'public.user_favorites'::regclass) then
    alter table public.user_favorites add constraint user_favorites_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_favorites_user_id_table_name_record_id_key'
                   and conrelid = 'public.user_favorites'::regclass) then
    alter table public.user_favorites add constraint user_favorites_user_id_table_name_record_id_key UNIQUE (user_id, table_name, record_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'website_form_submissions_pkey'
                   and conrelid = 'public.website_form_submissions'::regclass) then
    alter table public.website_form_submissions add constraint website_form_submissions_pkey PRIMARY KEY (id);
  end if;
end $$;

create index if not exists production_errors_occurred_at_idx ON public.production_errors USING btree (occurred_at DESC);

create index if not exists production_errors_unresolved_idx ON public.production_errors USING btree (resolved, occurred_at DESC);

create index if not exists security_check_log_resource_idx ON public.security_check_log USING btree (resource_type, resource_id, checked_at DESC);

create index if not exists security_check_log_user_id_idx ON public.security_check_log USING btree (user_id);

create index if not exists user_favorites_user_id_created_at_idx ON public.user_favorites USING btree (user_id, created_at DESC);

create index if not exists website_form_submissions_website_id_created_at_idx ON public.website_form_submissions USING btree (website_id, created_at);

create index if not exists website_form_submissions_website_id_idx ON public.website_form_submissions USING btree (website_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'security_check_log_user_id_fkey'
                   and conrelid = 'public.security_check_log'::regclass) then
    alter table public.security_check_log add constraint security_check_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_favorites_user_id_fkey'
                   and conrelid = 'public.user_favorites'::regclass) then
    alter table public.user_favorites add constraint user_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'website_form_submissions_user_id_fkey'
                   and conrelid = 'public.website_form_submissions'::regclass) then
    alter table public.website_form_submissions add constraint website_form_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  create policy delete_own_user_favorites ON public.user_favorites FOR DELETE USING ((auth.uid() = user_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy insert_own_security_check_log ON public.security_check_log FOR INSERT WITH CHECK ((auth.uid() = user_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy insert_own_user_favorites ON public.user_favorites FOR INSERT WITH CHECK ((auth.uid() = user_id));
exception when duplicate_object then null; end $$;

ALTER TABLE public.production_errors ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.security_check_log ENABLE ROW LEVEL SECURITY;

do $$ begin
  create policy select_own_security_check_log ON public.security_check_log FOR SELECT USING ((auth.uid() = user_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy select_own_user_favorites ON public.user_favorites FOR SELECT USING ((auth.uid() = user_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy select_own_website_form_submissions ON public.website_form_submissions FOR SELECT USING ((auth.uid() = user_id));
exception when duplicate_object then null; end $$;

ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.website_form_submissions ENABLE ROW LEVEL SECURITY;

\unrestrict d3VfwfZaDpkDuR66U0krMTZzJPXkCgFasL3ZtbhR38EHYelOMeWt3PhpmckqNCR


-- ---------------------------------------------------------------------
-- FUNCTIONS. CREATE OR REPLACE is idempotent by definition. Grants are
-- set in 20260818000000_function_grants.sql, which covers every function
-- in the schema rather than only these four.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_free_chat(p_user_id uuid, p_limit integer)
 RETURNS TABLE(granted boolean, used integer, remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_period timestamptz := date_trunc('month', (now() at time zone 'utc')) at time zone 'utc';
  v_used integer;
begin
  if p_user_id is null or p_limit is null or p_limit <= 0 then
    return query select false, 0, 0;
    return;
  end if;

  -- The row may not exist yet for a user who has never had credits synced.
  insert into public.user_credits (user_id, free_chat_used, free_chat_period_start)
  values (p_user_id, 0, v_period)
  on conflict (user_id) do nothing;

  -- A period that isn't the current month counts as zero used, so the
  -- reset needs no scheduled job and cannot be missed.
  update public.user_credits uc
     set free_chat_used =
           (case
              when uc.free_chat_period_start is distinct from v_period then 0
              else uc.free_chat_used
            end) + 1,
         free_chat_period_start = v_period
   where uc.user_id = p_user_id
     and (case
            when uc.free_chat_period_start is distinct from v_period then 0
            else uc.free_chat_used
          end) < p_limit
  returning uc.free_chat_used into v_used;

  if v_used is null then
    -- WHERE didn't match: the allowance is spent for this period.
    select coalesce(uc.free_chat_used, 0) into v_used
      from public.user_credits uc
     where uc.user_id = p_user_id;
    return query select false, coalesce(v_used, 0), 0;
    return;
  end if;

  return query select true, v_used, greatest(p_limit - v_used, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.deduct_credits_atomic(p_user_id uuid, p_amount integer, p_initial_credits integer, p_plan_tier text)
 RETURNS TABLE(ok boolean, remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_remaining integer;
begin
  insert into public.user_credits (user_id, credits_remaining, credits_total, plan_tier)
  values (p_user_id, p_initial_credits, p_initial_credits, p_plan_tier)
  on conflict (user_id) do nothing;

  update public.user_credits
  set credits_remaining = credits_remaining - p_amount
  where user_id = p_user_id and credits_remaining >= p_amount
  returning credits_remaining into v_remaining;

  if v_remaining is null then
    select credits_remaining into v_remaining from public.user_credits where user_id = p_user_id;
    return query select false, coalesce(v_remaining, 0);
  else
    return query select true, v_remaining;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_production_error(p_fingerprint text, p_message text, p_stack text, p_route text, p_user_id uuid, p_alert_window interval DEFAULT '00:15:00'::interval, p_alert_cooldown interval DEFAULT '01:00:00'::interval)
 RETURNS TABLE(occurrence_count integer, affected_users integer, recent_count integer, should_alert boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.production_errors%rowtype;
  v_recent integer;
  v_affected integer;
  v_alert boolean := false;
begin
  insert into public.production_errors as pe (
    fingerprint, error_message, stack_trace, route, user_id,
    affected_user_ids, occurrence_count, first_seen_at, occurred_at
  )
  values (
    p_fingerprint, p_message, p_stack, coalesce(p_route, 'unknown'), p_user_id,
    case when p_user_id is null then '{}'::uuid[] else array[p_user_id] end,
    1, now(), now()
  )
  on conflict (fingerprint) do update set
    occurrence_count = pe.occurrence_count + 1,
    occurred_at = now(),
    -- Keep the newest message/stack: the code may have changed since the
    -- error was first seen, and a stale trace sends you to the wrong line.
    error_message = excluded.error_message,
    stack_trace = coalesce(excluded.stack_trace, pe.stack_trace),
    user_id = coalesce(excluded.user_id, pe.user_id),
    affected_user_ids = case
      when p_user_id is null or p_user_id = any(pe.affected_user_ids)
        then pe.affected_user_ids
      -- Bounded so a bug hitting thousands of users cannot grow one row
      -- without limit; 50 is far past either alert threshold.
      when array_length(pe.affected_user_ids, 1) >= 50 then pe.affected_user_ids
      else pe.affected_user_ids || p_user_id
    end,
    -- A previously-resolved error that happens again is a REGRESSION and
    -- must reopen, or a fixed-then-broken bug stays invisible.
    resolved = false,
    resolved_at = null
  returning pe.* into v_row;

  -- Occurrences inside the alert window. Derived from the window and the
  -- counters rather than a separate events table: this row is the only
  -- record, so "recent" means "the burst that is still going".
  v_recent := case
    when v_row.occurred_at - v_row.first_seen_at <= p_alert_window
      then v_row.occurrence_count
    else 1
  end;
  v_affected := coalesce(array_length(v_row.affected_user_ids, 1), 0);

  -- Two independent triggers, per the brief: a burst from one user, or
  -- the same failure reaching more than one.
  if (v_recent >= 3 or v_affected >= 2)
     and (v_row.last_alerted_at is null
          or v_row.last_alerted_at < now() - p_alert_cooldown) then
    v_alert := true;
    update public.production_errors
       set last_alerted_at = now()
     where id = v_row.id;
  end if;

  return query select v_row.occurrence_count, v_affected, v_recent, v_alert;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.release_free_chat(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_period timestamptz := date_trunc('month', (now() at time zone 'utc')) at time zone 'utc';
  v_used integer;
begin
  if p_user_id is null then
    return 0;
  end if;

  update public.user_credits uc
     set free_chat_used = uc.free_chat_used - 1
   where uc.user_id = p_user_id
     and uc.free_chat_period_start = v_period
     and uc.free_chat_used > 0
  returning uc.free_chat_used into v_used;

  return coalesce(v_used, 0);
end;
$function$
;

-- ---------------------------------------------------------------------
-- Storage RLS for the create-attachments bucket.
-- ---------------------------------------------------------------------
do $$ begin
  create policy delete_own_create_attachments on storage.objects for delete to public using (((bucket_id = 'create-attachments'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy insert_own_create_attachments on storage.objects for insert to public with check (((bucket_id = 'create-attachments'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy select_own_create_attachments on storage.objects for select to public using (((bucket_id = 'create-attachments'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
exception when duplicate_object then null; end $$;

-- A NOTE ON FOUR INDEXES, AND HOW THIS FILE ALMOST DROPPED THEM.
--
-- An earlier draft ended with four "drop index" statements for
-- finance_entries_user_occurred_idx and its siblings, on the evidence
-- that a database built from the root files did not have them. The
-- evidence was wrong, and the way it was wrong is worth recording.
--
-- That comparison database had been built with supabase_schema.sql LAST.
-- That file drops and re-creates the twelve module tables, so it silently
-- discarded every column and index v3_instant_value_migration.sql had
-- added minutes earlier. The four indexes looked absent because the run
-- order had destroyed them, not because anything meant them to go.
--
-- Both supabase_full_project_backup.sql and v3_instant_value_migration.sql
-- create them and nothing drops them. They stay.


-- ---------------------------------------------------------------------
-- NINE COLUMNS the backup also missed — and the reason the object-level
-- comparison that built this file was not enough on its own.
--
-- Comparing tables, functions, policies and indexes said the two schemas
-- matched. They did not: a table can be present with the right name and
-- still be missing the columns a feature needs, and every check that
-- looks at object NAMES stays green while that is true. Free chat reads
-- free_chat_used on every message and grandfathering reads all six
-- legacy_* columns to decide what an old subscriber is owed; without
-- them both features fail at runtime against a schema that looks
-- complete.
--
--   free_chat_*    supabase_free_chat_migration.sql
--   legacy_*       supabase_grandfathering_migration.sql
--   is_large_request  website_reliability_migration.sql
-- ---------------------------------------------------------------------
alter table public.user_credits add column if not exists free_chat_period_start timestamp with time zone;
alter table public.user_credits add column if not exists free_chat_used integer default 0;
alter table public.user_credits add column if not exists legacy_entitlements_backfilled_at timestamp with time zone;
alter table public.user_credits add column if not exists legacy_entitlements_until timestamp with time zone;
alter table public.user_credits add column if not exists legacy_free_chat_history_limit integer;
alter table public.user_credits add column if not exists legacy_free_chat_max_output_tokens integer;
alter table public.user_credits add column if not exists legacy_free_chat_messages integer;
alter table public.user_credits add column if not exists legacy_plan_tier text;
alter table public.user_websites add column if not exists is_large_request boolean default false;

-- ---------------------------------------------------------------------
-- TWO PARTIAL INDEXES the backup also missed.
--
--   user_credits_legacy_entitlements_idx   supabase_grandfathering_migration.sql
--   user_websites_pending_dedup_idx        supabase_schema.sql
--
-- The second one is not an optimisation: it is a UNIQUE index over
-- (user_id, name) restricted to pending rows, which is what stops a
-- double-click on "create website" producing two half-built sites with
-- the same name. Losing it loses a correctness guarantee, silently.
-- ---------------------------------------------------------------------
create index if not exists user_credits_legacy_entitlements_idx
  on public.user_credits using btree (legacy_plan_tier)
  where (legacy_free_chat_messages is not null);

create unique index if not exists user_websites_pending_dedup_idx
  on public.user_websites using btree (user_id, name)
  where (status = 'pending'::text);
