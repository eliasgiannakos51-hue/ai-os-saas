-- ---------------------------------------------------------------------------
-- A SUSPENSION THE ACCOUNT CANNOT LIFT, AND A LIST THE CRONS CAN READ
-- (2026-11-05 review, A1).
--
-- api/admin/suspend now bans the account through Supabase Auth and records
-- the suspension in app_metadata (lib/auth/suspension.ts). Two things in
-- the database go with that:
--
-- 1. The four keys an OLDER suspension wrote into user_metadata —
--    suspended, suspended_reason, suspended_at, suspended_by — join the
--    keys Supabase Auth keeps for the server
--    (guard_entitlement_metadata, first written in
--    20261010000000_guard_entitlement_metadata.sql; that file is not
--    edited, this one replaces the function with the longer list). An
--    account suspended before this change stays suspended: the app still
--    reads those keys, and the account can no longer clear them itself.
--    The server still can, through merge_user_metadata, which is how
--    lifting a suspension removes them.
--
-- 2. public.suspended_user_ids(): every account that is suspended, in
--    one read, for the crons that run scheduled work with the service
--    role (lib/auth/suspended-accounts.ts). Granted to service_role only.
--
-- Safe to paste twice: create or replace, drop-and-create the trigger.
-- The application works before this file too — the crons log the missing
-- function and skip nobody, while sign-in and the API are refused anyway
-- (the ban, and src/proxy.ts).
--
-- How to undo: drop function if exists public.suspended_user_ids(); then
-- paste the function body of 20261010000000_guard_entitlement_metadata.sql
-- again (its `create or replace function public.guard_entitlement_metadata`
-- statement only), which restores the eight-key list. Afterwards the
-- crons run suspended accounts' work again and an older suspension can be
-- cleared by the account itself.
-- ---------------------------------------------------------------------------

create or replace function public.guard_entitlement_metadata()
returns trigger
language plpgsql
-- INVOKER, deliberately: current_user must be the role making the change.
-- A definer function would always see its owner and fence nothing.
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  protected constant text[] := array[
    'subscription_tier',
    'team_granted_tier',
    'team_owner_id',
    'stripe_customer_id',
    'stripe_subscription_id',
    'billing_interval',
    'seat_count',
    'is_beta_tester',
    'suspended',
    'suspended_reason',
    'suspended_at',
    'suspended_by'
  ];
  k text;
  meta jsonb;
begin
  if current_user <> 'supabase_auth_admin' then
    return new;
  end if;

  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb) - protected;

  if tg_op = 'UPDATE' then
    foreach k in array protected loop
      if old.raw_user_meta_data ? k then
        meta := meta || jsonb_build_object(k, old.raw_user_meta_data -> k);
      end if;
    end loop;
  end if;

  new.raw_user_meta_data := meta;
  return new;
end;
$$;

revoke all on function public.guard_entitlement_metadata() from public;
revoke all on function public.guard_entitlement_metadata() from anon;
revoke all on function public.guard_entitlement_metadata() from authenticated;

drop trigger if exists guard_entitlement_metadata on auth.users;
create trigger guard_entitlement_metadata
  before insert or update on auth.users
  for each row execute function public.guard_entitlement_metadata();

-- ---------------------------------------------------------------------------
-- Every suspended account. DEFINER, because auth.users is not readable by
-- the API roles; the body reads three columns of it and returns ids only.
-- ---------------------------------------------------------------------------
create or replace function public.suspended_user_ids()
returns table (user_id uuid)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select u.id
    from auth.users u
   where u.raw_app_meta_data ->> 'suspended' = 'true'
      or u.raw_user_meta_data ->> 'suspended' = 'true'
      or (u.banned_until is not null and u.banned_until > now());
$$;

comment on function public.suspended_user_ids() is
  'The ids of every suspended account: app_metadata.suspended, the older user_metadata.suspended, or a ban in force. Read by the crons before they pick due work. service_role only.';

revoke all on function public.suspended_user_ids() from public;
revoke all on function public.suspended_user_ids() from anon;
revoke all on function public.suspended_user_ids() from authenticated;
grant execute on function public.suspended_user_ids() to service_role;

-- ---------------------------------------------------------------------------
-- SELF-CHECK. A trigger that silently did not attach, or a list that did
-- not take, would look identical from the app.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users'
      and t.tgname = 'guard_entitlement_metadata' and not t.tgisinternal
  ) then
    raise exception 'account_suspension: the guard trigger is not on auth.users';
  end if;
  if position('''suspended_by''' in pg_get_functiondef('public.guard_entitlement_metadata()'::regprocedure)) = 0 then
    raise exception 'account_suspension: the guard does not keep the suspension keys';
  end if;
end;
$$;
