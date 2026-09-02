-- REPAIR 4.2 — nav_events + prune_nav_events
-- Source: supabase/migrations/20260915000000_nav_events.sql
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- Run the numbered files IN ORDER. Each is safe to run twice.

create index if not exists nav_events_user_created_idx
  on public.nav_events (user_id, created_at desc);

-- ----------------------------------------------------------------------
-- 3. Row-level security
-- ----------------------------------------------------------------------
alter table public.nav_events enable row level security;

-- A USER MAY RECORD THEIR OWN NAVIGATION AND NOBODY ELSE'S. The API route
-- fills user_id from auth.getUser(); this is what makes that true rather
-- than merely intended.
drop policy if exists nav_events_insert_own on public.nav_events;
create policy nav_events_insert_own
  on public.nav_events for insert
  with check (auth.uid() = user_id);

-- AND MAY READ THEIR OWN. Nothing in the product reads this table as the
-- user today. The policy exists because a table that records a person's
-- movements and cannot be shown to that person is a worse thing to own
-- than one that can; own-rows-only costs nothing and closes that.
drop policy if exists nav_events_select_own on public.nav_events;
create policy nav_events_select_own
  on public.nav_events for select
  using (auth.uid() = user_id);

-- NO UPDATE AND NO DELETE POLICY. An append-only log that the writer can
-- rewrite is not a log. Erasure is covered by the cascade above (delete
-- the account, the rows go) and by prune_nav_events below.

grant select, insert on public.nav_events to authenticated;
revoke update, delete on public.nav_events from authenticated;

-- anon OWNS NOTHING HERE — the table and its identity sequence both.
-- 20260909000000_revoke_anon_default_privileges already stopped new
-- tables inheriting Supabase's `ALTER DEFAULT PRIVILEGES ... TO anon`,
-- but a revoke on a privilege nobody holds is a no-op, and this file has
-- to be correct when applied to a database that predates that one. The
-- sequence is named separately because REVOKE ON TABLE does not reach it,
-- and USAGE on a sequence is the one privilege that survives a table
-- revoke — that is the lesson 20260906000000_revoke_anon_grants was
-- written to record.
revoke all on public.nav_events from anon;
do $revokeseq$
declare
  v_seq text := pg_get_serial_sequence('public.nav_events', 'id');
begin
  if v_seq is not null then
    execute format('revoke all on sequence %s from anon', v_seq);
  end if;
end $revokeseq$;

comment on table public.nav_events is
  'One row per screen change inside /dashboard. Normalised server-side by src/lib/nav/nav-path.ts against the app''s own route list: no query strings, no identifiers, no free text. Retained 90 days by public.prune_nav_events(), called daily by /api/cron/nav-retention.';

-- ----------------------------------------------------------------------
-- 4. Retention: 90 days, and a bad argument does no more than the default
-- ----------------------------------------------------------------------
-- SECURITY DEFINER because no role has DELETE on this table — that is the
-- point of section 3, and it is also why the cleanup cannot simply be a
-- statement the cron route sends. Executable by service_role only.
--
-- A BAD ARGUMENT FALLS BACK TO THE DEFAULT, NOT TO THE FLOOR. This is the
-- second version of this clamp and the difference is the whole point.
--
-- The first version was `greatest(least(coalesce(p_days, 90), 3650), 1)`,
-- which guarantees the cutoff is at least one day in the past — so a 0, a
-- negative or a null could never make this `delete from nav_events where
-- created_at < now()`. That guarantee held. It was also the wrong one:
-- clamping a stray 0 UP TO 1 turns "the caller passed nothing usable"
-- into "delete eighty-nine days of history", which is the most
-- destructive sweep the function is allowed to perform. Measured, in
-- scripts/tests/nav-events.dbtest.mjs: prune_nav_events(0) removed a row
-- that was 89 days old.
--
-- So anything that is not a usable number becomes 90 — the sweep that was
-- going to happen anyway. A caller who genuinely wants a shorter window
-- still gets it (1 is honoured), and least(...,3650) keeps a typo from
-- making the sweep a silent no-op forever, which is how retention stops
-- working without anybody noticing.
create or replace function public.prune_nav_events(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $prune$
declare
  v_days integer := case
    when p_days is null or p_days < 1 then 90
    else least(p_days, 3650)
  end;
  v_deleted integer;
begin
  delete from public.nav_events
   where created_at < now() - make_interval(days => v_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $prune$;

-- Same shape as every other privileged function here: nothing to public,
-- nothing to the two roles a browser can hold, execute to service_role.
-- 20260818000000_function_grants loops over pg_proc and runs BEFORE this
-- file, so these have to be stated rather than inherited.
do $prunegrants$
begin
  execute 'revoke all on function public.prune_nav_events(integer) from public';
  execute 'revoke all on function public.prune_nav_events(integer) from anon';
  execute 'revoke all on function public.prune_nav_events(integer) from authenticated';
  execute 'grant execute on function public.prune_nav_events(integer) to service_role';
end $prunegrants$;

comment on function public.prune_nav_events(integer) is
  'Deletes nav_events older than p_days. Null, zero or negative fall back to 90 — a garbage argument does what the default does and never more; anything above 3650 is clamped down so a typo cannot silently stop retention. Returns the row count. service_role only; called by /api/cron/nav-retention.';

-- ----------------------------------------------------------------------
-- 5. The two views — what is opened, and how much of the product one
--    person actually uses
-- ----------------------------------------------------------------------
--
-- DROP-THEN-CREATE, NOT `create or replace`. Replacing a view fails
-- outright if a column is renamed, retyped or removed, which would make
-- this file stop being idempotent the first time a column here is
-- improved. Dropping a view destroys no data — that is the whole
-- difference between this and the DROP TABLE the header forbids.
--
-- security_invoker = true ON BOTH. This is the trap that makes analytics
-- views dangerous in a multi-tenant schema: a view runs as its OWNER by
-- default, so a view over an RLS-protected table, granted to
-- `authenticated`, hands every user every other user's rows and reports
-- no error while doing it. These are granted to service_role only, so
-- today the flag changes nothing — it is here so that the day somebody
-- grants one of them to `authenticated` to build a "your activity"
-- screen, they get their own rows instead of everybody's.

drop view if exists public.nav_screen_usage;