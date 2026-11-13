-- ---------------------------------------------------------------------------
-- THE FREE ACTIVATION RUN IS SPENT ONCE, AND THE ACCOUNT CANNOT UN-SPEND IT
-- (2026-11-05 review, A2).
--
-- public.user_onboarding carries the flow's own progress, which the
-- account writes, and activation_used_at, which decides whether the one
-- free import and analysis has been used (src/lib/import/activation.ts;
-- claimed by claim_activation_run, service_role only). The baseline
-- schema gave the account an UPDATE policy over its own row on top of
-- Supabase's table-wide UPDATE grant — so the grant reached
-- activation_used_at too, whatever the comment beside it said.
--
-- Now the account may UPDATE exactly the columns the app writes through
-- its own session, found by reading every write to this table in src/:
--
--   user_id, goal, completed_at, skipped_at   api/onboarding (an upsert:
--                                              its ON CONFLICT DO UPDATE
--                                              sets every column it sends,
--                                              user_id included; the
--                                              policy keeps that the
--                                              account's own)
--   home_seen_at                               api/home/seen
--
-- updated_at is set by the set_updated_at trigger, which needs no grant.
-- activation_used_at, created_at: the server only. INSERT and SELECT are
-- unchanged. scripts/tests/user-onboarding-grants.dbtest.mjs runs both
-- halves as the signed-in role against a real Postgres.
--
-- Safe to paste twice.
--
-- How to undo: grant update on public.user_onboarding to authenticated;
-- (the table-wide grant this file replaces). The policy is untouched.
-- ---------------------------------------------------------------------------

revoke update on public.user_onboarding from authenticated;
revoke update on public.user_onboarding from anon;

grant update (user_id, goal, completed_at, skipped_at, home_seen_at)
  on public.user_onboarding to authenticated;

-- SELF-CHECK: the column that decides the free run is not writable by the
-- account, and the ones the flow writes are.
do $$
begin
  if has_column_privilege('authenticated', 'public.user_onboarding', 'activation_used_at', 'UPDATE') then
    raise exception 'user_onboarding_column_grants: activation_used_at is still writable by authenticated';
  end if;
  if not has_column_privilege('authenticated', 'public.user_onboarding', 'goal', 'UPDATE') then
    raise exception 'user_onboarding_column_grants: goal is not writable by authenticated';
  end if;
end;
$$;
