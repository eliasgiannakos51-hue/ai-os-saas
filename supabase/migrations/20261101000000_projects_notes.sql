-- ---------------------------------------------------------------------------
-- «2. PROJECTS: ΝΕΑ ΟΘΟΝΗ» Κομμάτι 4 (owner's message, 2026-10-28) —
-- «What Ionexa knows»: free-text memory about THIS project, hand-written,
-- that feeds generation when a conversation/create/mission-plan/agent-
-- build is scoped to this project.
--
-- ONE NULLABLE COLUMN, NOT chat_memory AND NOT A NEW TABLE. chat_memory
-- (lib/memory/brand.ts's own "Επιχείρηση:"/"Χρώματα επιχείρησης:" lines
-- included) is the ACCOUNT's memory — global, read by every conversation
-- regardless of project. Giving it a project_id column would mean every
-- existing row either stays global (pointless addition) or has to be
-- retrofitted with one (a real migration of real rows, which the
-- standing rule — no user data moves without the owner's approval and a
-- before/after count — does not let this round do on its own say-so).
-- A project's own notes are additive and narrower, same shape as
-- primary_colour/secondary_colour (20261025000000_projects_colours.sql):
-- a new, optional fact about ONE project, nothing existing touched.
--
-- NULL ON EVERY EXISTING ROW, meaning "nothing written yet" — the exact
-- meaning `goal` being NULL already has. No backfill.
--
-- Idempotent: add column if not exists. No DROP TABLE, no TRUNCATE, no
-- unqualified DELETE.
-- How to check it after running: npm run db:pending; /api/health lists
-- the column.
-- How to undo: alter table public.projects drop column if exists notes;
--              (every project's name, goal, colours, status and
--              membership is untouched — only the notes are lost.)
-- ---------------------------------------------------------------------------

alter table public.projects add column if not exists notes text;

comment on column public.projects.notes is
  'Free-text "What Ionexa knows" about this project, hand-written by the owner. Fed into generation (chat, create, mission plan, agent build) ONLY when that conversation is scoped to this project — lib/user-context.ts''s getUserFullContext/buildUserContextPromptAddition*. NULL means nothing written yet. Never read by lib/memory/brand.ts, which stays the account-wide business memory.';
