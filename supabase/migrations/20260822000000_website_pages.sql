-- ---------------------------------------------------------------------
-- MULTI-PAGE WEBSITES, ADDED WITHOUT TOUCHING THE PAGE THAT ALREADY WORKS
-- ---------------------------------------------------------------------
--
-- Every site today is one document in user_websites.html_content, served
-- from /s/<subdomain>. That does not move: html_content remains the HOME
-- page, and `pages` carries any additional ones.
--
-- A row with pages null — which is every existing row, since the column
-- arrives null — is a single-page site and behaves exactly as it did
-- before. There is no backfill, and there is no state in which a
-- published site is half-migrated.
--
-- FOUR TABLES CARRY A SITE'S HTML, and all three need the column. This
-- is not symmetry for its own sake — each one would break differently:
--
--   user_websites     the draft the owner edits.
--   published_sites   a SNAPSHOT taken at publish time, and what
--                     /s/<subdomain> actually reads. Without the column
--                     here a multi-page site publishes and serves only
--                     its home page, with navigation linking to 404s.
--   website_versions  draft history. A rollback that restored
--                     html_content while leaving pages at the newer
--                     version would reinstate a home page whose
--                     navigation points at pages that no longer match it.
--   site_versions     PUBLISHED history — what /api/published/[id]/rollback
--                     restores. The one that was nearly missed: the static
--                     column check in db-migrations.test.mjs caught an
--                     insert naming a column this table did not have.
--
-- Idempotent. No DROP, no TRUNCATE, no DELETE — it adds two nullable
-- columns and one index, and can be run against a live database any
-- number of times.

alter table public.user_websites
  add column if not exists pages jsonb;

alter table public.published_sites
  add column if not exists pages jsonb;

alter table public.website_versions
  add column if not exists pages jsonb;

alter table public.site_versions
  add column if not exists pages jsonb;

-- The shape is checked in the database as well as in TypeScript, because
-- a row written by a future migration, a manual fix or a different client
-- would otherwise reach the serving route unvalidated. An array is the
-- only thing lib/publishing/website-pages.ts can normalise; anything else
-- would be dropped silently at read time, which is a bug that looks like
-- an empty site.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_websites_pages_is_array'
  ) then
    alter table public.user_websites
      add constraint user_websites_pages_is_array
      check (pages is null or jsonb_typeof(pages) = 'array')
      not valid;
  end if;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['published_sites', 'website_versions', 'site_versions']
  loop
    if not exists (select 1 from pg_constraint where conname = t || '_pages_is_array') then
      execute format(
        'alter table public.%I add constraint %I check (pages is null or jsonb_typeof(pages) = %L) not valid',
        t, t || '_pages_is_array', 'array'
      );
    end if;
  end loop;
end $$;

-- NOT VALID above, then validated separately: adding a validated check to
-- a large live table takes an ACCESS EXCLUSIVE lock for the whole scan.
-- Existing rows are all null and pass trivially, so this is fast, but the
-- two-step form is the one that stays fast when the table is not small.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'user_websites_pages_is_array' and not convalidated
  ) then
    alter table public.user_websites validate constraint user_websites_pages_is_array;
  end if;
  if exists (
    select 1 from pg_constraint
    where conname = 'published_sites_pages_is_array' and not convalidated
  ) then
    alter table public.published_sites validate constraint published_sites_pages_is_array;
  end if;
  if exists (
    select 1 from pg_constraint
    where conname = 'website_versions_pages_is_array' and not convalidated
  ) then
    alter table public.website_versions validate constraint website_versions_pages_is_array;
  end if;
  if exists (
    select 1 from pg_constraint
    where conname = 'site_versions_pages_is_array' and not convalidated
  ) then
    alter table public.site_versions validate constraint site_versions_pages_is_array;
  end if;
end $$;

-- The serving route looks a page up by subdomain and slug on every
-- request for a sub-page. Without this it reads the whole jsonb for the
-- row; with it, a site with pages is found by index like any other.
-- On published_sites, not user_websites: this is the table a public
-- request reads on every page view, and the only one where the lookup is
-- on the hot path.
create index if not exists published_sites_pages_gin_idx
  on public.published_sites using gin (pages jsonb_path_ops)
  where pages is not null;

-- No new function, so no execute grant to revoke. Stated rather than
-- omitted: the standing rule is that every new function revokes execute
-- from anon and authenticated, and a reader should be able to see that
-- the rule was considered rather than forgotten. RLS on both tables is
-- unchanged and already covers these columns — a policy grants access to
-- the ROW, and the new columns are part of rows that were already
-- protected.
