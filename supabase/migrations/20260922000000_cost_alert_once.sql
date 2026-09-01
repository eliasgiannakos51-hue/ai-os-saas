-- TWO ALERTS FOR ONE EVENT, INSIDE THE INTERVAL THAT EXISTS TO PREVENT IT.
--
-- record_cost_alert() suppresses a repeat with
--
--     insert into public.cost_alert_log (alert_type, payload)
--     select ...
--     where not exists (select 1 from public.cost_alert_log
--                        where alert_type = p_alert_type
--                          and created_at > now() - interval);
--
-- One statement, which makes it look atomic. It is not. At READ
-- COMMITTED — PostgreSQL's default and Supabase's — two transactions
-- arriving together each evaluate `not exists` against a snapshot that
-- does not contain the other's uncommitted row, both find nothing, and
-- both insert. There is no unique constraint to catch the second, because
-- the condition is a rolling time window and a unique index cannot
-- express one.
--
-- WHAT IT COSTS: two identical cost alerts in the owner's inbox for one
-- event, and a p_min_interval_seconds that means "usually" rather than
-- "at most once per interval". Not money — the alert is a notification,
-- not a charge — but the whole purpose of the parameter is the guarantee
-- it does not make.
--
-- FOUND BY SCANNING THE SQL, not the application. The earlier sweep
-- looked at `.update()` payloads in TypeScript, which is where the four
-- known read-modify-writes were; a race written entirely inside one SQL
-- statement was invisible to it. Sixty-one functions scanned, two
-- candidates, one of them a `with ... update ... returning` CTE that is
-- genuinely atomic, and this one.
--
-- THE FIX IS THE SAME LOCK consume_rate_limit uses, and for the same
-- reason: the condition is "at most N in a rolling window", which no
-- constraint expresses. Keyed on the alert TYPE, so two different alerts
-- never wait for each other.
--
-- Idempotent: create or replace, same signature, no grant changes.

create or replace function public.record_cost_alert(
  p_alert_type text,
  p_payload jsonb default '{}'::jsonb,
  p_min_interval_seconds integer default 3600
)
returns table (fired boolean, alert_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Transaction-scoped, released when this rpc call's implicit
  -- transaction ends. Two callers for the same alert_type serialise here;
  -- the loser then sees the winner's committed row and its `not exists`
  -- is correctly false.
  perform pg_advisory_xact_lock(hashtextextended('cost_alert:' || coalesce(p_alert_type, ''), 0));

  insert into public.cost_alert_log (alert_type, payload)
  select p_alert_type, coalesce(p_payload, '{}'::jsonb)
  where not exists (
    select 1 from public.cost_alert_log
    where alert_type = p_alert_type
      and created_at > now() - make_interval(secs => greatest(p_min_interval_seconds, 0))
  )
  returning id into v_id;

  return query select v_id is not null, v_id;
end;
$$;
