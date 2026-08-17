-- Purchased credits never expire.
--
-- IDEMPOTENT. Every statement is guarded and every function is CREATE OR
-- REPLACE. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
--
-- ============================================================================
-- WHAT WAS WRONG
-- ============================================================================
-- A credit pack ADDS to user_credits.credits_remaining; nothing recorded
-- that the addition was paid for separately. Three different code paths
-- then wrote that column back down to the plan's monthly allotment:
--
--   * invoice.paid           — every month, at renewal
--   * a plan change          — upgrade or downgrade
--   * subscription.deleted   — at the end of a cancelled subscription
--
-- so a 5,000-credit pack bought on the 3rd was gone on the 1st. The money
-- was kept; the credits were not.
--
-- ============================================================================
-- THE SHAPE, AND WHY credits_remaining KEEPS ITS MEANING
-- ============================================================================
-- credits_remaining stays THE TOTAL SPENDABLE BALANCE. It is read in
-- dozens of places — every gate, every display, every reservation — and
-- redefining it to "the monthly part only" would silently change what all
-- of them mean, with no compiler and no test able to see it.
--
-- purchased_credits is a SUB-LEDGER: how much of that balance came from
-- packs. So at any moment:
--
--     monthly part = credits_remaining - purchased_credits
--
-- SPENDING n (monthly first, then purchased):
--     credits_remaining := credits_remaining - n
--     purchased_credits := least(purchased_credits, credits_remaining)
--
-- The second line is the whole rule. While the monthly part covers the
-- spend, credits_remaining stays above purchased_credits and the least()
-- leaves it alone. Only once the balance falls below the purchased amount
-- does the purchased figure follow it down — which is exactly "monthly is
-- eaten first". One expression, evaluated by Postgres against the row it
-- is locking, so it is as atomic as the decrement it rides along with.
--
-- RESETTING THE MONTH:
--     credits_remaining := p_monthly + purchased_credits
--     purchased_credits := unchanged
--
-- ============================================================================

-- 1. The columns, and whether an EARLIER version of this file already ran
-- ---------------------------------------------------------------------------
--
-- THIS BLOCK EXISTS BECAUSE THE FIRST VERSION OF THIS FILE SHIPPED WITHOUT
-- THE MARKER COLUMN, and production already ran it.
--
-- On such a database, adding purchased_credits_backfilled_at leaves it NULL
-- on every row — which the backfill below reads as "never considered". It
-- would then run a SECOND time, and any account that has received a
-- non-purchased grant since the first run (goodwill, a beta top-up, an
-- admin adjustment) would have that grant reclassified as permanent
-- purchased credits. The fix for the idempotency bug would have done
-- exactly what the idempotency bug did.
--
-- MEASURED, not reasoned about: with only the `purchased_credits = 0` guard
-- below, a real cluster running 20260805 -> this file -> a 440-credit
-- admin_adjustment -> this file again moved that account from (540, 0) to
-- (540, 440). scripts/tests/credit-function-privileges.itest.mjs is that
-- sequence, and it went red until this block existed.
--
-- So the marker is seeded from a fact that is already true: if
-- purchased_credits EXISTS before this statement, the earlier version ran,
-- the backfill has happened, and every row alive at this moment has been
-- considered. A fresh database has no such column and no such history, so
-- nothing is marked and the backfill runs normally.
--
-- The detection has to happen BEFORE the ADD COLUMN, which is why the two
-- are in one block rather than two statements.
do $bootstrap$
declare
  v_earlier_version_ran boolean;
begin
  v_earlier_version_ran := exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'user_credits'
       and column_name  = 'purchased_credits'
  );

  alter table public.user_credits
    add column if not exists purchased_credits integer not null default 0;
  alter table public.user_credits
    add column if not exists purchased_credits_backfilled_at timestamptz;

  if v_earlier_version_ran then
    -- EXECUTE, not a plain UPDATE: plpgsql plans the statement when the
    -- block is first parsed, and purchased_credits_backfilled_at may not
    -- exist yet at that moment. A plain statement fails with "column does
    -- not exist" on exactly the databases this branch is for.
    execute $sql$
      update public.user_credits
         set purchased_credits_backfilled_at = now()
       where purchased_credits_backfilled_at is null
    $sql$;
    raise notice 'purchased_credits already existed: the earlier version of this migration ran, so every current row is marked as already considered and the backfill below is a no-op.';
  end if;
end
$bootstrap$;

comment on column public.user_credits.purchased_credits_backfilled_at is
  'When the purchased-credits backfill considered this row. Set once; its presence is what makes a re-run a no-op.';

