-- ACCOUNT DELETION CLEANED ONE BUCKET OF THREE.
--
-- public.delete_user_file_objects() — written for the files feature and
-- correct about it — deletes from 'user-files' and nothing else:
--
--     delete from storage.objects
--      where bucket_id = 'user-files'
--        and (storage.foldername(name))[1] = target_user_id::text;
--
-- The tree has three buckets. The other two are written by the browser,
-- under the same `<uid>/...` layout, from components the person uses
-- before they ever open Files:
--
--   create-attachments   photos attached to a Create prompt
--                        (src/components/create/create-chat.tsx) and to a
--                        deck
--                        (src/components/presentations/presentations-workspace.tsx)
--   website-references   reference images for a generated site
--                        (src/components/website-builder/website-builder-workspace.tsx)
--
-- Neither was deleted with the account. 'website-references' is a PUBLIC
-- bucket — the baseline schema says so at the point it is created, and it
-- is public because the generated site loads the image — so an account
-- deleted a year ago still has its uploaded photographs reachable by URL.
-- That is Article 17 not honoured, in the same words the route already
-- uses about the bucket it DOES clean.
--
-- WHY IT SURVIVED. The route's comment is right, the function it calls is
-- right about its own bucket, and gdpr-coverage.test.mjs asserts the call
-- is made and made BEFORE deleteUser. Every one of those checks is about
-- the participant. None of them could ask about a bucket that never
-- joined — see docs/shapes.md, "The check covers the participants, not the
-- ones who stayed out".
--
-- THE LIST LIVES IN ONE PLACE AND THE GATE READS IT. The bucket names are
-- a single array here rather than three statements, so
-- gdpr-coverage.test.mjs can compare it against every bucket constant in
-- src/lib and fail on a fourth bucket that is added and not listed.

create or replace function public.delete_user_storage_objects(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  -- BUCKETS: the whole list. Adding a bucket to the application without
  -- adding it here is what this migration exists to stop happening twice.
  v_buckets text[] := array['user-files', 'create-attachments', 'website-references'];
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
  'Deletes every storage object under <user_id>/ in EVERY bucket this product writes to: user-files, create-attachments, website-references. Replaces delete_user_file_objects(), which covered only the first. Called by /api/delete-account/confirm before auth.admin.deleteUser.';

revoke all on function public.delete_user_storage_objects(uuid) from public;
revoke all on function public.delete_user_storage_objects(uuid) from anon;
revoke all on function public.delete_user_storage_objects(uuid) from authenticated;
grant execute on function public.delete_user_storage_objects(uuid) to service_role;

-- delete_user_file_objects() IS KEPT, and not because anything still calls
-- it: /api/delete-account/confirm moves to the function above in the same
-- commit as this file. It is kept because dropping a function that a
-- not-yet-deployed copy of the application might still call turns a
-- deployment ordering problem into an account deletion that fails with
-- "function does not exist" — and the one thing worse than deleting one
-- bucket of three is deleting none. Its comment now says so.
comment on function public.delete_user_file_objects(uuid) is
  'SUPERSEDED by public.delete_user_storage_objects(uuid), which covers all three buckets rather than only user-files. Kept so a deployment that still calls this name does not fail; nothing in the tree calls it.';
