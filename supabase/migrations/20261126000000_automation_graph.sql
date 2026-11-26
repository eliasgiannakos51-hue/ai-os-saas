-- ---------------------------------------------------------------------------
-- AUTOMATIONS: FROM LIST TO GRAPH (Phase 2 of the n8n spec, 2026-11-26).
--
-- Three new JSONB columns on automation_flows, each nullable and
-- defaulting to NULL so every existing row is unchanged:
--
--   edges   — [{id, from, fromPort, to, toPort}]
--             When NULL or absent, the canvas and runner derive edges from
--             the boxes array order (box i → box i+1), which is exactly
--             what the linear layout has always done.
--
--   layout  — {boxId: {x, y}}
--             Node positions set by the user dragging cards. When NULL
--             the waterfall auto-layout kicks in. Saving layout after
--             a drag stores these.
--
--   groups  — [{id, name, boxIds, collapsed}]
--             Visual groups (spec §10). Purely cosmetic — the runner
--             ignores them. When NULL, no groups are shown.
--
-- Also on automation_flow_versions so undo restores them.
--
-- The FLOW_COLUMNS constant in flow-access.ts does NOT name these:
-- they are read in a separate query that returns NULL if the migration
-- has not been pasted yet, the same pattern as minutes_saved and mode.
--
-- How to check: npm run db:pending
-- How to undo: ALTER TABLE public.automation_flows
--              DROP COLUMN IF EXISTS edges,
--              DROP COLUMN IF EXISTS layout,
--              DROP COLUMN IF EXISTS groups;
--              ALTER TABLE public.automation_flow_versions
--              DROP COLUMN IF EXISTS edges,
--              DROP COLUMN IF EXISTS layout;
--              (the data in these columns is lost; the boxes array and
--              the existing edges derived from it are unaffected)
-- ---------------------------------------------------------------------------

ALTER TABLE public.automation_flows
  ADD COLUMN IF NOT EXISTS edges  jsonb,
  ADD COLUMN IF NOT EXISTS layout jsonb,
  ADD COLUMN IF NOT EXISTS groups jsonb;

ALTER TABLE public.automation_flow_versions
  ADD COLUMN IF NOT EXISTS edges  jsonb,
  ADD COLUMN IF NOT EXISTS layout jsonb;
