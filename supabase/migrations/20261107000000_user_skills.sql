-- ---------------------------------------------------------------------------
-- SKILLS (the owner's "29. SKILLS: ΤΟ ΜΑΘΑΙΝΕΙΣ ΜΙΑ ΦΟΡΑ", 2026-10-31):
-- one row per procedure a person has taught Ionexa — a name, when it is
-- used, the steps, and the files (templates/examples) that go with it.
--
-- How to undo: drop table if exists public.user_skills;
--   (it removes every skill taught, and nothing else reads this table).
--
-- READ-ONLY TODAY, ON PURPOSE. Κομμάτι 1 is the screen alone — a list and
-- a detail panel — and no piece after it that WRITES has been built yet
-- (Κομμάτι 2, "Skill from description or from a conversation", is what
-- will insert the first real row). So unlike user_games or user_websites,
-- which already grant delete to the owner because their screens already
-- let a person remove one, this table grants ONLY select: insert, update
-- and delete are revoked from anon and authenticated, because no code
-- path in this piece can create a row to remove. The day Κομμάτι 2 lands,
-- its own migration is what opens a write path — not a quiet widening of
-- this one's policies.
--
-- `steps` and `files` are jsonb arrays rather than child tables: a skill's
-- steps are an ordered list a person reads top to bottom, never queried
-- except as "the steps of this skill", and the same is true of its files
-- — so there is no join this shape would buy that a jsonb array does not
-- already give for free. `files` holds {name, url}, pointing at storage
-- the same way every other "a file belongs to this row" shape in this
-- product already does (src/lib/my-stuff/buckets.ts).
--
-- Erased with the account: user_id cascades from auth.users.
-- Idempotent: if not exists, drop policy if exists.
-- ---------------------------------------------------------------------------

create table if not exists public.user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  when_used text not null default '',
  steps jsonb not null default '[]'::jsonb,
  files jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_skills_user_created_idx on public.user_skills (user_id, created_at desc);

alter table public.user_skills enable row level security;

drop policy if exists "select_own_user_skills" on public.user_skills;
create policy "select_own_user_skills" on public.user_skills
  for select using (auth.uid() = user_id);

revoke insert, update, delete on public.user_skills from anon, authenticated;

comment on table public.user_skills is
  'A procedure taught once and followed again (directive 29, Κομμάτι 1): name, when_used, ordered steps, files (templates/examples). Read-only until a later piece opens a write path — select_own_user_skills is the only policy, insert/update/delete are revoked from anon and authenticated.';
