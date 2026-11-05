-- ---------------------------------------------------------------------------
-- PUSH SUBSCRIPTIONS ARE WRITTEN BY THE SERVER ONLY (2026-11-05).
--
-- Fixed access control on public.push_subscriptions: the account keeps
-- reading and deleting its own rows and loses INSERT and UPDATE. Every
-- write goes through src/app/api/push/subscribe/route.ts, which checks
-- first — the endpoint is a known push service's
-- (src/lib/push/delivery.ts), the keys have the right shape, the caller is
-- under its rate limit and its cap of subscriptions — and then writes
-- with the service role, scoped to the caller. Without this, those checks
-- could be stepped around by writing the table directly.
--
-- No row is changed. A row stored before this with an endpoint that is
-- not a known push service is never sent to: the sender checks the same
-- list (src/lib/push/web-push.ts).
--
-- Idempotent: drop policy if exists, revoke.
-- How to check it after running: the SELF-CHECK at the end raises if the
-- account can still insert or update, or cannot read or delete;
-- scripts/tests/server-written-tables.dbtest.mjs runs it on a real Postgres.
-- How to undo: grant insert, update on public.push_subscriptions to
--              authenticated, and re-create the two policies
--              "push_subscriptions_insert_own" and
--              "push_subscriptions_update_own" exactly as in
--              20260808_web_push_subscriptions.sql.
-- ---------------------------------------------------------------------------

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
revoke insert, update on public.push_subscriptions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- SELF-CHECK.
-- ---------------------------------------------------------------------------
do $$
begin
  if has_any_column_privilege('authenticated', 'public.push_subscriptions', 'INSERT') then
    raise exception 'push_subscriptions: authenticated can still INSERT';
  end if;
  if has_any_column_privilege('authenticated', 'public.push_subscriptions', 'UPDATE') then
    raise exception 'push_subscriptions: authenticated can still UPDATE';
  end if;
  if not has_any_column_privilege('authenticated', 'public.push_subscriptions', 'SELECT') then
    raise exception 'push_subscriptions: authenticated lost read';
  end if;
  if not has_table_privilege('authenticated', 'public.push_subscriptions', 'DELETE') then
    raise exception 'push_subscriptions: authenticated lost delete';
  end if;
end;
$$;
