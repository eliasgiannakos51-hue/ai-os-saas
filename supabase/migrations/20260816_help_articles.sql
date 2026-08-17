-- The Help Centre stops being monolingual.
--
-- IDEMPOTENT. Every statement is guarded, every function is CREATE OR
-- REPLACE, every policy is dropped-if-exists before being recreated. No
-- DROP TABLE, no TRUNCATE, no unqualified DELETE. Safe to run twice, and
-- safe to run whether or not the table already exists.
--
-- ============================================================================
-- WHAT WAS WRONG
-- ============================================================================
-- src/lib/support/knowledge-base.ts holds 27 articles as string literals,
-- written entirely in Greek, and /help renders them verbatim to every
-- visitor. A French user opening the Help Centre gets Greek.
--
-- The chat already handles this correctly and has for a while:
-- CANNED_ANSWER_LOCALE = "el" and matchCannedAnswer() returns null for any
-- other locale, so a non-Greek user falls through to the model and is
-- answered in their own language. The file's own comment records the fix
-- and names this migration as the thing that would make it possible:
--
--     "That is the right trade until the articles live in a table with a
--      locale column and a fallback to English."
--
-- Nothing in the repo's i18n checks could see the gap. check-i18n.js reads
-- messages/*.json and these strings were never there; the bare-text
-- scanner skips any string with no Latin letters, which is every one of
-- them.
--
-- ============================================================================
-- THE SHAPE
-- ============================================================================
-- One row per (slug, locale). `slug` is the article — "cancel",
-- "what-are-credits" — and is what the rest of the app refers to,
-- including the /help anchor and the "?" tips that will link here. The
-- locale is a plain text column rather than an enum on purpose: adding a
-- language must be an INSERT, never a migration.
--
-- FALLBACK IS TO ENGLISH, NEVER TO GREEK. That direction is the whole
-- point of the exercise and it is enforced in the loader rather than here
-- (SQL has no opinion about which language is the base one) — but the
-- seed guarantees that en is complete for all 27 slugs, so the fallback
-- can never land on nothing.
--
-- `triggers` is per-locale and that is not an accident either. They are
-- the phrasings a user actually types, matched by matchCannedAnswer(); a
-- French user does not type Greek, so a shared trigger list would be
-- either useless or actively wrong. The Greek list already contained
-- English product nouns ("pricing", "credits", "cancel"), which is right
-- for a Greek speaker and was a trapdoor for everyone else — an English
-- user typing one of them scored 0.975 against a 0.85 threshold and was
-- handed a Greek paragraph. Per-locale triggers close that by
-- construction.
--
-- NO NUMBERS THAT MOVE. Not one article states a price, a credit cost or
-- an allowance. Those live in lib/billing/plans.ts and on /pricing, they
-- change, and a stale number in a canned answer is a quote a customer will
-- hold us to. Enforced by a digit scan in the knowledge-base test, which
-- now reads the seed.
-- ============================================================================

create table if not exists public.help_articles (
  id uuid primary key default gen_random_uuid(),
  -- The article. Stable across locales; also the /help anchor.
  slug text not null,
  -- BCP-47-ish short code: "en", "el", "pt". Text, not an enum — a new
  -- language has to be an INSERT and never a schema change.
  locale text not null,
  title text not null,
  body text not null,
  category text not null,
  -- Display order WITHIN a category. Quoted everywhere: `order` is a
  -- reserved word and an unquoted one is a syntax error, not a warning.
  "order" integer not null default 0,
  -- A row that is not published is invisible to the public read policy
  -- below, so a half-finished translation can sit in the table safely.
  published boolean not null default true,
  -- The phrasings a user of THIS locale actually types.
  triggers text[] not null default '{}',
  -- Where the reader goes to do the thing, or to read the live numbers.
  -- Nullable: three of the twenty-seven answer a question that has no
  -- destination ("do credits roll over", "is there an app"), and inventing
  -- a link for them would send somebody somewhere for no reason.
  --
  -- NOT per-locale, unlike title/body/triggers: it is a route in this app,
  -- and /pricing is /pricing in every language. Carried on every row
  -- anyway so a reader never has to fall back to another locale just to
  -- find out where the button is.
  href text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- For a database that already ran an earlier version of this file, before
-- href existed. Harmless on a fresh one, where the column is created above.
alter table public.help_articles add column if not exists href text;

-- One row per article per language. This is what makes the seed
-- re-runnable: it is the conflict target for every ON CONFLICT below.
create unique index if not exists help_articles_slug_locale_uidx
  on public.help_articles (slug, locale);

-- CATEGORY IS CLOSED. LOCALE IS NOT. The asymmetry is the point.
--
-- A new language must be an INSERT and never a schema change, so `locale`
-- stays open text — that is what lets the eleventh language ship without a
-- migration, and an unreachable row in a locale the app does not serve is
-- simply never selected.
--
-- A category is different: /help GROUPS by it, so a typo'd category does
-- not produce an unreachable row, it produces a row that renders under a
-- heading nobody wrote, or vanishes from a grouped page while still
-- existing in the table. There are eleven of them, they are a property of
-- the page's layout rather than of the content, and adding one is a
-- deliberate act. So it is checked.
do $category_check$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'help_articles_category_check'
       and conrelid = 'public.help_articles'::regclass
  ) then
    alter table public.help_articles
      add constraint help_articles_category_check
      check (category in (
        'getting-started', 'billing', 'credits', 'websites', 'agents',
        'missions', 'account', 'chat', 'files', 'integrations', 'privacy'
      ));
  end if;
end
$category_check$;

-- The loader's read path: everything published in one locale, in order.
create index if not exists help_articles_locale_published_idx
  on public.help_articles (locale, published, category, "order");

alter table public.help_articles enable row level security;

-- NO `force row level security`, AND THAT IS THE FIX RATHER THAN AN
-- OMISSION.
--
-- It was here, with the comment "cheap, because nothing legitimately reads
-- this table as the owner". Reading was never the problem. Something
-- legitimately WRITES to it as the owner — the seed, in the very next
-- migration file — and FORCE makes the policies apply to the owner too.
-- There is no INSERT policy, by design, so the seed is refused:
--
--   ERROR:  new row violates row-level security policy for table "help_articles"
--
-- Reproduced on PostgreSQL 16 by applying both files as a plain
-- `nosuperuser nobypassrls` role, which is what a migration runner may
-- well be. It passed every earlier run only because psql was connected as
-- a superuser, and a superuser bypasses RLS whether FORCE is set or not —
-- so the check could not fail in the place it was being checked.
--
-- Without FORCE the protection is unchanged where it matters: anon and
-- authenticated still see published rows only, and still cannot write,
-- because that is decided by the policy below and the revoke under it.
-- What changes is that applying this schema no longer depends on the
-- privileges of whoever applies it. It is also what every other RLS table
-- in this schema does; this was the only one that differed.

-- ----------------------------------------------------------------------
-- RLS: public read of published rows, and no writes from a browser at all.
-- ----------------------------------------------------------------------
-- PUBLIC on purpose, matching what /help already is: half of these
-- questions — what does it cost, what are credits, is my data safe — are
-- asked BEFORE anyone signs up, and an answer you must create an account
-- to read is not an answer. Nothing here varies by account, so there is
-- nothing to leak.
drop policy if exists help_articles_public_read_published on public.help_articles;
create policy help_articles_public_read_published
  on public.help_articles
  for select
  to anon, authenticated
  using (published = true);

-- No INSERT/UPDATE/DELETE policy exists, for anyone. With RLS enabled and
-- no permissive policy for a command, that command is denied — so writes
-- are service-role only, which bypasses RLS by design. Stated as an
-- explicit revoke as well, so the intent survives somebody adding a
-- policy later without thinking about it.
revoke insert, update, delete on public.help_articles from anon, authenticated;
grant select on public.help_articles to anon, authenticated;

-- ----------------------------------------------------------------------
-- updated_at
-- ----------------------------------------------------------------------
-- A trigger rather than an application concern: the seed re-runs as an
-- UPSERT, and "when did this translation last change" has to be true even
-- when the writer is a psql session rather than the app.
create or replace function public.help_articles_touch_updated_at()
returns trigger
language plpgsql
-- Not SECURITY DEFINER: it needs no privilege the writer does not already
-- have, and a definer function is a privilege-escalation surface to be
-- opened only when something actually requires it.
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- House rule, applied to every new function: nothing callable from a
-- browser session unless it is meant to be. A trigger function is invoked
-- by the trigger, never by a client, so both roles lose EXECUTE.
revoke all on function public.help_articles_touch_updated_at() from public;
revoke execute on function public.help_articles_touch_updated_at() from anon, authenticated;

drop trigger if exists help_articles_touch_updated_at on public.help_articles;
create trigger help_articles_touch_updated_at
  before update on public.help_articles
  for each row
  execute function public.help_articles_touch_updated_at();

comment on table public.help_articles is
  'Help Centre articles, one row per (slug, locale). Read by lib/support/help-articles.ts; the loader falls back to en and never to el. Seeded by supabase/migrations/20260816_help_articles_seed.sql, which is generated — see scripts/help-articles/.';
