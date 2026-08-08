-- ===========================================================================
-- GDPR Art. 17 (right to erasure) — the rows deleteUser() leaves behind.
--
-- api/delete-account/confirm deletes the auth user and relies on
-- ON DELETE CASCADE to clear the 64 tables carrying a user_id. That is
-- correct for 63 of them. `production_errors` is the exception, and it
-- fails in two separate ways:
--
--   1. `user_id uuid` is declared with NO foreign key to auth.users, so
--      no cascade reaches it. The column was added for "who hit this
--      crash most recently" and the FK was simply never written.
--   2. `affected_user_ids uuid[]` could not be covered by a foreign key
--      even in principle — Postgres cannot cascade into an array element.
--
-- So a deleted account's id survived in the error tracker indefinitely,
-- on a table the owner reads in System Health. The account was gone; the
-- identifier linking a person to their crashes was not.
--
-- Fixed by scrubbing rather than deleting the rows: the crash itself is
-- our operational data and stays (with its counts intact), but every
-- trace of WHO is removed. Called explicitly from the delete flow,
-- before the auth user is removed, so a failure is still reportable
-- against a live account.
-- ===========================================================================

create or replace function public.forget_user_in_production_errors(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scrubbed integer := 0;
  v_arrays integer := 0;
begin
  if p_user_id is null then
    return 0;
  end if;

  -- 1. The "most recent user" pointer.
  update public.production_errors
     set user_id = null
   where user_id = p_user_id;
  get diagnostics v_scrubbed = row_count;

  -- 2. Membership in the affected-users array. array_remove() rewrites
  --    the array without the id; occurrence_count is deliberately left
  --    alone, because "this bug hit 40 times" stays true after a user
  --    leaves and is the number the alerting thresholds read.
  update public.production_errors
     set affected_user_ids = array_remove(affected_user_ids, p_user_id)
   where p_user_id = any(affected_user_ids);
  get diagnostics v_arrays = row_count;

  return v_scrubbed + v_arrays;
end;
$$;

comment on function public.forget_user_in_production_errors(uuid) is
  'GDPR erasure for production_errors, which has no FK to auth.users (bare user_id column plus an affected_user_ids uuid[] that no FK could cover). Nulls the pointer and removes the id from the array, keeping the crash record and its counts. Called from api/delete-account/confirm before deleteUser().';

-- Service role only. This is called from a server route holding the
-- admin client; no browser session has any business invoking it.
revoke all on function public.forget_user_in_production_errors(uuid) from public;
revoke all on function public.forget_user_in_production_errors(uuid) from anon;
revoke all on function public.forget_user_in_production_errors(uuid) from authenticated;
grant execute on function public.forget_user_in_production_errors(uuid) to service_role;

-- ===========================================================================
-- Integration consent (GDPR Art. 6/7 — lawful basis and withdrawal).
--
-- Connecting Gmail/Drive/etc. grants this app read access to a third-party
-- account. That needs recorded, explicit consent, and withdrawing it has
-- to be as easy as giving it — neither of which existed: the OAuth
-- callback simply wrote a row.
-- ===========================================================================

alter table public.user_integrations
  add column if not exists consent_granted_at timestamptz,
  add column if not exists consent_scopes text[] not null default '{}',
  add column if not exists consent_withdrawn_at timestamptz;

comment on column public.user_integrations.consent_granted_at is
  'When the user explicitly confirmed what this integration may read. Null on rows created before consent capture existed — treated as "not yet consented" and re-prompted.';
comment on column public.user_integrations.consent_scopes is
  'The exact scopes shown to the user at the moment they consented — not the scopes the provider happens to grant later. This is what we can prove they agreed to.';
comment on column public.user_integrations.consent_withdrawn_at is
  'Set when the user withdraws consent. The row is kept (not deleted) so the withdrawal itself is auditable; tokens are cleared at the same time.';
