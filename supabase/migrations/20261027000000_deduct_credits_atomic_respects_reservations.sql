-- ---------------------------------------------------------------------------
-- deduct_credits_atomic RESPECTS ACTIVE RESERVATIONS (security audit,
-- 2026-10-21).
--
-- THE BUG. reserve_credits computes "available" as credits_remaining
-- MINUS the sum of active, unexpired holds in credit_reservations — a
-- reservation never decrements the stored balance (credit-flow.dbtest.mjs's
-- own header explains why: settlement moves money exactly once, for the
-- measured cost, not the estimate). deduct_credits_atomic — used by badge
-- removal purchases (src/lib/publishing/badge-credits-store.ts) and module
-- creation (src/app/api/modules/create/route.ts) — checked only the raw
-- credits_remaining. So an account with, say, an 80-credit AI request held
-- (reserved, not yet settled) still read as having its FULL balance free,
-- and could spend the rest of it on a badge removal at the same time: the
-- two charges together could add up to more than the account ever had.
--
-- THE FIX. deduct_credits_atomic now subtracts the exact sum
-- reserve_credits already computes before comparing against p_amount — one
-- formula, read the same way in both functions — and takes the row lock
-- FIRST, in the same order reserve_credits does, so a concurrent call to
-- either function for the same user serialises instead of racing: the
-- second one to acquire the lock sees every hold and every deduction the
-- first one already committed.
--
-- How to check it after running: credit-flow.dbtest.mjs section 11 holds a
-- reservation open and then calls deduct_credits_atomic for more than what
-- is left unreserved; it must refuse rather than overdraw.
-- How to undo: paste archive/supabase_credits_schema.sql's own
--   create or replace function public.deduct_credits_atomic back in — it
--   is the version before this file and has not changed since, so pasting
--   it restores the old (reservation-blind) behaviour.
-- ---------------------------------------------------------------------------

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
  v_held integer;
begin
  insert into public.user_credits (user_id, credits_remaining, credits_total, plan_tier)
  values (p_user_id, p_initial_credits, p_initial_credits, p_plan_tier)
  on conflict (user_id) do nothing;

  -- LOCK FIRST, same order reserve_credits uses: a concurrent
  -- reserve_credits (or a second deduct_credits_atomic) call for this
  -- user blocks on its own row lock until this transaction commits, so
  -- the hold total read next cannot go stale between here and the
  -- UPDATE below.
  perform 1 from public.user_credits where user_id = p_user_id for update;

  select coalesce(sum(credits), 0) into v_held
    from public.credit_reservations
    where user_id = p_user_id and status = 'active' and expires_at > now();

  update public.user_credits
  set credits_remaining = credits_remaining - p_amount
  where user_id = p_user_id and credits_remaining - v_held >= p_amount
  returning credits_remaining into v_remaining;

  if v_remaining is null then
    select credits_remaining into v_remaining from public.user_credits where user_id = p_user_id;
    return query select false, coalesce(v_remaining, 0);
  else
    return query select true, v_remaining;
  end if;
end;
$$;

insert into public.schema_migrations (filename) values ('20261027000000_deduct_credits_atomic_respects_reservations.sql')
on conflict (filename) do nothing;
