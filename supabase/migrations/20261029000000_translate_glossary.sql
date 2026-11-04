-- TERMS THAT DO NOT TRANSLATE (the standalone Translate tool, package 4,
-- 2026-10-24): one row per account, a list of words the account wants kept
-- exactly as written in every target language — a product name, a code,
-- a name the generic "keep business names as they are" instruction in
-- lib/translate/translate-prompt.ts does not know to look for because it
-- is not a real-world proper noun, just this account's own word.
--
-- ONE ROW, NOT ONE ROW PER TERM: the whole list is read and written
-- together (api/translate/glossary/route.ts), so one row with an array
-- column is the whole table, the same shape scopes/consent_scopes already
-- use elsewhere in this schema (20260803000000_baseline_schema.sql,
-- 20260808_gdpr_erasure_gaps.sql).
create table if not exists public.translate_glossary (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.translate_glossary enable row level security;

drop policy if exists "select_own_translate_glossary" on public.translate_glossary;
create policy "select_own_translate_glossary" on public.translate_glossary
  for select using (auth.uid() = user_id);

drop policy if exists "upsert_own_translate_glossary" on public.translate_glossary;
create policy "upsert_own_translate_glossary" on public.translate_glossary
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_translate_glossary" on public.translate_glossary;
create policy "update_own_translate_glossary" on public.translate_glossary
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_translate_glossary" on public.translate_glossary;
create policy "delete_own_translate_glossary" on public.translate_glossary
  for delete using (auth.uid() = user_id);

-- Erased with the account: user_id cascades from auth.users.
-- Idempotent: if not exists, drop policy if exists.
-- How to check it after running: npm run db:pending; /api/health lists
-- translate_glossary.
-- How to undo: drop table if exists public.translate_glossary;
--   (removes every saved glossary term; the translations already made are
--   not touched, since the words they used are already written into
--   those translations, not read again from this table).
-- ---------------------------------------------------------------------------
