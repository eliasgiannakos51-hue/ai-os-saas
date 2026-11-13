-- One open deletion per account, every link of it working, and a record
-- that outlives the account (directive 39 Κομμάτι 3, the review of
-- 2026-11-04 — docs/NEEDS-FROM-ELIAS.md had the three findings).
--
-- 1. EVERY LINK OF A SCHEDULE KEEPS WORKING. Confirming a deletion that is
--    already scheduled now JOINS the open row instead of writing a second
--    one (scheduleDeletion in src/lib/account/pending-deletion.ts). Only
--    the SHA-256 of a cancel link is stored, so the joining confirmation
--    needs a new link for its own email; the digest it replaces moves into
--    previous_cancel_token_hashes, where cancelDeletion still finds it.
--
-- 2. ONE OPEN ROW PER ACCOUNT, held by the database. Open means
--    cancelled_at and executed_at are both null. Two confirmations used to
--    write two open rows; the cancel link from one email stopped only its
--    own, and the cron deleted the account with the other. Duplicates
--    already written are FOLDED first, deleting nothing: per account the
--    row with the EARLIEST delete_after stays open — the first date that
--    person was told — the others are marked cancelled, and their digests
--    join the kept row's previous_cancel_token_hashes, so the links in
--    those emails still stop the deletion. The unique index comes after,
--    because the fold is what makes it possible to build.
--
-- 3. AN EXECUTED DELETION LEAVES A RECORD (GDPR Art. 5(2), accountability).
--    The foreign key cascaded, so the row went with the account and
--    nothing said a deletion had run. It is ON DELETE SET NULL now: the
--    row stays with user_id null, and the trigger below empties both
--    digest columns in that same update, so what remains is an id and
--    four timestamps — asked for, due, cancelled, carried out. No email
--    (the table never had one), no account id, no credential. The cron
--    writes executed_at BEFORE it deletes anything
--    (api/cron/execute-deletions, claimExecution), so the record exists by
--    the time the account goes.
--
-- Safe to paste twice, and to paste again after a run that stopped part
-- way: every step either checks before it acts or finds nothing left to
-- do (scripts/tests/pending-deletions.dbtest.mjs runs it a second time).
-- The application works before this file too (it falls back to a second
-- row with the same date, which a cancel still stops entirely), and
-- /api/health names this file until it has run.
--
-- How to undo: in this order — drop trigger if exists
-- pending_deletions_forget_tokens on public.pending_deletions; drop function
-- if exists public.pending_deletions_forget_tokens(); alter table
-- public.pending_deletions drop constraint if exists
-- pending_deletions_token_while_owned; delete from public.pending_deletions
-- where user_id is null (the records of executed deletions — the old schema
-- has nowhere to keep them, so undoing loses them); alter table
-- public.pending_deletions alter column cancel_token_hash set not null,
-- alter column user_id set not null; alter table public.pending_deletions
-- drop constraint pending_deletions_user_id_fkey, add constraint
-- pending_deletions_user_id_fkey foreign key (user_id) references
-- auth.users(id) on delete cascade; drop index if exists
-- public.pending_deletions_one_open_per_user; alter table
-- public.pending_deletions drop column if exists previous_cancel_token_hashes
-- (after which the earlier email of a joined schedule no longer cancels it —
-- Settings still does). The fold of step 2 is NOT undone, on purpose:
-- reopening the duplicates puts back two schedules for one account, the
-- defect this file removes. They kept their delete_after; nothing in them
-- was deleted. The revoke of the last section is NOT undone either: with
-- row level security on and no policy, every one of those verbs already
-- fails for a signed-in user, so granting them back restores only the red
-- `grant_without_policy` line, never a working request.
--

-- 1. -------------------------------------------------------------------
alter table public.pending_deletions
  add column if not exists previous_cancel_token_hashes text[] not null default '{}';

