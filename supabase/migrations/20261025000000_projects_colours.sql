-- ---------------------------------------------------------------------------
-- A PROJECT KNOWS ITS OWN COLOURS (MASTER, owner's message 2026-10-22,
-- point 6: «Όσα είναι στο ίδιο Project ξέρουν το ένα το άλλο: όνομα,
-- χρώματα, στόχος, αρχεία»).
--
-- TWO NULLABLE COLUMNS, NOT A NEW TABLE AND NOT A REUSE OF
-- lib/memory/brand.ts. The brand-memory rows (chat_memory, prefixed
-- "Επιχείρηση:"/"Χρώματα επιχείρησης:") are the BUSINESS's colours,
-- global to the account and read by Site generation regardless of which
-- project a conversation is in — scoping that mechanism per project would
-- change what every existing site brief reads today. A project's own
-- colours are a narrower, additive fact: what THIS project's results
-- should look like, shown on the project page and offered to a tool that
-- starts work from inside it. Same hex shape as project_flows.colour
-- (20261022000000_project_flows.sql), which already proved the CHECK.
--
-- NULL ON EVERY EXISTING ROW, which means "no colour chosen" — the same
-- meaning project_flows.colour being NULL already has. No backfill: every
-- project made before this migration keeps working exactly as it did.
--
-- Idempotent: add column if not exists, drop constraint if exists before
-- re-adding. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- How to check it after running: npm run db:pending; /api/health lists
-- the two columns.
-- How to undo: alter table public.projects drop column if exists primary_colour;
--              alter table public.projects drop column if exists secondary_colour;
--              (every project's name, goal, status and membership is
--              untouched — only the two colours are lost.)
-- ---------------------------------------------------------------------------

alter table public.projects add column if not exists primary_colour text;
alter table public.projects add column if not exists secondary_colour text;

alter table public.projects drop constraint if exists projects_primary_colour_hex;
alter table public.projects add constraint projects_primary_colour_hex
  check (primary_colour is null or primary_colour ~ '^#[0-9a-f]{6}$');

alter table public.projects drop constraint if exists projects_secondary_colour_hex;
alter table public.projects add constraint projects_secondary_colour_hex
  check (secondary_colour is null or secondary_colour ~ '^#[0-9a-f]{6}$');

comment on column public.projects.primary_colour is
  'Exactly #rrggbb lowercase, or NULL for "not chosen". Shown on the project page and offered to a tool that starts work from inside this project — never read by lib/memory/brand.ts, which is the account''s own business colours and stays global.';
comment on column public.projects.secondary_colour is
  'Same shape and meaning as primary_colour, the second of the project''s two colours.';
