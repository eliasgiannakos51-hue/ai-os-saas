-- ============================================================================
-- V3 — Task 5: Presentation Builder.
--
-- Standalone, additive, idempotent. Safe to run on a project that already
-- has supabase_full_project_backup.sql and the earlier V3 migrations
-- applied.
--
-- WHAT IS DIFFERENT ABOUT THIS ONE: /dashboard/presentations already
-- exists as a TRACKER — rows in `ai_agents`-style module tables where the
-- user typed a name and a status by hand and nothing was ever generated.
-- This migration does not touch those tables. The new feature is a new
-- table, so an account that had tracker rows keeps them and the module
-- page simply stops being the thing that renders them. Dropping the old
-- rows to make the new page tidy would be deleting the user's notes to
-- save ourselves a migration.
--
-- The deck itself is JSONB rather than a slides TABLE. A deck is edited
-- as a whole — reordering is an array permutation, an AI edit rewrites
-- every slide at once, and a version is a snapshot of all of it. Modelled
-- as rows, every one of those becomes a multi-statement transaction that
-- can half-apply, and "slide 4 vanished during a reorder" is the bug that
-- follows. The trade is that we cannot query INTO a deck, which nothing
-- here needs to do.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- user_presentations — one row per deck.
-- ----------------------------------------------------------------------------
create table if not exists public.user_presentations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  title text not null default '',

  -- The user's original description. Kept after generation because it is
  -- what "regenerate" and every AI edit are relative to, and because a
  -- deck whose brief is gone cannot be explained to the person looking
  -- at it six months later.
  brief text not null default '',

  -- The locale the deck was WRITTEN in, which is not necessarily the
  -- locale the UI is in now. A deck generated in Greek stays Greek when
  -- its owner switches the interface to English; regenerating it in the
  -- new UI language without being asked would silently destroy work.
  language text not null default 'en',

  theme text not null default 'professional',

  -- The deck. An array of slide objects — see lib/presentations/slides.ts,
  -- which is the single definition of that shape and normalises anything
  -- that does not match it rather than trusting this column.
  slides jsonb not null default '[]'::jsonb,

  -- Where the facts came from: [{title, url}]. Rendered as the deck's
  -- sources and kept so a figure on a slide can be traced back.
  sources jsonb not null default '[]'::jsonb,

  --   generating — the row exists, the AI call is in flight
  --   ready      — slides is usable
  --   failed     — see `error`
  status text not null default 'generating'
    check (status in ('generating', 'ready', 'failed')),
  -- Short and user-facing. Never a stack trace.
  error text,

  -- Credits actually settled for the generation, for the activity list.
  credits_charged numeric(12, 4) not null default 0,

  -- ------------------------------------------------------------------
  -- Public sharing.
  -- ------------------------------------------------------------------
  --
  -- A RANDOM TOKEN, not a user-chosen address. Published websites (Task
  -- 2) let the user pick their address and therefore needed ~70 reserved
  -- names and a case-folded uniqueness index, because an address is a
  -- namespace someone can squat or impersonate through. A share link is
  -- not a namespace — nobody types it, they follow it — so the whole
  -- class of problem is avoided by not having names at all.
  --
  -- Unguessable is the security property that matters, and it is
  -- enforced where the token is MINTED (crypto random, 32 hex chars),
  -- not here. Nullable because a deck has no link until someone asks
  -- for one.
  share_slug text unique,
  -- Separate from share_slug being null so that turning sharing off and
  -- on again returns the SAME link. Revoking has to be possible, but a
  -- user who toggles the switch twice did not intend to break every
  -- copy of the URL they had already sent out. `rotate` in the API is
  -- the deliberate way to invalidate one.
  share_enabled boolean not null default false,
  shared_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_presentations_user_created_idx
  on public.user_presentations (user_id, created_at desc);

-- The public route looks a deck up by token on every visit. Partial:
-- only shared decks are ever fetched this way, and the index should not
-- carry the decks that are not.
create index if not exists user_presentations_share_slug_idx
  on public.user_presentations (share_slug)
  where share_slug is not null;

-- The monthly fair-use count (lib/presentations/presentation-limits.ts)
-- is a COUNT over one user's rows in a date window, on every generation.
create index if not exists user_presentations_user_month_idx
  on public.user_presentations (user_id, created_at);

alter table public.user_presentations enable row level security;

drop policy if exists "select_own_user_presentations" on public.user_presentations;
create policy "select_own_user_presentations" on public.user_presentations
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_presentations" on public.user_presentations;
create policy "insert_own_user_presentations" on public.user_presentations
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_user_presentations" on public.user_presentations;
create policy "update_own_user_presentations" on public.user_presentations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_user_presentations" on public.user_presentations;
create policy "delete_own_user_presentations" on public.user_presentations
  for delete using (auth.uid() = user_id);

-- NO public select policy, on purpose — the same call the published-sites
-- migration made and for the same reason. The share route reads through
-- the SERVICE-ROLE client and returns only the columns a viewer needs.
-- An "anyone can read a shared presentation" policy would be evaluated
-- against the ANON key, which is printed in the client bundle: anyone
-- could then enumerate the table directly and read `brief` and
-- `credits_charged` off every shared deck in the database, not just the
-- one slide deck they were sent a link to.

-- ----------------------------------------------------------------------------
-- presentation_versions — a snapshot per generation and per accepted edit.
-- ----------------------------------------------------------------------------
--
-- APPEND-ONLY, like site_versions. "Undo" adds a version whose content is
-- an older one rather than deleting forward history, so undoing an undo
-- works and no button in this product can erase what the user had.
--
-- The ceiling (MAX_VERSIONS_PER_PRESENTATION, 20) is enforced in the API
-- by deleting the OLDEST rows, which is the one deletion allowed here.
create table if not exists public.presentation_versions (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.user_presentations(id) on delete cascade,

  -- Denormalised from the parent so RLS on this table is a plain
  -- `auth.uid() = user_id` rather than a subquery into user_presentations.
  -- A policy that joins is a policy that can be defeated by a row the
  -- join does not see; this one cannot.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- 1-based, unique per deck. Assigned by the API under the row's own
  -- ordering, and unique here so a concurrent double-submit fails loudly
  -- instead of producing two "version 4"s.
  version_number integer not null check (version_number > 0),

  title text not null default '',
  slides jsonb not null default '[]'::jsonb,

  -- What changed, in one sentence: the AI edit's own summary, or a fixed
  -- label for a generation or a manual save.
  change_summary text not null default '',

  created_at timestamptz not null default now(),

  unique (presentation_id, version_number)
);

create index if not exists presentation_versions_deck_idx
  on public.presentation_versions (presentation_id, version_number desc);

alter table public.presentation_versions enable row level security;

drop policy if exists "select_own_presentation_versions" on public.presentation_versions;
create policy "select_own_presentation_versions" on public.presentation_versions
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_presentation_versions" on public.presentation_versions;
create policy "insert_own_presentation_versions" on public.presentation_versions
  for insert with check (auth.uid() = user_id);

-- No UPDATE policy at all: a version is a snapshot, and a snapshot that
-- can be edited is not one. Rolling back writes a NEW version.
drop policy if exists "delete_own_presentation_versions" on public.presentation_versions;
create policy "delete_own_presentation_versions" on public.presentation_versions
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- updated_at.
-- ----------------------------------------------------------------------------
create or replace function public.touch_user_presentations_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_presentations_touch_updated_at on public.user_presentations;
create trigger user_presentations_touch_updated_at
  before update on public.user_presentations
  for each row execute function public.touch_user_presentations_updated_at();
