-- ---------------------------------------------------------------------------
-- REBUILD, Κομμάτι 3 (2026-10-29): «Approve plan» builds phase by phase.
-- Only apps whose kept capabilities (Κομμάτι 2) genuinely need it get a
-- real first phase — Apps' own structured definition of the data and
-- screens (lib/apps/app-plan.ts, called as a library, no Apps project ever
-- created) — before the existing single HTML-writing phase runs. An app
-- whose capabilities needed nothing extra keeps today's one phase exactly
-- as it was.
--
-- How to undo: alter table public.rebuild_projects
--   drop column if exists has_app_phase,
--   drop column if exists app_definition;
--   (both are additive; nothing else reads or writes them).
--
-- has_app_phase is set once, when the app is planned (api/rebuild), from
-- whether any capability was kept that round — never changed afterwards.
-- app_definition is written once, by api/rebuild/[id]'s new "appLogic"
-- action, and read by the SAME route's "build" action to fold into the
-- app it writes; a build that runs with no app_definition (has_app_phase
-- false, or the phase has not run yet) behaves exactly as before this
-- migration.
--
-- How to check it after running: npm run db:pending; /api/health lists
-- rebuild_projects.has_app_phase and rebuild_projects.app_definition.
-- ---------------------------------------------------------------------------

alter table public.rebuild_projects add column if not exists has_app_phase boolean not null default false;
alter table public.rebuild_projects add column if not exists app_definition jsonb;

comment on column public.rebuild_projects.has_app_phase is
  'Set once at plan time: true when a kept Κομμάτι-2 capability means a real "App logic" phase runs before the app is written.';
comment on column public.rebuild_projects.app_definition is
  'Apps'' own structured definition (collections/screens/notifications) from the "appLogic" phase — lib/apps/app-plan.ts''s AppDefinition, read by lib/apps/app-plan.ts''s own parser, never a separate Apps project.';
