-- Two credit moves that only ever go DOWN (the billing review of
-- 2026-11-05, docs/SECURITY-AUDIT.md ΑΣ-4.15 and ΑΣ-4.18).
--
-- 1. clamp_credits_to_plan — a move to a lower plan, and the end of a
--    subscription. reset_monthly_credits SETS the balance to the plan's
--    allowance plus what was bought, so on a downgrade it RAISED an account
--    that had spent the higher plan's allowance. This one can only lower
--    it: credits_remaining becomes least(what is there, the lower plan's
--    allowance + purchased). It moves plan_tier and credits_total with it,
--    exactly as the reset does, and writes one ledger row for what it took
--    off (none when nothing was above the line). Called by
--    clampCreditsToPlan in src/lib/billing/credits.ts, from the Stripe
--    webhook when lib/billing/subscription-sync.ts decides "clamp".
--
-- 2. reverse_purchased_credits — a refunded or lost-dispute credit pack.
--    The pack's credits are taken back from the balance AND from the
--    purchased sub-ledger (otherwise the next monthly reset would add them
--    straight back), floored at zero: credits already spent are not owed
--    back as a negative balance. Claimed once per idempotency key in
--    credit_transactions, like every other grant, and the ledger row
--    records what was actually taken. Called by reversePurchasedCredits in
--    src/lib/billing/credits.ts, from the webhook's refund and dispute
--    handlers.
--
-- Both are SECURITY DEFINER for service_role only, the same posture as
-- reset_monthly_credits and grant_credits_idempotent
-- (20260815_purchased_credits.sql): a signed-in user can never call them.
--
-- Safe to paste twice: CREATE OR REPLACE, and the grants are idempotent.
-- The application works before this file has run — both callers log the
-- missing function and leave the balance untouched, which never gives
-- anything away — and /api/health names this file until it has run.
--
-- How to undo: drop function if exists public.clamp_credits_to_plan(uuid, integer, text, text); drop function if exists public.reverse_purchased_credits(uuid, integer, text, text); — the callers then log and leave the balance as it is.

create or replace function public.clamp_credits_to_plan(
  p_user_id uuid,
  p_monthly integer,
  p_plan_tier text,
  p_description text default 'Moved to a lower plan'
)
returns table (credits_remaining integer, removed integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before integer;
  v_after integer;
begin
  select uc.credits_remaining into v_before
    from public.user_credits uc
   where uc.user_id = p_user_id
   for update;

  if v_before is null then
    -- No row means no balance to lower. The next read initialises it at
    -- the account's plan (getOrInitCredits), which is already the lower one.
    return;
  end if;

  update public.user_credits uc
     set credits_remaining = least(uc.credits_remaining, greatest(p_monthly, 0) + uc.purchased_credits),
         credits_total     = greatest(p_monthly, 0),
         plan_tier         = p_plan_tier,
         updated_at        = now()
   where uc.user_id = p_user_id
  returning uc.credits_remaining into v_after;

  if v_after < v_before then
    insert into public.credit_transactions (user_id, amount, action_type, description)
      values (p_user_id, v_after - v_before, 'plan_downgrade', p_description);
  end if;

  return query select v_after, v_before - v_after;
end;
$$;

create or replace function public.reverse_purchased_credits(
  p_user_id uuid,
  p_amount integer,
  p_idempotency_key text,
  p_description text
)
returns table (applied boolean, debited integer, credits_remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
  v_before integer;
  v_debit integer;
  v_after integer;
begin
  if p_amount is null or p_amount <= 0 or p_idempotency_key is null then
    return query select false, 0, null::integer;
    return;
  end if;

  -- The claim first, as grant_credits_idempotent does: a redelivered
  -- refund event finds its key taken and changes nothing.
  insert into public.credit_transactions (user_id, amount, action_type, description, idempotency_key)
    values (p_user_id, -p_amount, 'refund_reversal', p_description, p_idempotency_key)
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return query
      select false, 0, (select uc.credits_remaining from public.user_credits uc where uc.user_id = p_user_id);
    return;
  end if;

  select uc.credits_remaining into v_before
    from public.user_credits uc
   where uc.user_id = p_user_id
   for update;

  -- NEVER BELOW ZERO. What is already spent cannot be taken back as a
  -- negative balance; the ledger row says how much actually was.
  v_debit := least(p_amount, greatest(coalesce(v_before, 0), 0));

  if v_before is not null then
    update public.user_credits uc
       set credits_remaining = uc.credits_remaining - v_debit,
           purchased_credits = least(greatest(uc.purchased_credits - p_amount, 0), uc.credits_remaining - v_debit),
           updated_at        = now()
     where uc.user_id = p_user_id
    returning uc.credits_remaining into v_after;
  end if;

  update public.credit_transactions
     set amount = -v_debit,
         description = left(p_description || ' (' || p_amount || ' requested, ' || v_debit || ' taken)', 500)
   where idempotency_key = p_idempotency_key;

  return query select true, v_debit, v_after;
end;
$$;

revoke all on function public.clamp_credits_to_plan(uuid, integer, text, text) from public;
revoke all on function public.reverse_purchased_credits(uuid, integer, text, text) from public;
grant execute on function public.clamp_credits_to_plan(uuid, integer, text, text) to service_role;
grant execute on function public.reverse_purchased_credits(uuid, integer, text, text) to service_role;
