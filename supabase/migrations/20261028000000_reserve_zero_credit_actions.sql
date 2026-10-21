-- ---------------------------------------------------------------------------
-- A ZERO-CREDIT ACTION CAN NOW BE RESERVED, WHICH CLOSES A REPLAY GAP
-- 20260920000000_settle_reservation_replay.sql SAID PLAINLY IT LEFT OPEN
-- (security audit, 2026-10-21).
--
-- THAT MIGRATION'S OWN WORDS: "a settlement with p_reservation_id = null.
-- There is no row to compare against, so a replay of one of those charges
-- twice. Every caller that reserves passes an id; the null path is the
-- bypass and the no-reservation features."
--
-- reserveCredits() (src/lib/billing/reservations.ts) took a `credits <= 0`
-- fast path that skipped reserve_credits entirely and returned
-- reservationId: "" — not because zero needs no protection, but because
-- credit_reservations' own CHECK (credits > 0) refused to let it insert
-- one. settleReservation then converted that "" to null and reached
-- settle_reservation's UNPROTECTED null branch: a retried request, a
-- replayed job, a second nudge — any of the three settle_reservation's own
-- CAS already defeats for a REAL reservation — charges the measured cost
-- twice for an action whose estimate happened to round to zero.
--
-- THE FIX IS AT THE ONE CHOKE POINT EVERY ONE OF THE FORTY CALLERS
-- ALREADY GOES THROUGH, the same reasoning settle_reservation's own
-- header gives for fixing replay there rather than in each call site:
-- loosen the constraint so a zero-credit hold can exist, and
-- reserveCredits() (not this file) stops skipping the RPC for it. Once
-- every caller that reserves at all holds a real row, settle_reservation's
-- existing compare-and-swap protects it exactly as it protects every
-- other reservation — no change to settle_reservation or
-- release_reservation themselves.
--
-- WHAT THIS DOES NOT CLOSE, said as plainly as the migration before it
-- did: a route that skips reserveCredits ENTIRELY for a bypass account
-- (the `if (!bypass && plan)` shape several routes use) still settles
-- with reservationId = "". That remains unprotected against a replay —
-- but a bypass settlement always carries bypassCharge = true, which
-- settleReservation hard-codes to creditsCharged = 0, so a replay there
-- duplicates a zero-credit ai_cost_log row, not a charge. Real money
-- only ever flows through the path this migration protects.
--
-- Idempotent: check constraints are dropped and re-created by name.
-- How to check it after running: the SELF-CHECK raises if a zero-credit
-- row is still refused, or if a negative one is now accepted.
-- How to undo: alter table public.credit_reservations
--   drop constraint credit_reservations_credits_check,
--   add constraint credit_reservations_credits_check check (credits > 0);
--   — safe only once reserveCredits() no longer tries to insert a zero
--   (i.e. undo this file's TypeScript half together with this one).
-- ---------------------------------------------------------------------------

alter table public.credit_reservations
  drop constraint if exists credit_reservations_credits_check;

alter table public.credit_reservations
  add constraint credit_reservations_credits_check check (credits >= 0);

insert into public.schema_migrations (filename) values ('20261028000000_reserve_zero_credit_actions.sql')
on conflict (filename) do nothing;

-- ---------------------------------------------------------------------------
-- SELF-CHECK.
-- ---------------------------------------------------------------------------
do $$
declare
  v_probe_user uuid := '00000000-0000-0000-0000-00000000f00d';
  v_id uuid;
begin
  insert into auth.users (id, email) values (v_probe_user, 'reserve-zero-probe@test.local')
    on conflict (id) do nothing;

  insert into public.credit_reservations (user_id, action, credits, expires_at)
    values (v_probe_user, 'zero_probe', 0, now() + interval '1 minute')
    returning id into v_id;
  if v_id is null then
    raise exception 'credit_reservations still refuses a zero-credit row';
  end if;
  delete from public.credit_reservations where id = v_id;

  begin
    insert into public.credit_reservations (user_id, action, credits, expires_at)
      values (v_probe_user, 'negative_probe', -1, now() + interval '1 minute');
    raise exception 'credit_reservations accepted a NEGATIVE credits row — the constraint is gone, not loosened';
  exception
    when check_violation then null;
  end;

  delete from auth.users where id = v_probe_user;
end;
$$;
