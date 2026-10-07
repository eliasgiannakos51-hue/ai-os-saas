-- ---------------------------------------------------------------------------
-- THE IMAGE TOOL'S PICTURES (2026-10-07, MASTER 16 package 19, behind the
-- switch "image-studio").
--
-- generated_images  one row per description: the words, the shape, and the
--                   four pictures (paths in the ai-images bucket; shape in
--                   src/lib/images/image-studio.ts, readVariants), each
--                   with its largest size once it is asked for and every
--                   picture a change replaced, so a change never loses the
--                   one before it.
-- ai-images         a PRIVATE bucket, <owner>/<image id>/<name>. Nobody
--                   reads or writes it from a browser: every route checks
--                   the row's owner and then signs a short address with
--                   the service role (src/app/api/images/), so it carries
--                   no storage policy for `authenticated` at all.
--
-- INSERT AND UPDATE ARE SERVICE-ROLE ONLY, as for generated_posts: the
-- row is written by the route that made the call and knows what it cost,
-- and a person who could update `variants` could point their row at a
-- path the route would then sign. They may read and delete their own rows;
-- api/images/[id] deletes the pictures with the row.
--
-- public.delete_user_storage_objects() is replaced with the fourth bucket
-- in its list, so deleting an account deletes these pictures too
-- (scripts/tests/gdpr-coverage.test.mjs compares that list with every
-- bucket the application names).
--
-- Idempotent: create if not exists, on conflict, create or replace.
-- How to check it after running: npm run db:pending; /api/health lists
-- generated_images.
-- How to undo: drop table public.generated_images;
--              delete from storage.buckets where id = 'ai-images';  (only
--              once the bucket is empty — storage refuses otherwise, and
--              emptying it deletes every picture made, so ask first);
--              and re-run 20261005000000_delete_user_storage_objects_all_buckets.sql
--              to put the three-bucket function back.
-- ---------------------------------------------------------------------------

create table if not exists public.generated_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  prompt text not null,
  aspect text not null default '1:1' check (aspect in ('1:1', '4:5', '16:9', '9:16')),
  variants jsonb not null default '[]'::jsonb,

  status text not null default 'done' check (status in ('done', 'failed')),
  -- A reason CODE, never a sentence: 'refused', 'ai_unavailable'.
  error text,
  -- A receipt for the screen, not the ledger: every charge on this row,
  -- the four, each change and each largest size, added up.
  credits_charged int not null default 0 check (credits_charged >= 0),
  -- Held while a change or a largest size is being made, so two presses
  -- cannot both rewrite `variants` from the same starting point.
  busy_since timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generated_images_user_idx
  on public.generated_images (user_id, created_at desc);

alter table public.generated_images enable row level security;

drop policy if exists generated_images_select_own on public.generated_images;
create policy generated_images_select_own on public.generated_images
  for select using (auth.uid() = user_id);
drop policy if exists generated_images_delete_own on public.generated_images;
create policy generated_images_delete_own on public.generated_images
  for delete using (auth.uid() = user_id);

grant select, delete on public.generated_images to authenticated;
revoke insert, update on public.generated_images from authenticated;
revoke all on public.generated_images from anon;

drop trigger if exists set_updated_at on public.generated_images;
create trigger set_updated_at before update on public.generated_images
  for each row execute function public.set_updated_at();

-- 50 MB: the largest picture the provider makes is a 4K PNG, well under.
insert into storage.buckets (id, name, public, file_size_limit)
values ('ai-images', 'ai-images', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

create or replace function public.delete_user_storage_objects(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  -- BUCKETS: the whole list. Adding a bucket to the application without
  -- adding it here is what 20261005000000 exists to stop happening twice.
  v_buckets text[] := array['user-files', 'create-attachments', 'website-references', 'ai-images'];
  v_deleted integer;
begin
  if target_user_id is null then
    raise exception 'delete_user_storage_objects: no user' using errcode = '22023';
  end if;

  delete from storage.objects
   where bucket_id = any(v_buckets)
     and (storage.foldername(name))[1] = target_user_id::text;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$fn$;

comment on function public.delete_user_storage_objects(uuid) is
  'Deletes every storage object under <user_id>/ in EVERY bucket this product writes to: user-files, create-attachments, website-references, ai-images. Called by /api/delete-account/confirm before auth.admin.deleteUser.';

revoke all on function public.delete_user_storage_objects(uuid) from public;
revoke all on function public.delete_user_storage_objects(uuid) from anon;
revoke all on function public.delete_user_storage_objects(uuid) from authenticated;
grant execute on function public.delete_user_storage_objects(uuid) to service_role;
