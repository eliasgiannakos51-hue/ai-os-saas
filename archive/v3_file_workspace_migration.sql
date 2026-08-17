-- ============================================================================
-- V3 — Task 4: File Workspace + Deep Research.
--
-- Standalone, additive, idempotent. Safe to run on a project that already
-- has supabase_full_project_backup.sql applied.
--
-- WHAT IS DIFFERENT ABOUT THIS ONE: the bytes a user uploads are theirs,
-- not ours, and a PDF is routinely the single most sensitive object a
-- small business owns — a contract, a payroll run, a medical letter. So
-- the bucket is PRIVATE with no public read at all, every download goes
-- through a short-lived signed URL minted only after an ownership check,
-- and the extracted text lives in a table whose RLS is scoped to the
-- owner exactly like every other one here.
--
-- The extracted text is stored in the DATABASE rather than re-derived
-- from the object on every question. That is deliberate: extraction is
-- the expensive, failure-prone step, and asking a question should not be
-- able to fail because a PDF parser had a bad day. It also means "delete
-- this file" has to clear BOTH the object and the row, which the delete
-- route does in that order.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- user_files — one row per uploaded file.
-- ----------------------------------------------------------------------------
create table if not exists public.user_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- As the user named it, sanitised for display. NOT used to build the
  -- storage path: a filename is attacker-controlled and a path built from
  -- one is a traversal waiting to happen.
  filename text not null,

  -- The normalised kind, not the browser's Content-Type header (which is
  -- client-supplied and therefore a hint, never a fact).
  file_type text not null check (file_type in ('pdf', 'docx', 'xlsx', 'txt', 'csv', 'md')),

  size_bytes bigint not null check (size_bytes >= 0),

  -- `<user_id>/<uuid>.<ext>` inside the PRIVATE 'user-files' bucket. The
  -- leading segment is what the storage RLS policies below match on, so
  -- it is the ownership proof and not merely an organisational choice.
  storage_path text not null,

  -- The text the AI actually reads. Null while processing, and null
  -- forever for a file we could not read (a scanned PDF with no text
  -- layer), in which case `error` says so in words a person can act on.
  extracted_text text,
  page_count integer,
  -- Characters of extracted text. Cheap to read for the cost estimate
  -- without pulling the whole document into memory.
  char_count integer not null default 0,

  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  --   pending    — row exists, bytes uploaded, extraction not started
  --   processing — extraction running
  --   ready      — extracted_text is usable
  --   failed     — see `error`; the file is still downloadable
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'ready', 'failed')),
  -- A short, user-facing reason. Never a parser stack trace.
  error text
);

create index if not exists user_files_user_uploaded_idx
  on public.user_files (user_id, uploaded_at desc);

create index if not exists user_files_user_status_idx
  on public.user_files (user_id, processing_status);

alter table public.user_files enable row level security;

drop policy if exists "select_own_user_files" on public.user_files;
create policy "select_own_user_files" on public.user_files
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_files" on public.user_files;
create policy "insert_own_user_files" on public.user_files
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_user_files" on public.user_files;
create policy "update_own_user_files" on public.user_files
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_user_files" on public.user_files;
create policy "delete_own_user_files" on public.user_files
  for delete using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.user_files;
create trigger set_updated_at before update on public.user_files
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- file_collections — a named group of files to ask questions against.
-- ----------------------------------------------------------------------------
create table if not exists public.file_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists file_collections_user_created_idx
  on public.file_collections (user_id, created_at desc);

alter table public.file_collections enable row level security;

drop policy if exists "select_own_file_collections" on public.file_collections;
create policy "select_own_file_collections" on public.file_collections
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_file_collections" on public.file_collections;
create policy "insert_own_file_collections" on public.file_collections
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_file_collections" on public.file_collections;
create policy "update_own_file_collections" on public.file_collections
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_file_collections" on public.file_collections;
create policy "delete_own_file_collections" on public.file_collections
  for delete using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.file_collections;
create trigger set_updated_at before update on public.file_collections
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- file_collection_items — the membership join.
--
-- user_id is denormalised here rather than derived through a join, for
-- the same reason it is on website_versions and site_versions: this
-- schema's RLS is `auth.uid() = user_id` everywhere, and a policy that
-- has to join to find its owner is a policy nobody can read at a glance.
-- The FKs to both parents mean a row can only ever name a collection and
-- a file that exist; the CHECK on insert (in application code) means they
-- must both belong to the same person.
-- ----------------------------------------------------------------------------
create table if not exists public.file_collection_items (
  collection_id uuid not null references public.file_collections(id) on delete cascade,
  file_id uuid not null references public.user_files(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, file_id)
);

