-- ============================================================================
-- user_profile_learned — what the AI has noticed about a person.
--
-- Standalone, additive, idempotent.
--
-- THIS IS THE MOST PERSONAL TABLE IN THE APPLICATION. Every other one
-- holds what the user typed. This one holds conclusions DRAWN about them
-- that they never wrote down: how they write, when they work, what they
-- keep rejecting. Three things follow, and none is optional:
--
--   1. THEY CAN SEE ALL OF IT. Settings lists every row, in plain
--      language, with the confidence attached. A profile a person cannot
--      read is a dossier.
--   2. THEY CAN DELETE ANY OF IT, AND ALL OF IT. Both are ordinary
--      row-level policies here, not a support request.
--   3. THEY CANNOT WRITE IT, AND NEITHER CAN THEIR BROWSER. There is no
--      insert or update policy. An observation is something the system
--      concluded, and a row a client could insert would let a page — or
--      anything that got hold of the anon key and a session — put words in
--      the assistant's model of somebody.
--
-- Erasure: user_id cascades from auth.users, so deleting the account
-- deletes the profile. Export: the rows are readable by their owner, so
-- Settings' data export includes them like any other table.
-- ============================================================================

create table if not exists public.user_profile_learned (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  --   communication — how they write and how much they want back
  --   work          — which parts of the product they live in, and when
  --   preferences   — style they choose, and what they reject
  --   goals         — what they are trying to achieve
  --   patterns      — rhythms: days, streaks, bursts
  category text not null
    check (category in ('communication', 'work', 'preferences', 'goals', 'patterns')),

  -- ONE SENTENCE, IN PLAIN LANGUAGE, WRITTEN TO BE READ BY THE PERSON IT
  -- IS ABOUT. Not a key, not a JSON blob, not an internal code. The
  -- Settings list renders this verbatim, so an observation nobody would
  -- want to read is an observation that should not be stored.
  observation text not null check (length(observation) between 3 and 300),

  -- 0.1-0.95. Never 1: an assistant certain about a person has stopped
  -- being able to notice they changed. See lib/profile/maturity.ts.
  confidence numeric(4, 3) not null default 0.300
    check (confidence >= 0.100 and confidence <= 0.950),

  -- How many refreshes have seen this. Confirmation raises confidence;
  -- absence decays it.
  evidence_count integer not null default 1 check (evidence_count >= 1),

  first_seen timestamptz not null default now(),
  last_confirmed timestamptz not null default now(),

  -- Set when the USER edits the wording. An edited observation is never
  -- overwritten by the observer again — see lib/profile/store.ts. A
  -- correction the system quietly reverts is worse than no correction at
  -- all, because the person believes they fixed it.
  user_edited boolean not null default false
);

-- One row per (user, category, observation). The upsert on refresh keys on
-- exactly this, which is what turns "seen again" into a confirmation
-- instead of a duplicate row.
create unique index if not exists user_profile_learned_unique
  on public.user_profile_learned (user_id, category, observation);

create index if not exists user_profile_learned_user_confidence_idx
  on public.user_profile_learned (user_id, confidence desc);

alter table public.user_profile_learned enable row level security;

drop policy if exists "select_own_profile_learned" on public.user_profile_learned;
create policy "select_own_profile_learned" on public.user_profile_learned
  for select using (auth.uid() = user_id);

-- Deleting one observation, and "Forget everything", are the same policy.
drop policy if exists "delete_own_profile_learned" on public.user_profile_learned;
create policy "delete_own_profile_learned" on public.user_profile_learned
  for delete using (auth.uid() = user_id);

-- NO INSERT POLICY, deliberately. Observations are concluded by the
-- server, never submitted.
--
-- NO UPDATE POLICY either, and that one is worth spelling out because the
-- user CAN correct an observation. The correction goes through
-- api/profile, which rewrites the row with the service-role client and
-- sets user_edited. Handing out a client-side UPDATE would also hand out
-- the ability to raise `confidence` and `evidence_count`, i.e. to forge
-- how strongly the assistant believes something — which is a stranger
-- thing to be able to do to yourself than it first sounds, and a very
-- strange thing to be able to do if a session is ever compromised.

-- ----------------------------------------------------------------------------
-- user_profile_state — the maturity counter.
--
-- Separate from the observations because it answers a different question
-- ("how much has this person done") and is refreshed on a different
-- cadence. Keeping it as a row rather than recomputing on every page load
-- means Settings makes one query instead of six count(*)s.
-- ----------------------------------------------------------------------------
create table if not exists public.user_profile_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Actions, not days. See lib/profile/maturity.ts for why.
  meaningful_actions integer not null default 0 check (meaningful_actions >= 0),
  level smallint not null default 0 check (level between 0 and 3),
  last_refreshed_at timestamptz not null default now()
);

alter table public.user_profile_state enable row level security;

drop policy if exists "select_own_profile_state" on public.user_profile_state;
create policy "select_own_profile_state" on public.user_profile_state
  for select using (auth.uid() = user_id);

drop policy if exists "delete_own_profile_state" on public.user_profile_state;
create policy "delete_own_profile_state" on public.user_profile_state
  for delete using (auth.uid() = user_id);
