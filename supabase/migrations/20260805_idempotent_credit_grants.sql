-- ============================================================================
-- Idempotent, atomic credit grants.
--
-- Fixes two defects found in the V1+V2 audit, both in lib/billing/credits.ts's
-- grantCredits():
--
--   1. DUPLICATE PURCHASE GRANTS (money). The Stripe webhook called
--      grantCredits() for every checkout.session.completed it received, with
--      no record of which events had already been handled. Stripe's webhook
--      delivery is explicitly AT-LEAST-ONCE: the same event can arrive more
--      than once after a timeout on our side, after a Stripe-side retry, or
--      when someone resends it from the dashboard. Every duplicate granted
--      the full credit pack again — up to 8,000 free credits per replay.
--
--   2. LOST UPDATES (money). The grant was a read-modify-write across two
--      round trips:
--
--          const { data: row } = await admin.from("user_credits").select(...)
--          const nextRemaining = (row?.credits_remaining ?? 0) + amount;
--          await admin.from("user_credits").upsert({ credits_remaining: ... })
--
--      Two grants that overlap in that window both read the same starting
--      balance and the second write overwrites the first. One grant vanishes
--      with no error anywhere. Same class of race the billing system already
--      closed for RESERVATIONS with reserve_credits' FOR UPDATE — grants were
--      simply never given the same treatment.
--
-- Both are fixed by moving the whole operation into one statement-level
-- transaction, with the transaction log itself acting as the idempotency
-- ledger: a unique key on credit_transactions means the FIRST writer of a
-- given key wins and every replay is a no-op.
--
-- Safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The idempotency ledger.
--
-- Nullable on purpose: existing rows have no key, and grants with no natural
-- idempotency key (a manual admin adjustment, which is intentionally
-- repeatable) keep passing null. A partial unique index enforces uniqueness
-- only where a key is actually present, so nulls never collide with
-- each other.
-- ----------------------------------------------------------------------------
alter table public.credit_transactions
  add column if not exists idempotency_key text;

create unique index if not exists credit_transactions_idempotency_key_idx
  on public.credit_transactions (idempotency_key)
  where idempotency_key is not null;


-- ----------------------------------------------------------------------------
-- 2. grant_credits_idempotent
--
-- Returns (granted, credits_remaining):
--   granted = true  -> this call performed the grant
--   granted = false -> this key was already used; nothing changed
--
-- The caller can therefore tell a real grant from a replay, which matters for
-- anything that follows a grant (recording a pack purchase rate, sending a
-- receipt) and must not happen twice either.
-- ----------------------------------------------------------------------------
create or replace function public.grant_credits_idempotent(
  p_user_id uuid,
  p_amount integer,
  p_action_type text,
  p_description text,
  p_idempotency_key text default null,
  p_set_total integer default null,
  p_set_plan_tier text default null,
  p_set_beta_expires_at timestamptz default null
)
returns table (granted boolean, credits_remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
  v_remaining integer;
begin
  -- Claim the key FIRST. The unique index is the serialisation point: of two
  -- concurrent replays exactly one insert survives, and it does so before any
  -- balance is touched.
  if p_idempotency_key is not null then
    insert into public.credit_transactions (user_id, amount, action_type, description, idempotency_key)
      values (p_user_id, p_amount, p_action_type, p_description, p_idempotency_key)
      on conflict (idempotency_key) where idempotency_key is not null do nothing;

    get diagnostics v_inserted = row_count;

    if v_inserted = 0 then
      -- Already granted. Report the CURRENT balance so the caller still has a
      -- truthful number to show.
      select uc.credits_remaining into v_remaining
        from public.user_credits uc
        where uc.user_id = p_user_id;
      return query select false, coalesce(v_remaining, 0);
      return;
    end if;
  else
    insert into public.credit_transactions (user_id, amount, action_type, description)
      values (p_user_id, p_amount, p_action_type, p_description);
  end if;

  -- Atomic increment. `credits_remaining + p_amount` is evaluated by Postgres
  -- against the row it is locking, so no read from the application can go
  -- stale between the check and the write.
  insert into public.user_credits (
    user_id, credits_remaining, credits_total, plan_tier, beta_expires_at
  ) values (
    p_user_id,
    greatest(p_amount, 0),
    coalesce(p_set_total, greatest(p_amount, 0)),
    coalesce(p_set_plan_tier, 'free'),
    p_set_beta_expires_at
  )
  on conflict (user_id) do update
    set credits_remaining = public.user_credits.credits_remaining + p_amount,
        credits_total     = coalesce(p_set_total, public.user_credits.credits_total),
        plan_tier         = coalesce(p_set_plan_tier, public.user_credits.plan_tier),
        beta_expires_at   = coalesce(p_set_beta_expires_at, public.user_credits.beta_expires_at),
        updated_at        = now()
  returning public.user_credits.credits_remaining into v_remaining;

  return query select true, coalesce(v_remaining, 0);
end;
$$;


-- Service-role only, same posture as reserve_credits / settle_reservation:
-- this function grants credits, so a logged-in user must never be able to
-- call it directly with the anon key.
revoke all on function public.grant_credits_idempotent(
  uuid, integer, text, text, text, integer, text, timestamptz
) from public;
revoke all on function public.grant_credits_idempotent(
  uuid, integer, text, text, text, integer, text, timestamptz
) from anon;
revoke all on function public.grant_credits_idempotent(
  uuid, integer, text, text, text, integer, text, timestamptz
) from authenticated;
grant execute on function public.grant_credits_idempotent(
  uuid, integer, text, text, text, integer, text, timestamptz
) to service_role;
