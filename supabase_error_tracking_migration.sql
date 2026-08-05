-- ===========================================================================
-- PRODUCTION ERROR TRACKING
--
-- Safe to run more than once.
--
-- The point of this table is NOT to store every exception — it is to
-- answer "is something broken right now, and for how many people". So
-- identical errors collapse into one row with a counter and a first/last
-- seen window, rather than accumulating thousands of rows nobody reads.
-- ===========================================================================

create table if not exists public.production_errors (
  id uuid primary key default gen_random_uuid(),

  -- The dedup key: a hash of (normalised message + route). Two crashes
  -- from the same bug land on the same fingerprint even though their
  -- timestamps, user ids and interpolated values differ.
  fingerprint text not null unique,

  error_message text not null,
  stack_trace text,
  route text not null default 'unknown',

  -- The user who hit it MOST RECENTLY. The full set is in
  -- affected_user_ids — a single column could not answer "how many
  -- different people is this hitting", which is one of the two alert
  -- conditions.
  user_id uuid,
  affected_user_ids uuid[] not null default '{}',

  occurrence_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  occurred_at timestamptz not null default now(),

  resolved boolean not null default false,
  resolved_at timestamptz,

  -- When the owner was last emailed about THIS fingerprint. Without it a
  -- persistent error would send an alert on every single occurrence.
  last_alerted_at timestamptz
);

create index if not exists production_errors_occurred_at_idx
  on public.production_errors (occurred_at desc);
create index if not exists production_errors_unresolved_idx
  on public.production_errors (resolved, occurred_at desc);

alter table public.production_errors enable row level security;

-- No policies on purpose. RLS with zero policies denies everything, which
-- is exactly right here: this table holds other customers' stack traces
-- and is only ever read or written by the service-role client (which
-- bypasses RLS) behind the owner-only /dashboard/system-health gate.
-- A policy granting users their own rows would leak the existence and
-- shape of platform-wide failures.

-- ---------------------------------------------------------------------------
-- record_production_error: upsert-by-fingerprint, atomically.
--
-- Returns the counters the caller needs to decide whether to alert, so
-- the decision is made on values that were just committed rather than on
-- a follow-up SELECT that could race another request.
--
-- p_alert_window: how far back "3+ occurrences" is measured.
-- p_alert_cooldown: minimum gap between two alerts for the same error.
-- ---------------------------------------------------------------------------
create or replace function public.record_production_error(
  p_fingerprint text,
  p_message text,
  p_stack text,
  p_route text,
  p_user_id uuid,
  p_alert_window interval default interval '15 minutes',
  p_alert_cooldown interval default interval '60 minutes'
)
returns table (
  occurrence_count integer,
  affected_users integer,
  recent_count integer,
  should_alert boolean
)
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.record_production_error(text, text, text, text, uuid, interval, interval) from public;
grant execute on function public.record_production_error(text, text, text, text, uuid, interval, interval) to service_role;
