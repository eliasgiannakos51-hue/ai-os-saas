-- A SETTLEMENT COULD BE CHARGED TWICE.
--
-- settle_reservation() opens with what reads like a guard:
--
--     update public.credit_reservations
--        set status = 'settled', resolved_at = now()
--      where id = p_reservation_id and user_id = p_user_id and status = 'active';
--
-- The `status = 'active'` clause is a compare-and-swap, and its result was
-- never read. When the reservation had already been settled the UPDATE
-- matched no row — and the function carried straight on to subtract the
-- credits from user_credits, write a credit_transactions row, and write an
-- ai_cost_log row. Calling it twice for one reservation charged twice.
--
-- WHY AN EARLY RETURN ON "NO ROW MATCHED" WOULD BE THE WRONG FIX. The
-- function's own comment anticipates a reservation that "expired
-- mid-action and was swept before this ran", and in that case the work
-- HAPPENED and must still be charged. Refusing to charge whenever the
-- CAS misses would turn a double-charge into a missed charge — the other
-- half of the same question.
--
-- So the two cases are told apart by reading the status back:
--
--   status = 'settled'   this exact reservation has already been charged.
--                        A REPLAY. Return without touching anything.
--   anything else        expired, released, or gone. The action still
--                        happened and is still owed. Charge, as before.
--
-- The read is safe under concurrency because the UPDATE above takes a row
-- lock: two simultaneous settlements serialise on it, the loser reads the
-- winner's committed 'settled', and returns.
--
-- WHAT IS STILL NOT PROTECTED, said plainly: a settlement with
-- p_reservation_id = null. There is no row to compare against, so a replay
-- of one of those charges twice. Every caller that reserves passes an id;
-- the null path is the bypass and the no-reservation features.
--
-- Idempotent: create or replace only. Signature unchanged, so no grant
-- changes and no caller changes.

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
declare
  v_rows integer := 0;
  v_status text;
begin
  if p_reservation_id is not null then
    update public.credit_reservations
      set status = 'settled', resolved_at = now()
      where id = p_reservation_id and user_id = p_user_id and status = 'active';
    get diagnostics v_rows = row_count;

    if v_rows = 0 then
      select status into v_status
        from public.credit_reservations
       where id = p_reservation_id and user_id = p_user_id;

      -- Already charged. Not an error: a retried job, a replayed request
      -- and a second nudge all land here, and the right answer to all
      -- three is to do nothing.
      if v_status = 'settled' then
        return;
      end if;
      -- Expired, released, or no such row: the work happened and is owed.
      -- Falls through to the charge, exactly as before this change.
    end if;
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