-- 2. -------------------------------------------------------------------
-- 2a. The kept row learns the duplicates' links...
with ranked as (
  select id, user_id, cancel_token_hash, delete_after, created_at,
         row_number() over (
           partition by user_id
           order by delete_after asc, created_at asc, id asc
         ) as rn
    from public.pending_deletions
   where cancelled_at is null
     and executed_at is null
     and user_id is not null
),
folded as (
  select keep.id as keep_id,
         array_agg(dup.cancel_token_hash order by dup.delete_after, dup.created_at, dup.id) as hashes
    from ranked keep
    join ranked dup on dup.user_id = keep.user_id and dup.rn > 1
   where keep.rn = 1
   group by keep.id
)
update public.pending_deletions p
   set previous_cancel_token_hashes = p.previous_cancel_token_hashes || folded.hashes
  from folded
 where p.id = folded.keep_id;

-- 2b. ...and the duplicates are marked cancelled, never deleted.
with ranked as (
  select id,
         row_number() over (
           partition by user_id
           order by delete_after asc, created_at asc, id asc
         ) as rn
    from public.pending_deletions
   where cancelled_at is null
     and executed_at is null
     and user_id is not null
)
update public.pending_deletions p
   set cancelled_at = now()
  from ranked
 where p.id = ranked.id
   and ranked.rn > 1;

-- 2c. The guarantee.
create unique index if not exists pending_deletions_one_open_per_user
  on public.pending_deletions (user_id)
  where cancelled_at is null and executed_at is null;

-- 3. -------------------------------------------------------------------
alter table public.pending_deletions alter column user_id drop not null;
alter table public.pending_deletions alter column cancel_token_hash drop not null;

alter table public.pending_deletions drop constraint if exists pending_deletions_user_id_fkey;
alter table public.pending_deletions
  add constraint pending_deletions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- A digest may be missing only once the account is gone: every row that
-- still belongs to somebody carries the one link that can stop it.
alter table public.pending_deletions drop constraint if exists pending_deletions_token_while_owned;
alter table public.pending_deletions
  add constraint pending_deletions_token_while_owned
  check (user_id is null or cancel_token_hash is not null);

-- The moment the account goes, so do the digests. Fired by the foreign
-- key's own SET NULL — whichever path deleted the auth user, the cron or
-- anything else — so no code has to remember it.
-- scripts/tests/pending-deletions.dbtest.mjs deletes a real auth user and
-- reads what is left.
create or replace function public.pending_deletions_forget_tokens()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is null and old.user_id is not null then
    new.cancel_token_hash := null;
    new.previous_cancel_token_hashes := '{}';
  end if;
  return new;
end;
$$;

revoke all on function public.pending_deletions_forget_tokens() from public;
revoke all on function public.pending_deletions_forget_tokens() from anon;
revoke all on function public.pending_deletions_forget_tokens() from authenticated;

create or replace trigger pending_deletions_forget_tokens
  before update of user_id on public.pending_deletions
  for each row execute function public.pending_deletions_forget_tokens();

-- ----------------------------------------------------------------------
-- THE GRANTS THAT NO POLICY COVERS (found 2026-11-04 by `npm run test:db`
-- on a fresh Postgres 16: db_exposure_report() said grant_without_policy 4,
-- and the four were SELECT, INSERT, UPDATE and DELETE on this table for
-- `authenticated`, handed out by Supabase's default privileges when
-- 20261108000000_pending_deletions.sql created it).
--
-- The table is deny-all on purpose: only the service role reads or writes
-- it (src/lib/account/pending-deletion.ts takes the admin client by type).
-- 20260926000000_revoke_authenticated_grants_without_policy.sql explains
-- why the grant goes even though RLS already refuses: the grant is the
-- loaded half, RLS the safety catch, and a later `disable row level
-- security` should find nothing loaded. Revoking cannot break a request:
-- each verb already fails for these roles. Idempotent.
revoke all on table public.pending_deletions from anon;
revoke all on table public.pending_deletions from authenticated;