-- Never negative, and never more than the balance it is part of: a
-- purchased figure above credits_remaining would claim the user holds
-- credits that are not there.
do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'user_credits_purchased_credits_check'
       and conrelid = 'public.user_credits'::regclass
  ) then
    alter table public.user_credits
      add constraint user_credits_purchased_credits_check
      check (purchased_credits >= 0 and purchased_credits <= credits_remaining);
  end if;
end
$constraint$;

-- 2. Backfill ---------------------------------------------------------------
-- Anyone whose balance is ABOVE their plan's monthly allotment is holding
-- the difference because they bought it — credits_total is what
-- syncCreditsForPlan writes as the plan's monthly figure, so the excess
-- cannot have come from anywhere else.
--
-- GUARDED ON THE MARKER, not on `purchased_credits = 0`.
--
-- The zero guard looks like it prevents a re-run and does not: an account
-- whose pack was fully spent, or one that never bought anything, sits at
-- zero forever and is eligible every single time this file is applied. All
-- it takes is a balance above the monthly allotment on that day — which a
-- goodwill grant produces — and a gift becomes permanent purchased credit.
--
-- The marker records that the row was CONSIDERED, which is the thing that
-- must not happen twice. Same mechanism grandfathering already uses
-- (legacy_entitlements_backfilled_at).
--
-- This recovers what is still in the balance; it does NOT recover what
-- earlier resets already destroyed — that is the restitution block at the
-- bottom, which is deliberately separate and commented out.
update public.user_credits
   set purchased_credits = greatest(credits_remaining - credits_total, 0),
       purchased_credits_backfilled_at = now()
 where purchased_credits_backfilled_at is null
   and credits_remaining > credits_total;

-- Everyone else is considered too. Without this, a row that simply had no
-- excess to claim stays unmarked and is re-examined on the next run — the
-- zero-guard bug wearing a different hat.
update public.user_credits
   set purchased_credits_backfilled_at = now()
 where purchased_credits_backfilled_at is null;

