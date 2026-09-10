-- ============================================================================
-- PROJECTS (redesign phase 2)
-- ============================================================================
--
-- A NAMED GROUPING, AND NOTHING ELSE CHANGES. docs/projects.md measured
-- the alternative — a project_id column on every user table — and found
-- the read cost is not where this feature's money goes. So membership is
-- an EDGE, in the table that already models edges: public.entity_links,
-- which since the baseline has carried source_table/source_id ->
-- target_table/target_id with a relationship_type and NO check
-- constraining the table names. It can already link any two rows a person
-- owns.
--
-- MEMBERSHIP IS NOT TRANSITIVE, and that is a decision rather than an
-- omission. A mission in a project does NOT drag its steps in; a website
-- in a project does NOT drag its form submissions in. Transitivity means
-- every read has to walk a graph, and — the reason that matters more —
-- a person cannot predict what is inside a folder whose contents are
-- computed. One level, put there on purpose, listed exactly as put.
-- scripts/tests/projects.test.mjs proves the absence rather than
-- trusting this paragraph.
--
-- DELETING A PROJECT DELETES THE FOLDER, NEVER THE CONTENTS. The trigger
-- below removes the membership EDGES and stops there: the ideas, files
-- and decks that were in it are untouched and still in every list they
-- were in before. A grouping that could destroy what it groups would be
-- the most expensive misclick in the product.
--
-- NO EXISTING TABLE IS ALTERED BY THIS FILE.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  -- What the person is trying to achieve, in their own words. Shown at the
  -- top of the project and used as the first line of a project-scoped
  -- chat's context.
  goal text,

  -- 'active' while it is being worked on, 'done' when it is finished,
  -- 'archived' when it is neither but should not be deleted. A CHECK
  -- rather than an enum type so adding a fourth is one migration and not
  -- a type rewrite.
  status text not null default 'active' check (status in ('active', 'done', 'archived')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_idx
  on public.projects (user_id, created_at desc);

alter table public.projects enable row level security;

-- FOUR VERBS, ALL SCOPED TO THE OWNER. Insert is NOT revoked here, unlike
-- generated_posts: a project is a folder the person names themselves, not
-- a receipt for work that cost money, so there is nothing for them to
-- forge by creating one.
drop policy if exists projects_select_own on public.projects;
create policy projects_select_own on public.projects
  for select using (auth.uid() = user_id);
drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own on public.projects
  for insert with check (auth.uid() = user_id);
drop policy if exists projects_update_own on public.projects;
create policy projects_update_own on public.projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists projects_delete_own on public.projects;
create policy projects_delete_own on public.projects
  for delete using (auth.uid() = user_id);

-- A POLICY WITHOUT A GRANT IS A LOCKED DOOR.
grant select, insert, update, delete on public.projects to authenticated;
revoke all on public.projects from anon;

drop trigger if exists set_updated_at on public.projects;
create trigger set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

comment on table public.projects is
  'A named grouping of the user''s own rows. Membership lives in public.entity_links with relationship_type = ''in_project'' and is NOT transitive: exactly the rows that were added, one level deep. Deleting a project deletes its membership edges and none of the rows they pointed at.';

-- ----------------------------------------------------------------------
-- THE EDGES GO WHEN THE FOLDER GOES — AND ONLY THE EDGES.
-- ----------------------------------------------------------------------
-- entity_links has no foreign key to anything (it cannot: it links across
-- twenty-odd tables), so nothing else would clean these up and a deleted
-- project would leave rows claiming membership of a folder that no longer
-- exists. Those rows are invisible to the user and would be counted by
-- anything that asks "how many things are in projects".
--
-- SCOPED BY user_id AS WELL AS BY id. The id is a uuid and collision is
-- not the worry; a delete statement in a trigger that could touch another
-- account's rows is, and adding the predicate costs nothing.
create or replace function public.prune_project_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.entity_links
   where user_id = old.user_id
     and relationship_type = 'in_project'
     and (
       (target_table = 'projects' and target_id = old.id)
       or (source_table = 'projects' and source_id = old.id)
     );
  return old;
end;
$$;

comment on function public.prune_project_links() is
  'Removes the in_project membership edges of a deleted project. Deletes NO row that was a member: the folder goes, the contents stay. Scoped to the deleted project''s own user_id.';

drop trigger if exists prune_project_links on public.projects;
create trigger prune_project_links after delete on public.projects
  for each row execute function public.prune_project_links();

-- ----------------------------------------------------------------------
-- AND A SWEEP FOR THE ONES THE TRIGGER COULD NOT HAVE CAUGHT
-- ----------------------------------------------------------------------
-- Rows written before this migration ran, or by any path that removed a
-- project without going through the trigger. Service-role only, because
-- it reads across every account by construction; it deletes only EDGES,
-- and only ones whose project is already gone.
create or replace function public.prune_orphan_project_links()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  with gone as (
    delete from public.entity_links el
     where el.relationship_type = 'in_project'
       and (
         (el.target_table = 'projects' and not exists (select 1 from public.projects p where p.id = el.target_id))
         or (el.source_table = 'projects' and not exists (select 1 from public.projects p where p.id = el.source_id))
       )
    returning 1
  )
  select count(*) into removed from gone;
  return removed;
end;
$$;

comment on function public.prune_orphan_project_links() is
  'Deletes in_project edges whose project no longer exists. Never deletes a member row. Returns the count. service_role only.';

revoke all on function public.prune_orphan_project_links() from public;
revoke all on function public.prune_orphan_project_links() from anon;
revoke all on function public.prune_orphan_project_links() from authenticated;
grant execute on function public.prune_orphan_project_links() to service_role;
