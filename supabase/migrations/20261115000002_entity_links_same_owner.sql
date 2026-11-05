-- ---------------------------------------------------------------------------
-- BOTH ENDS OF A LINK BELONG TO THE ACCOUNT THAT MADE IT (2026-11-05 review, A3).
--
-- public.entity_links joins two rows of the same account — a document to a
-- project, a lead to an idea. Its two ends are polymorphic (source_table /
-- target_table name one of twenty-odd tables), so no foreign key can say
-- whose they are, and the insert policy only checked the link row's own
-- user_id. The public share page of a project reads a project's links and
-- their rows by the project's owner (src/lib/projects/load-project-detail.ts
-- now filters every read to that owner); this is the database half, for
-- every reader, present and future.
--
-- A trigger, BEFORE INSERT OR UPDATE, for every role. For each end it
-- accepts only a table in schema public that has both an `id` and a
-- `user_id` column — read from the catalog, so the list of linkable
-- tables (src/lib/knowledge-graph.ts) needs no copy here — and only a row
-- of that table whose user_id is the link's own. Anything else raises,
-- and the insert is refused. The table name reaches the query only
-- through format('%I'), after the catalog has confirmed it is a table.
--
-- DEFINER, so the answer is the same for the signed-in role and for the
-- service role; it reads nothing but the existence of one row.
-- Links already written are not touched. They can only be read through
-- the owner filter now, which is what the share page does.
-- scripts/tests/entity-links-owner.dbtest.mjs runs it against a real
-- Postgres.
--
-- Safe to paste twice.
--
-- How to undo: drop trigger if exists entity_links_same_owner on
-- public.entity_links; drop function if exists
-- public.entity_links_same_owner();
-- ---------------------------------------------------------------------------

create or replace function public.entity_links_same_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  side record;
  owned boolean;
begin
  for side in
    select new.source_table as tbl, new.source_id as row_id
    union all
    select new.target_table, new.target_id
  loop
    if not exists (
      select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = side.tbl
         and c.relkind in ('r', 'p')
         and exists (select 1 from pg_catalog.pg_attribute a
                      where a.attrelid = c.oid and a.attname = 'id' and not a.attisdropped)
         and exists (select 1 from pg_catalog.pg_attribute a
                      where a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped)
    ) then
      raise exception 'entity_links: % is not a table that can be linked', side.tbl
        using errcode = '23514';
    end if;

    execute format('select exists (select 1 from public.%I where id = $1 and user_id = $2)', side.tbl)
      into owned
      using side.row_id, new.user_id;

    if not owned then
      raise exception 'entity_links: the linked row is not the account''s own'
        using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

comment on function public.entity_links_same_owner() is
  'Refuses an entity_links row unless both ends are rows of a public table with id and user_id, owned by the link''s own user_id. Trigger only.';

-- NO GRANT TO ANYONE: Postgres does not check EXECUTE when a trigger fires.
revoke all on function public.entity_links_same_owner() from public;
revoke all on function public.entity_links_same_owner() from anon;
revoke all on function public.entity_links_same_owner() from authenticated;

drop trigger if exists entity_links_same_owner on public.entity_links;
create trigger entity_links_same_owner
  before insert or update on public.entity_links
  for each row execute function public.entity_links_same_owner();

do $$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'entity_links'
      and t.tgname = 'entity_links_same_owner' and not t.tgisinternal
  ) then
    raise exception 'entity_links_same_owner: the trigger is not on public.entity_links';
  end if;
end;
$$;