create index if not exists file_collection_items_file_idx
  on public.file_collection_items (file_id);
create index if not exists file_collection_items_user_idx
  on public.file_collection_items (user_id);

alter table public.file_collection_items enable row level security;

drop policy if exists "select_own_file_collection_items" on public.file_collection_items;
create policy "select_own_file_collection_items" on public.file_collection_items
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_file_collection_items" on public.file_collection_items;
create policy "insert_own_file_collection_items" on public.file_collection_items
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete_own_file_collection_items" on public.file_collection_items;
create policy "delete_own_file_collection_items" on public.file_collection_items
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- research_reports — Deep Research jobs and their results.
--
-- A long-running job that spends real money, so it follows the Website
-- Builder's shape exactly: a row exists in 'pending' BEFORE the work
-- starts, so a run killed mid-flight leaves a visible record instead of
-- no trace, and `processing_started_at` is the atomic claim that stops
-- two invocations working the same job.
-- ----------------------------------------------------------------------------
create table if not exists public.research_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  topic text not null,
  -- The user's own language, so the report comes back in it.
  language text not null default 'en',

  --   pending    — created, not claimed
  --   planning   — breaking the topic into research questions
  --   researching— running the searches
  --   synthesising — writing the report
  --   ready      — `sections` is populated
  --   failed     — see `error`
  status text not null default 'pending'
    check (status in ('pending', 'planning', 'researching', 'synthesising', 'ready', 'failed')),

  -- The 3-6 questions the AI decided to research. Shown to the user
  -- BEFORE the expensive part starts, because "here is what I am about to
  -- spend your credits looking up" is the one moment they can say no.
  questions jsonb not null default '[]'::jsonb,
  -- The finished report: [{ heading, body, sourceIndexes }]
  sections jsonb not null default '[]'::jsonb,
  -- [{ title, url }] — every claim in the report points at one of these.
  sources jsonb not null default '[]'::jsonb,

  -- Set once the report has been saved into the Documents module, so the
  -- user's report lives where the rest of their writing does.
  document_id uuid,

  credits_charged numeric not null default 0,
  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  -- The atomic claim. Null means unclaimed.
  processing_started_at timestamptz
);

create index if not exists research_reports_user_created_idx
  on public.research_reports (user_id, created_at desc);
create index if not exists research_reports_status_idx
  on public.research_reports (status, created_at);

alter table public.research_reports enable row level security;

drop policy if exists "select_own_research_reports" on public.research_reports;
create policy "select_own_research_reports" on public.research_reports
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_research_reports" on public.research_reports;
create policy "insert_own_research_reports" on public.research_reports
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_research_reports" on public.research_reports;
create policy "update_own_research_reports" on public.research_reports
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_research_reports" on public.research_reports;
create policy "delete_own_research_reports" on public.research_reports
  for delete using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.research_reports;
create trigger set_updated_at before update on public.research_reports
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Storage: the 'user-files' bucket.
--
-- PRIVATE, unlike 'website-references'. That bucket is public because the
-- user downloads the generated HTML and hosts it elsewhere, so any expiry
-- would break their live site later. Nothing about a payroll PDF wants
-- that trade. Every read here goes through a signed URL minted by
-- api/files/[id]/download after an ownership check, and those expire in
-- 60 seconds.
--
-- `public = false` is forced on conflict so that a bucket accidentally
-- created public in the dashboard is CORRECTED by running this file,
-- rather than silently left open.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('user-files', 'user-files', false)
on conflict (id) do update set public = false;

-- The first path segment is the owner's uuid. These policies are what
-- makes that true rather than merely conventional.
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

-- ----------------------------------------------------------------------------
-- Account deletion must remove the OBJECTS too, not just the rows.
--
-- `on delete cascade` clears user_files, but storage.objects has no FK to
-- auth.users — so without this the bytes of a deleted account's contracts
-- would sit in the bucket forever. That is not a tidiness problem, it is
-- the erasure right in Article 17 not being honoured.
--
-- Called by api/delete-account/confirm before it deletes the auth user.
-- ----------------------------------------------------------------------------
create or replace function public.delete_user_file_objects(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer;
begin
  delete from storage.objects
    where bucket_id = 'user-files'
      and (storage.foldername(name))[1] = target_user_id::text;
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.delete_user_file_objects(uuid) from public;
revoke all on function public.delete_user_file_objects(uuid) from anon;
revoke all on function public.delete_user_file_objects(uuid) from authenticated;
grant execute on function public.delete_user_file_objects(uuid) to service_role;
