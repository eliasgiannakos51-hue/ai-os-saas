-- ---------------------------------------------------------------------------
-- «ΤΑ ΔΙΚΑ ΜΟΥ» (the owner's message, 2026-10-22): ONE row per question-and-
-- answer thread of this tool's own history — the same shape code_sessions
-- holds for Coding and automation_flows holds for Automations. It holds
-- NOTHING from Finances, Sales, Trading or any other tool: those tables are
-- untouched by this migration and by this whole feature, which only READS
-- them at request time (src/lib/my-stuff/sources.ts) the way the Library
-- and the Timeline already read every tool's own table.
--
-- turns is the question/answer pairs so far, each turn's citations naming
-- the kind, id, title and address of the record it was read from — the
-- SAME values src/lib/my-stuff/ask-context.ts computed and returned when
-- the turn was made, stored rather than re-derived so a citation in the
-- history still opens the same record even if that record later changes.
--
-- WRITTEN BY THE SERVER ONLY, same rule as automation_flows and
-- user_games: src/app/api/my-stuff/ask/route.ts is the one writer, after
-- it has already reserved and settled the credits a turn cost. The
-- account may read its own sessions and delete them; it may not insert or
-- update one directly, which would let a row claim an answer, a citation
-- or a credits_charged figure the server never produced.
--
-- Erased with the account: user_id cascades from auth.users.
-- Idempotent: if not exists, drop policy if exists.
-- How to check it after running: npm run db:pending; /api/health lists
-- my_stuff_sessions.
-- How to undo: drop table if exists public.my_stuff_sessions;
--   (removes every «Τα δικά μου» question/answer thread this tool has
--   ever kept, and nothing else: no other table is touched by this
--   migration, so undoing it cannot affect Finances, Sales, Trading or
--   any of the other nine kinds this tool reads).
-- ---------------------------------------------------------------------------

create table if not exists public.my_stuff_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Ερώτηση',
  turns jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists my_stuff_sessions_user_updated_idx
  on public.my_stuff_sessions (user_id, updated_at desc);

alter table public.my_stuff_sessions enable row level security;

drop policy if exists "select_own_my_stuff_sessions" on public.my_stuff_sessions;
create policy "select_own_my_stuff_sessions" on public.my_stuff_sessions
  for select using (auth.uid() = user_id);

drop policy if exists "delete_own_my_stuff_sessions" on public.my_stuff_sessions;
create policy "delete_own_my_stuff_sessions" on public.my_stuff_sessions
  for delete using (auth.uid() = user_id);

revoke insert, update on public.my_stuff_sessions from anon, authenticated;

drop trigger if exists set_updated_at on public.my_stuff_sessions;
create trigger set_updated_at before update on public.my_stuff_sessions
  for each row execute function public.set_updated_at();

comment on table public.my_stuff_sessions is
  'Question/answer threads for «Τα δικά μου» (/dashboard/my-stuff): the tool''s OWN history only. Written by api/my-stuff/ask only. Reads every other tool''s tables at request time (src/lib/my-stuff/sources.ts) without copying a single row into this one.';
