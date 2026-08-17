-- ============================================================================
-- Website Builder: multiple reference images (up to 5 per website)
-- Run this once against your live Supabase project. Safe to run on a
-- project with existing data — every statement is additive/idempotent
-- (IF NOT EXISTS / ON CONFLICT DO NOTHING / DROP POLICY IF EXISTS before
-- CREATE POLICY), nothing here drops a table or deletes existing rows.
--
-- This supersedes user_websites.reference_image_url (a single-image
-- column from an earlier pass) as the source of truth for reference
-- images going forward. That column is intentionally left in place,
-- unused — dropping it is not required to ship this and dropping columns
-- is destructive, so it's left for you to remove later if you want to.
-- ============================================================================

-- Storage bucket for reference images (created in an earlier pass — this
-- statement is here too so this file is fully self-contained and can be
-- run standalone even on a project where it wasn't created yet).
insert into storage.buckets (id, name, public)
values ('website-references', 'website-references', false)
on conflict (id) do nothing;

drop policy if exists "select_own_website_references" on storage.objects;
create policy "select_own_website_references" on storage.objects
  for select using (
    bucket_id = 'website-references' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "insert_own_website_references" on storage.objects;
create policy "insert_own_website_references" on storage.objects
  for insert with check (
    bucket_id = 'website-references' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "delete_own_website_references" on storage.objects;
create policy "delete_own_website_references" on storage.objects
  for delete using (
    bucket_id = 'website-references' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- One row per reference image (up to 5 per website — enforced in the app,
-- not the database). image_url stores the Storage path (bucket
-- "website-references" above), not a public URL — the bucket is private.
--
-- NOTE ON SCHEMA: the requested column set was (id, website_id, image_url,
-- created_at). This adds a user_id column beyond that — deliberately, so
-- RLS can use this schema's existing auth.uid() = user_id pattern (used by
-- every other table here, including website_versions) instead of a
-- join-based policy through user_websites, which would be a new pattern
-- not used anywhere else in this schema. website_id is still the FK that
-- ties images to their website; user_id is a denormalized ownership check.
create table if not exists public.website_reference_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  website_id uuid not null references public.user_websites(id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists website_reference_images_website_id_idx
  on public.website_reference_images (website_id);

alter table public.website_reference_images enable row level security;

drop policy if exists "select_own_website_reference_images" on public.website_reference_images;
create policy "select_own_website_reference_images" on public.website_reference_images
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_website_reference_images" on public.website_reference_images;
create policy "insert_own_website_reference_images" on public.website_reference_images
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete_own_website_reference_images" on public.website_reference_images;
create policy "delete_own_website_reference_images" on public.website_reference_images
  for delete using (auth.uid() = user_id);
