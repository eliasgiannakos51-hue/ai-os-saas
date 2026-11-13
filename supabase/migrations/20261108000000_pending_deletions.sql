-- Deferred account deletion (GDPR Art. 17, directive 39 Κομμάτι 3).
--
-- Instead of deleting immediately when the user confirms, the account is
-- SCHEDULED for deletion 30 days out. During that window the user can
-- cancel via a link emailed at scheduling time. A daily cron
-- (api/cron/execute-deletions) picks up rows past their delete_after and
-- runs the same erase sequence the confirm route used to run inline.
--
-- How to undo: drop table public.pending_deletions;

create table if not exists public.pending_deletions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- The moment after which the cron may execute the deletion.
  delete_after  timestamptz not null,
  -- SHA-256 hash of the cancel token emailed to the user.
  cancel_token_hash text not null,
  -- Non-null once the user cancels — the row stays for the audit trail.
  cancelled_at  timestamptz,
  -- Non-null once the cron actually executes the deletion.
  executed_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- The cron looks up rows by (executed_at is null, cancelled_at is null,
-- delete_after < now()), and the cancel endpoint looks up by token hash.
create index if not exists pending_deletions_actionable_idx
  on public.pending_deletions (delete_after)
  where executed_at is null and cancelled_at is null;

create index if not exists pending_deletions_cancel_token_idx
  on public.pending_deletions (cancel_token_hash);

create index if not exists pending_deletions_user_id_idx
  on public.pending_deletions (user_id);

alter table public.pending_deletions enable row level security;

-- No user-facing RLS policy: the table is read/written exclusively through
-- the service role (the cron, the confirm route, the cancel route, and the
-- status route). The user proves identity through the emailed token or
-- through their session — never by querying this table directly.
