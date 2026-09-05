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

-- AND THE GRANT THAT MAKES THEM CALLABLE, which was missing here for the
-- same reason deleted_at was, and hid for longer.
--
-- Every RLS policy in this project is `using (user_id = auth.uid())`. A
-- policy is evaluated as the querying role, so `authenticated` must be
-- able to reach into the auth schema and run that function — Supabase
-- grants exactly this, and without it a policy does not deny access, it
-- ERRORS with "permission denied for schema auth".
--
-- Nothing noticed for as long as nothing impersonated. Fourteen dbtests
-- ran against this database as the owning superuser, for whom RLS does
-- not apply at all; the first suite to `set local role authenticated` --
-- user-isolation.dbtest.mjs -- failed on its second assertion. A stub
-- missing a production grant is a loud failure the moment anything uses
-- it, which is the safe direction; the reverse would have made every
-- isolation result below meaningless and green.
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant execute on function auth.role() to authenticated, anon, service_role;
grant select on auth.users to authenticated, anon, service_role;

-- ============================================================
-- THE PUBLIC SCHEMA'S DEFAULT PRIVILEGES, and why their absence was the
-- most misleading thing in this file.
-- ============================================================
--
-- Supabase grants ALL on every table in `public` to anon, authenticated
-- and service_role, and sets the same as a default privilege so new
-- tables inherit it. That is not an accident of configuration: it is why
-- RLS is mandatory there. On Supabase a table without RLS is readable by
-- anyone holding the anon key, which is shipped to every browser.
--
-- This stub granted nothing, so `authenticated` could reach only the 26
-- tables whose migration happens to write an explicit GRANT. The other 80
-- were unreachable in the throwaway database FOR A REASON PRODUCTION DOES
-- NOT HAVE — a missing grant rather than a policy — and that is the
-- dangerous direction: a table whose policy is wrong, or absent, looks
-- safe here and is open there.
--
-- Found by user-isolation.dbtest.mjs, which impersonates `authenticated`
-- and got "permission denied for table user_files" 87 times where it
-- expected an isolation result. Nothing before it had impersonated
-- anybody, so nothing before it could have noticed.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
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
