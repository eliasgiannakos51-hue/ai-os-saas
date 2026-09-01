-- SAMPLE DATA IS AN IMPORT, and that is the whole design.
--
-- V4.6 #6 asks for demo rows that are never mixed with real ones, that
-- can be removed in one action, and that the export can tell apart. Every
-- one of those is already solved for imports: user_imports records one
-- row per import, every module table carries import_id, and "undo this
-- import" is one delete per table.
--
-- So the sample is not a new flag on twenty tables. It is a sixth value
-- of user_imports.source, and everything downstream keeps working.
--
-- Idempotent: drops the constraint by name before adding it, so a re-run
-- replaces rather than fails. The check is rewritten in full because a
-- CHECK cannot be extended in place.
alter table public.user_imports
  drop constraint if exists user_imports_source_check;

alter table public.user_imports
  add constraint user_imports_source_check
  check (source in ('csv', 'paste', 'quick_add', 'gmail', 'google_drive', 'sample'));

-- A PARTIAL UNIQUE INDEX, so an account cannot end up with two sample
-- imports and half a sample it cannot clear.
--
-- The load endpoint checks for an existing sample before it writes, but a
-- check followed by an insert is two statements and a double-click is two
-- requests. This makes the second one fail in the database instead of
-- quietly doubling every row. Partial, so it says nothing about the
-- CSV imports an account may legitimately have dozens of.
create unique index if not exists user_imports_one_sample_per_user_idx
  on public.user_imports (user_id)
  where source = 'sample';

-- ----------------------------------------------------------------------------
-- WHY THERE IS NO CASCADE HERE, written down because the absence is the
-- decision.
--
-- import_id is `on delete set null` on every module table. That is right
-- for a CSV — deleting the import RECORD should not delete the user's
-- rows, which are their data whatever brought them in. It is exactly
-- wrong for the sample: dropping the user_imports row would leave
-- thirty-six rows behind with import_id = NULL, which is the shape of
-- data the user typed by hand. The sample would become real.
--
-- So clearing the sample deletes the ROWS first and the import record
-- last (see lib/sample-data/apply.ts), and scripts/tests/sample-data.test.mjs
-- fails the build if that order is reversed.
-- ----------------------------------------------------------------------------
