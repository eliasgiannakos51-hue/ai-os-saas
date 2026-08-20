-- ============================================================================
-- Storage repair: every bucket the application writes to, (re)provisioned
-- in one idempotent, paste-sized statement block.
--
-- WHY THIS FILE EXISTS. File upload failed completely on the real
-- deployment ("the file could not be stored") while every test passed.
-- The bucket and its policies are created at the very END of the 2,700-line
-- baseline migration — and this repository has already documented (TODO.md,
-- "Seeding") that large SQL pastes through the Supabase editor can stop
-- part-way WITHOUT an error. A truncated baseline paste leaves the tables
-- (defined first) present and the storage section (defined last) missing —
-- exactly the observed failure. This file makes the storage layer
-- re-runnable on its own, small enough that no editor mangles it.
--
-- Also fixed here: the 'create-attachments' bucket was NEVER created by
-- any migration — 20260804000001 adds its policies but not the bucket, so
-- a database built cleanly from migrations refuses Create Studio image
-- attachments with "Bucket not found".
--
-- Idempotent. Safe to run any number of times. Run the verification query
-- at the bottom afterwards and expect three rows.
-- ============================================================================

-- 1. user-files: PRIVATE. Reads go through 60-second signed URLs minted
--    after an ownership check. `public = false` is forced on conflict so a
--    bucket accidentally created public in the dashboard is corrected.
--    file_size_limit matches MAX_FILE_BYTES (20MB) in lib/files/file-types.ts
--    — the server-side backstop for the direct browser→storage upload path.
insert into storage.buckets (id, name, public, file_size_limit)
values ('user-files', 'user-files', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "select_own_user_files_objects" on storage.objects;
create policy "select_own_user_files_objects" on storage.objects
  for select using (
    bucket_id = 'user-files' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "insert_own_user_files_objects" on storage.objects;
create policy "insert_own_user_files_objects" on storage.objects
  for insert with check (
    bucket_id = 'user-files' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "update_own_user_files_objects" on storage.objects;
create policy "update_own_user_files_objects" on storage.objects
  for update using (
    bucket_id = 'user-files' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "delete_own_user_files_objects" on storage.objects;
create policy "delete_own_user_files_objects" on storage.objects
  for delete using (
    bucket_id = 'user-files' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 2. website-references: PUBLIC by design — the user downloads generated
--    HTML and hosts it elsewhere, so a signed URL would expire under their
--    live site. Paths are unguessable; writes and deletes stay owner-only.
insert into storage.buckets (id, name, public)
values ('website-references', 'website-references', true)
on conflict (id) do update set public = true;

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

-- 3. create-attachments: PRIVATE. The bucket itself was missing from every
--    migration; its policies (below) previously referenced a bucket that a
--    clean build did not have.
insert into storage.buckets (id, name, public)
values ('create-attachments', 'create-attachments', false)
on conflict (id) do update set public = false;

do $$ begin
  create policy delete_own_create_attachments on storage.objects for delete to public using (((bucket_id = 'create-attachments'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy insert_own_create_attachments on storage.objects for insert to public with check (((bucket_id = 'create-attachments'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy select_own_create_attachments on storage.objects for select to public using (((bucket_id = 'create-attachments'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
exception when duplicate_object then null; end $$;

-- ============================================================================
-- Verify. Expect exactly these three rows:
--   create-attachments  | false | (null)
--   user-files          | false | 20971520
--   website-references  | true  | (null)
--
--   select id, public, file_size_limit from storage.buckets
--    where id in ('user-files', 'website-references', 'create-attachments')
--    order by id;
--
-- And the policies (expect 10 rows for these three buckets):
--   select policyname from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and (qual like '%user-files%' or qual like '%website-references%'
--           or qual like '%create-attachments%'
--           or with_check like '%user-files%'
--           or with_check like '%create-attachments%'
--           or with_check like '%website-references%');
-- ============================================================================
