-- What Supabase provides before any project migration runs. Not part of
-- the project's own schema; needed so the migrations can be executed
-- against a plain Postgres.
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists unaccent;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin nologin; end if;
end $$;
create schema if not exists auth;
create schema if not exists storage;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  -- SOFT DELETE. GoTrue sets this rather than removing the row, and a
  -- migration that reads auth.users has to exclude them or a deleted
  -- account still counts as a customer. It was missing here, which made
  -- this stub disagree with the real thing in a direction that hides a
  -- bug: SQL filtering on it failed loudly against this database and
  -- would have worked in production, so the gap was found. The reverse —
  -- a stub with a column production lacks — is the one that ships.
  deleted_at timestamptz,
  created_at timestamptz default now(),
  -- GoTrue advances this on every admin update, and
  -- supabase/migrations/20260910000000_merge_user_metadata.sql keeps doing
  -- so because merge_user_metadata replaces exactly those calls and a
  -- drop-in replacement should not quietly stop a column moving.
  --
  -- It was missing here for the same reason deleted_at was, and it failed
  -- in the same safe direction: `column "updated_at" of relation "users"
  -- does not exist` from user-metadata-merge.dbtest.mjs, against a function
  -- that is correct on real Supabase. A stub missing a production column is
  -- a loud test failure; a stub with a column production lacks is the one
  -- that ships.
  updated_at timestamptz default now()
);
-- Added separately so an existing throwaway database from before these
-- lines gains the columns too.
alter table auth.users add column if not exists deleted_at timestamptz;
alter table auth.users add column if not exists updated_at timestamptz default now();
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated')
$$;
create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id), name text, owner uuid,
  created_at timestamptz default now(), metadata jsonb
);
-- Supabase's own helper, used by storage RLS policies to read the first
-- path segment as the owning user's id.
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select string_to_array(name, '/') $$;
