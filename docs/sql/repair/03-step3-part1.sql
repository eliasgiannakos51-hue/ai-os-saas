-- REPAIR 3.1 — merge_user_metadata
-- Source: supabase/migrations/20260910000000_merge_user_metadata.sql
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- Run the numbered files IN ORDER. Each is safe to run twice.

-- ---------------------------------------------------------------------------
-- ONE ATOMIC MERGE INSTEAD OF SEVEN READ-MODIFY-WRITES ON user_metadata.
--
-- WHAT WENT WRONG. Supabase's admin API has no partial update for
-- user_metadata: `updateUserById(id, { user_metadata })` REPLACES the whole
-- object. So every place in this app that wanted to change one key did this:
--
--     const { data } = await admin.auth.admin.getUserById(id);
--     await admin.auth.admin.updateUserById(id, {
--       user_metadata: { ...data.user.user_metadata, one_key: value },
--     });
--
-- Seven of them: the Stripe webhook, /auth/callback, /api/checkout,
-- /api/credits/checkout, /api/billing/addons, /api/team/remove and
-- lib/team/accept-pending-invite. A read, a gap, a write — and whatever
-- another writer put there inside the gap is gone, because the spread
-- carries the OLD snapshot forward over it.
--
-- The gap is not theoretical. Stripe delivers customer.subscription.updated
-- and invoice.paid within the same second, and Vercel runs them as two
-- concurrent invocations of the same handler. Both read the same snapshot;
-- the second write erases the first. The keys at risk are the ones the app
-- charges and gates on:
--
--   team_granted_tier / team_owner_id — a member accepts a team invite while
--     a webhook for that member is in flight; the webhook's snapshot predates
--     the grant, and its write deletes it. The member loses the plan their
--     owner is paying for, and nothing logs it.
--   terms_accepted_at / signup_provider — written once at first login. A
--     webhook in that window wipes a legal record.
--   subscription_tier — two webhooks, older event wins, wrong plan.
--
-- THE FIX. jsonb `||` is a shallow merge and jsonb `-` removes keys, and one
-- UPDATE statement takes a row lock for its own duration, so the read and
-- the write cannot be separated by anything. That is the same semantics the
-- spread was reaching for, done where it is actually atomic.
--
-- raw_user_meta_data is the column `user_metadata` is stored in and the
-- column updateUserById writes; the JWT's user_metadata claim is built from
-- it at token issue. Writing it directly is the same write, minus the
-- round-trip that created the gap.
--
-- Idempotent: create or replace, and the grants are re-stated each run.
-- ---------------------------------------------------------------------------

create or replace function public.merge_user_metadata(
  p_user_id uuid,
  p_patch jsonb,
  p_remove text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_user_id is null then
    raise exception 'merge_user_metadata: p_user_id is required';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'merge_user_metadata: p_patch must be a jsonb object, got %',
      coalesce(jsonb_typeof(p_patch), 'null');
  end if;

  -- REMOVE FIRST, THEN MERGE. A caller that both removes a key and sets it
  -- in the same call means to set it: /api/team/remove drops
  -- team_granted_tier and may set subscription_tier in one action, and the
  -- other order would delete the value it had just written.
  update auth.users
     set raw_user_meta_data =
           (coalesce(raw_user_meta_data, '{}'::jsonb) - coalesce(p_remove, array[]::text[]))
           || p_patch,
         updated_at = now()
   where id = p_user_id
  returning raw_user_meta_data into v_result;

  if not found then
    raise exception 'merge_user_metadata: no auth.users row for %', p_user_id;
  end if;

  return v_result;
end;
$$;

-- NOBODY BUT THE SERVER. This function edits entitlements — the tier an
-- account is on, the team grant it holds — so exposing it through PostgREST
-- to a signed-in user would let anyone hand themselves the Ultimate plan.
-- PostgreSQL grants EXECUTE on a new function to PUBLIC by default, which
-- means anon and authenticated get it unless it is taken away explicitly.
revoke all on function public.merge_user_metadata(uuid, jsonb, text[]) from public;
revoke all on function public.merge_user_metadata(uuid, jsonb, text[]) from anon;
revoke all on function public.merge_user_metadata(uuid, jsonb, text[]) from authenticated;
grant execute on function public.merge_user_metadata(uuid, jsonb, text[]) to service_role;

-- ---------------------------------------------------------------------------
-- SELF-CHECK. The revoke above is the whole security of this function, and a
-- revoke that silently did nothing would look identical from here.
-- ---------------------------------------------------------------------------
do $$
declare
  anon_can boolean;
  auth_can boolean;
  svc_can  boolean;
begin
  select has_function_privilege('anon', 'public.merge_user_metadata(uuid, jsonb, text[])', 'execute')
    into anon_can;
  select has_function_privilege('authenticated', 'public.merge_user_metadata(uuid, jsonb, text[])', 'execute')
    into auth_can;
  select has_function_privilege('service_role', 'public.merge_user_metadata(uuid, jsonb, text[])', 'execute')
    into svc_can;

  raise notice 'merge_user_metadata: anon=% authenticated=% service_role=%',
    anon_can, auth_can, svc_can;

  if anon_can or auth_can then
    raise exception
      'merge_user_metadata is executable by anon(%) or authenticated(%) — a signed-in user could rewrite their own plan',
      anon_can, auth_can;
  end if;
  if not svc_can then
    raise exception 'merge_user_metadata is NOT executable by service_role — every metadata write in the app would fail';
  end if;
end;
$$;