-- ============================================================================
-- THE PRESENTATION TRACKER BECOMES A GENERATOR (V5 #21)
-- ============================================================================
--
-- /dashboard/presentations was a CRUD table: a title, a description and a
-- slide count the user typed by hand, and a tooltip that had to say "It
-- does not create slides". This migration is the schema for the version
-- that does — a description goes in, a deck of slides comes back, and the
-- deck can be taken out as a .pptx or a PDF.
--
-- THE TABLE IS KEPT, NOT REPLACED. ai_presentations already has the RLS
-- the user's own rows need (20260803 baseline, section for the AI
-- modules), a row in the search index (20260824's specs list), and an
-- entry in the GDPR export registry. A second table would need all three
-- again and would leave the hand-typed notes behind. So the deck lives
-- in new columns on the same row, and the old rows keep working:
--
--   source = 'note'       a row the old form wrote — title, description,
--                         slide_count, status. Still listed on the page,
--                         marked as a note from before.
--   source = 'generated'  a row the generator wrote — `slides` holds the
--                         deck (lib/presentations/deck.ts is the shape),
--                         `locale` the language it is written in,
--                         `image_source` where its pictures came from.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

alter table public.ai_presentations
  add column if not exists slides jsonb,
  add column if not exists locale text,
  add column if not exists image_source text,
  add column if not exists source text not null default 'note',
  -- What the generation cost. A RECEIPT for the history list, not the
  -- ledger: the charge itself is the settlement row credit_transactions /
  -- cost_log carry, and nothing reads this column back to decide money.
  add column if not exists credits_charged integer not null default 0,
  -- A reason CODE, never a sentence (the page renders its own translated
  -- wording): 'ai_unavailable', 'unusable'.
  add column if not exists error text;

-- CHECKS, drop-then-add so a re-paste is harmless.
alter table public.ai_presentations
  drop constraint if exists ai_presentations_source_check;
alter table public.ai_presentations
  add constraint ai_presentations_source_check
  check (source in ('note', 'generated'));

alter table public.ai_presentations
  drop constraint if exists ai_presentations_image_source_check;
alter table public.ai_presentations
  add constraint ai_presentations_image_source_check
  check (image_source is null or image_source in ('unsplash', 'own', 'none'));

alter table public.ai_presentations
  drop constraint if exists ai_presentations_credits_charged_check;
alter table public.ai_presentations
  add constraint ai_presentations_credits_charged_check
  check (credits_charged >= 0);

-- The page lists a person's decks newest first.
create index if not exists ai_presentations_user_created_idx
  on public.ai_presentations (user_id, created_at desc);

-- A POLICY WITHOUT A GRANT IS A LOCKED DOOR, and a new column on a table
-- is covered by the table's grant — restated here so the migration reads
-- whole: the baseline granted the four verbs to authenticated on this
-- table and the 20260803 policies scope every one of them to
-- auth.uid() = user_id. The generate route writes through the user's own
-- session client, so the same policies decide the insert.
grant select, insert, update, delete on public.ai_presentations to authenticated;
revoke all on public.ai_presentations from anon;