-- 3. Spending ---------------------------------------------------------------
create or replace function public.deduct_credits_atomic(
  p_user_id uuid,
  p_amount integer,
  p_initial_credits integer,
  p_plan_tier text
)
returns table(ok boolean, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  insert into public.user_credits (user_id, credits_remaining, credits_total, plan_tier)
  values (p_user_id, p_initial_credits, p_initial_credits, p_plan_tier)
  on conflict (user_id) do nothing;

  -- Monthly first, then purchased. Both columns move in ONE statement, so
  -- there is no window in which the balance has dropped and the sub-ledger
  -- has not — a crash between two statements would have left
  -- purchased_credits claiming credits that were already spent.
  update public.user_credits
  set credits_remaining = credits_remaining - p_amount,
      purchased_credits = least(purchased_credits, credits_remaining - p_amount)
  where user_id = p_user_id and credits_remaining >= p_amount
  returning credits_remaining into v_remaining;

  if v_remaining is null then
    select credits_remaining into v_remaining from public.user_credits where user_id = p_user_id;
    return query select false, coalesce(v_remaining, 0);
  else
    return query select true, v_remaining;
  end if;
end;
$$;

create or replace function public.settle_reservation(
  p_user_id uuid,
  p_reservation_id uuid,
  p_credits_to_charge integer,
  p_feature text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cache_write_tokens integer,
  p_cache_read_tokens integer,
  p_web_searches integer,
  p_ai_calls integer,
  p_real_cost_usd numeric,
  p_real_cost_eur numeric,
  p_margin_multiplier numeric,
  p_achieved_margin numeric,
  p_stage_breakdown jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reservation_id is not null then
    update public.credit_reservations
      set status = 'settled', resolved_at = now()
      where id = p_reservation_id and user_id = p_user_id and status = 'active';
  end if;

  if p_credits_to_charge > 0 then
    -- greatest(...,0) so a settlement can never drive the balance negative,
    -- even if a reservation expired mid-action and was swept before this
    -- ran. purchased_credits follows the same floor, and is clamped to the
    -- new balance so it can never exceed it.
    update public.user_credits
      set credits_remaining = greatest(credits_remaining - p_credits_to_charge, 0),
          purchased_credits = least(
            purchased_credits,
            greatest(credits_remaining - p_credits_to_charge, 0)
          ),
          updated_at = now()
      where user_id = p_user_id;

    insert into public.credit_transactions (user_id, amount, action_type, description)
      values (p_user_id, -p_credits_to_charge, p_feature, 'AI usage (settled at real cost)');
  end if;

  insert into public.ai_cost_log (
    user_id, feature, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens,
    web_searches, ai_calls, real_cost_usd, real_cost_eur, credits_charged,
    margin_multiplier, achieved_margin, stage_breakdown, metadata
  ) values (
    p_user_id, p_feature, p_input_tokens, p_output_tokens, p_cache_write_tokens,
    p_cache_read_tokens, p_web_searches, p_ai_calls, p_real_cost_usd, p_real_cost_eur,
    p_credits_to_charge, p_margin_multiplier, p_achieved_margin, p_stage_breakdown, p_metadata
  );
end;
$$;

-- 4. Granting ---------------------------------------------------------------
-- Same function, one new flag. A grant marked purchased raises BOTH the
-- balance and the sub-ledger; a plan grant, a beta grant and a manual
-- adjustment raise only the balance and therefore expire with the month,
-- which is what they are.
create or replace function public.grant_credits_idempotent(
  p_user_id uuid,
  p_amount integer,
  p_action_type text,
  p_description text,
  p_idempotency_key text default null,
  p_set_total integer default null,
  p_set_plan_tier text default null,
  p_set_beta_expires_at timestamptz default null,
  p_purchased boolean default false
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
  if p_idempotency_key is not null then
    insert into public.credit_transactions (user_id, amount, action_type, description, idempotency_key)
      values (p_user_id, p_amount, p_action_type, p_description, p_idempotency_key)
      on conflict (idempotency_key) where idempotency_key is not null do nothing;

    get diagnostics v_inserted = row_count;

    if v_inserted = 0 then
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

  insert into public.user_credits (
    user_id, credits_remaining, credits_total, plan_tier, beta_expires_at, purchased_credits
  ) values (
    p_user_id,
    greatest(p_amount, 0),
    coalesce(p_set_total, greatest(p_amount, 0)),
    coalesce(p_set_plan_tier, 'free'),
    p_set_beta_expires_at,
    case when p_purchased then greatest(p_amount, 0) else 0 end
  )
  on conflict (user_id) do update
    set credits_remaining = public.user_credits.credits_remaining + p_amount,
        credits_total     = coalesce(p_set_total, public.user_credits.credits_total),
        plan_tier         = coalesce(p_set_plan_tier, public.user_credits.plan_tier),
        beta_expires_at   = coalesce(p_set_beta_expires_at, public.user_credits.beta_expires_at),
        -- least(..., new balance) keeps the CHECK constraint true even when
        -- p_amount is NEGATIVE. grantCredits() is a grant helper, but
        -- nothing in its signature forbids a negative adjustment, and a
        -- constraint violation here would fail the whole grant rather than
        -- just mis-track the sub-ledger.
        purchased_credits = least(
                              case
                                when p_purchased
                                  then public.user_credits.purchased_credits + greatest(p_amount, 0)
                                else public.user_credits.purchased_credits
                              end,
                              greatest(public.user_credits.credits_remaining + p_amount, 0)
                            ),
        updated_at        = now()
  returning public.user_credits.credits_remaining into v_remaining;

  return query select true, coalesce(v_remaining, 0);
end;
$$;

-- 5. Resetting the month ----------------------------------------------------
-- One statement, so the balance can never be written without the purchased
-- part being added back. This replaces the application-side upsert in
-- syncCreditsForPlan(), which had no way to read and re-add purchased
-- credits without a race against a concurrent spend.
create or replace function public.reset_monthly_credits(
  p_user_id uuid,
  p_monthly integer,
  p_plan_tier text
)
returns table (credits_remaining integer, purchased_credits integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.user_credits (user_id, credits_remaining, credits_total, plan_tier)
    values (p_user_id, p_monthly, p_monthly, p_plan_tier)
  on conflict (user_id) do update
    set credits_remaining = p_monthly + public.user_credits.purchased_credits,
        credits_total     = p_monthly,
        plan_tier         = p_plan_tier,
        updated_at        = now()
  returning public.user_credits.credits_remaining, public.user_credits.purchased_credits;
end;
$$;

-- The free-tier monthly sweeper has the same obligation.
create or replace function public.reset_monthly_credits_for_unbilled(
  p_period date default (date_trunc('month', now() at time zone 'utc'))::date
)
returns table (user_id uuid, credits_granted integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', p_period)::date;
begin
  return query
  with reset as (
    update public.user_credits uc
       -- + purchased_credits: a free-tier account that bought a pack keeps
       -- it. Without this the sweeper deleted exactly what the pack was.
       set credits_remaining  = uc.credits_total + uc.purchased_credits,
           last_monthly_reset = v_period,
           updated_at         = now()
     where uc.plan_tier = 'free'
       and (uc.last_monthly_reset is null or uc.last_monthly_reset < v_period)
       and uc.credits_total > 0
       -- "Not already full" now means "below monthly + purchased", or an
       -- account holding a pack would look full and never be reset.
       and uc.credits_remaining < uc.credits_total + uc.purchased_credits
       and not exists (
         select 1
           from auth.users au
          where au.id = uc.user_id
            and coalesce(au.raw_user_meta_data ->> 'stripe_subscription_id', '') <> ''
       )
    returning uc.user_id, uc.credits_total
  )
  select reset.user_id, reset.credits_total from reset;
end;
$$;

-- Same posture as before: these grant or move credits, so a logged-in user
-- must never call them with the anon key.
revoke all on function public.grant_credits_idempotent(
  uuid, integer, text, text, text, integer, text, timestamptz, boolean
) from public;
revoke all on function public.reset_monthly_credits(uuid, integer, text) from public;
grant execute on function public.grant_credits_idempotent(
  uuid, integer, text, text, text, integer, text, timestamptz, boolean
) to service_role;
grant execute on function public.reset_monthly_credits(uuid, integer, text) to service_role;


-- ============================================================================
-- FORENSICS — WHO ALREADY LOST CREDITS
--
-- READ-ONLY. Run this on its own; it changes nothing.
--
-- A pack purchase is a credit_transactions row with action_type
-- 'purchase'. If the balance today is below what the account should be
-- holding (this month's allotment plus everything they ever bought and
-- have not spent), the difference was destroyed by a reset rather than
-- spent — and "spent" is measurable, because every charge is a negative
-- row in the same ledger.
--
--   expected_now = credits_total + total_purchased - total_spent_since_first_purchase
--
-- Anything below that, by more than a rounding of one credit, is loss.
-- ============================================================================
-- with purchases as (
--   select user_id,
--          sum(amount)              as purchased_total,
--          min(created_at)          as first_purchase_at,
--          count(*)                 as pack_count
--     from public.credit_transactions
--    where action_type = 'purchase' and amount > 0
--    group by user_id
-- ),
-- spend as (
--   select ct.user_id, coalesce(sum(-ct.amount), 0) as spent_since
--     from public.credit_transactions ct
--     join purchases p on p.user_id = ct.user_id
--    where ct.amount < 0
--      and ct.created_at >= p.first_purchase_at
--    group by ct.user_id
-- )
-- select uc.user_id,
--        uc.plan_tier,
--        uc.credits_total                      as monthly_allotment,
--        uc.credits_remaining                  as balance_now,
--        uc.purchased_credits                  as purchased_tracked_now,
--        p.pack_count,
--        p.purchased_total,
--        coalesce(s.spent_since, 0)            as spent_since_first_purchase,
--        greatest(
--          uc.credits_total + p.purchased_total - coalesce(s.spent_since, 0) - uc.credits_remaining,
--          0
--        )                                     as credits_lost
--   from public.user_credits uc
--   join purchases p on p.user_id = uc.user_id
--   left join spend s on s.user_id = uc.user_id
--  where uc.credits_total + p.purchased_total - coalesce(s.spent_since, 0) - uc.credits_remaining > 1
--  order by credits_lost desc;


-- ============================================================================
-- RESTITUTION — GIVE THEM BACK
--
-- COMMENTED OUT ON PURPOSE. Run the forensics query first, read the list,
-- and only then uncomment this. It writes a ledger row per account so the
-- return is auditable and so a second run cannot double-credit: the
-- idempotency_key is fixed per user.
--
-- It restores into purchased_credits as well as the balance, because what
-- was lost was purchased — putting it back as monthly credits would just
-- queue it up to be destroyed again at the next reset.
-- ============================================================================
-- do $restitution$
-- declare
--   r record;
-- begin
--   for r in
--     with purchases as (
--       select user_id, sum(amount) as purchased_total, min(created_at) as first_purchase_at
--         from public.credit_transactions
--        where action_type = 'purchase' and amount > 0
--        group by user_id
--     ),
--     spend as (
--       select ct.user_id, coalesce(sum(-ct.amount), 0) as spent_since
--         from public.credit_transactions ct
--         join purchases p on p.user_id = ct.user_id
--        where ct.amount < 0 and ct.created_at >= p.first_purchase_at
--        group by ct.user_id
--     )
--     select uc.user_id,
--            (uc.credits_total + p.purchased_total - coalesce(s.spent_since, 0) - uc.credits_remaining)::integer as owed
--       from public.user_credits uc
--       join purchases p on p.user_id = uc.user_id
--       left join spend s on s.user_id = uc.user_id
--      where uc.credits_total + p.purchased_total - coalesce(s.spent_since, 0) - uc.credits_remaining > 1
--   loop
--     perform public.grant_credits_idempotent(
--       r.user_id,
--       r.owed,
--       'purchase_restitution',
--       'Credits restored: purchased credits removed by a monthly reset',
--       'purchased_credits_restitution:' || r.user_id::text,
--       null, null, null,
--       true
--     );
--   end loop;
-- end
-- $restitution$;
