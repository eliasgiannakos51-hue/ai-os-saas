-- ---------------------------------------------------------------------------
-- MIGRATION LEDGER (security audit, 2026-10-21): which files this database
-- has actually run, asked of the database itself instead of inferred from
-- the objects a migration happens to create.
--
-- THE GAP THIS CLOSES. scripts/db/pending-migrations.mjs derives, per file,
-- the objects it CREATES and asks the database whether each exists — which
-- answers "did its tables/columns/functions arrive", not "did this exact
-- file run". On 2026-09-04 two migrations from a fortnight earlier turned
-- out never to have run (CLAUDE.md, "Migrations are applied by hand"), and
-- that was found only because a feature broke in production. From this
-- file on, every new migration ends with its own
--   insert into public.schema_migrations (filename) values ('<its own
--   name>') on conflict (filename) do nothing;
-- so a file nobody pasted is visibly absent from the ledger, not inferred
-- absent from the shape of what it was supposed to create.
--
-- NOT BACKFILLED, ON PURPOSE. Every migration before this one predates the
-- ledger and has no row here even where it ran; scripts/db/pending-
-- migrations.mjs's existing object-derived check is still what answers for
-- those. The ledger is authoritative only for 20261026000000 on — the same
-- cutoff shape migration-undo.test.mjs already uses for its own rule.
--
-- Read by /api/health (service role; RLS keeps it unreadable through
-- PostgREST to anon/authenticated, same lockdown as ai_cost_log in
-- 20261012000000_cost_log_server_reads.sql) and by `npm run db:pending`.
--
-- Idempotent: create table if not exists, drop policy if exists, revoke,
-- insert ... on conflict do nothing.
-- How to check it after running: the SELF-CHECK at the end raises if the
-- signed-in role can read or write the ledger;
-- scripts/tests/migration-ledger.dbtest.mjs runs it against a real
-- Postgres.
-- How to undo: drop table if exists public.schema_migrations;
--   (removes only the ledger — every object the tracked migrations
--   created stays; this table only records that they ran).
-- ---------------------------------------------------------------------------

create table if not exists public.schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);

alter table public.schema_migrations enable row level security;

revoke all on public.schema_migrations from anon, authenticated;

comment on table public.schema_migrations is
  'Ledger of which migration files have run, self-registered by each file from 20261026000000 on. Read by /api/health and npm run db:pending.';

insert into public.schema_migrations (filename) values ('20261026000000_migration_ledger.sql')
on conflict (filename) do nothing;

-- ---------------------------------------------------------------------------
-- SELF-CHECK.
-- ---------------------------------------------------------------------------
do $$
begin
  if has_table_privilege('authenticated', 'public.schema_migrations', 'SELECT')
     or has_table_privilege('authenticated', 'public.schema_migrations', 'INSERT')
     or has_table_privilege('anon', 'public.schema_migrations', 'SELECT') then
    raise exception 'schema_migrations: anon or authenticated can still read or write the ledger';
  end if;
  if not exists (
    select 1 from public.schema_migrations where filename = '20261026000000_migration_ledger.sql'
  ) then
    raise exception 'schema_migrations: this migration did not register itself';
  end if;
end;
$$;
