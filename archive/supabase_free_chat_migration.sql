-- ===========================================================================
-- Free chat: a monthly allowance of chat messages that cost no credits.
--
-- Safe to run more than once.
--
-- The counter lives on user_credits rather than in its own table because
-- it is per-user, single-row, and read on the same page loads that already
-- read the balance.
--
-- The period is the calendar month in UTC, reset lazily inside the same
-- statement that consumes a message. Deliberately not the Stripe billing
-- anniversary: that would need the subscription's current_period_start on
-- every message, and a webhook that has not landed yet would silently deny
-- free messages the user is owed.
-- ===========================================================================

alter table public.user_credits
  add column if not exists free_chat_used integer not null default 0,
  add column if not exists free_chat_period_start timestamptz;

-- ---------------------------------------------------------------------------
-- consume_free_chat: claim one free message, atomically.
--
-- The bounds check and the increment are ONE statement on purpose. A
-- read-then-write would let two messages sent from two tabs both read the
-- same "used" value and both be granted, overrunning the allowance. Here
-- the row lock taken by the UPDATE serialises them, and the second one
-- fails its WHERE clause and is refused.
-- ---------------------------------------------------------------------------
create or replace function public.consume_free_chat(p_user_id uuid, p_limit integer)
returns table (granted boolean, used integer, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- release_free_chat: hand a claimed message back when the AI call failed.
--
-- Guarded on both the period and a positive count so a late release can
-- never push the counter negative or refund into a new month.
-- ---------------------------------------------------------------------------
create or replace function public.release_free_chat(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- Both functions are SECURITY DEFINER and take the limit as an argument, so
-- a logged-in user who could call consume_free_chat directly would simply
-- pass p_limit => 999999 and grant themselves unlimited free messages.
-- Execute is therefore service_role only — the app calls them with the
-- service-role client, never from the browser.
-- ---------------------------------------------------------------------------
revoke all on function public.consume_free_chat(uuid, integer) from public;
revoke all on function public.release_free_chat(uuid) from public;
grant execute on function public.consume_free_chat(uuid, integer) to service_role;
grant execute on function public.release_free_chat(uuid) to service_role;
