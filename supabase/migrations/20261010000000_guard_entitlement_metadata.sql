-- ---------------------------------------------------------------------------
-- WHAT AN ACCOUNT IS ENTITLED TO IS WRITTEN BY THE SERVER ONLY (2026-10-05).
--
-- The plan, the team grant, the Stripe ids, the billing interval, the seat
-- count and the beta flag live in auth.users.raw_user_meta_data — the
-- object the Supabase API calls `user_metadata`. The app reads them as
-- facts (src/lib/billing/plan-resolution.ts and every billing route).
--
-- Every server write of these keys already goes through
-- public.merge_user_metadata (20260910000000_merge_user_metadata.sql),
-- which runs as its owner. Every OTHER change to auth.users reaches the
-- database through Supabase Auth, connected as supabase_auth_admin. So:
-- when the role making the change is supabase_auth_admin, these keys keep
-- the value they had (on UPDATE) or are dropped (on INSERT), whatever the
-- request asked for. Everything else in the object — display name,
-- language, pins, persona — is untouched.
--
-- WHAT THIS MEANS FOR THE APP. A key in PROTECTED can no longer be set by
-- admin.auth.admin.createUser / updateUserById either, since those also go
-- through Supabase Auth: src/app/api/signup/route.ts writes the starting
-- plan through merge_user_metadata after creating the account.
--
-- Idempotent: create or replace, drop-and-create the trigger.
-- How to check it after running: the SELF-CHECK at the end raises if the
-- trigger is not in place; scripts/tests/entitlement-metadata.dbtest.mjs
-- runs the whole behaviour against a real Postgres.
-- How to undo: drop trigger guard_entitlement_metadata on auth.users;
--              drop function public.guard_entitlement_metadata();
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
    'is_beta_tester'
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

-- NO GRANT TO ANYONE. Postgres does not check EXECUTE when a trigger
-- fires, so the auth role needs none to be fenced by it (measured on a
-- real Postgres, 2026-10-05), and scripts/tests/role-grants.dbtest.mjs
-- holds every holding to a named list.
revoke all on function public.guard_entitlement_metadata() from public;
revoke all on function public.guard_entitlement_metadata() from anon;
revoke all on function public.guard_entitlement_metadata() from authenticated;

drop trigger if exists guard_entitlement_metadata on auth.users;
create trigger guard_entitlement_metadata
  before insert or update on auth.users
  for each row execute function public.guard_entitlement_metadata();

-- ---------------------------------------------------------------------------
-- SELF-CHECK. A trigger that silently did not attach would look identical
-- from the app.
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
    raise exception 'guard_entitlement_metadata: the trigger is not on auth.users';
  end if;
end;
$$;
