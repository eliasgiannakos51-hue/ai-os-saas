-- ---------------------------------------------------------------------------
-- «2. PROJECTS: ΝΕΑ ΟΘΟΝΗ» Κομμάτι 7 (owner's message, 2026-10-28) —
-- Share: a read-only link to a project, revoked with one press.
--
-- TWO NULLABLE COLUMNS, NOT A NEW TABLE. One project has at most one live
-- link at a time (the owner's own words: "ανάκληση με ένα πάτημα" —
-- pressing Share again after a revoke makes a NEW link, it does not
-- resurrect the old one), so this is the same shape as primary_colour/
-- secondary_colour (20261025000000_projects_colours.sql) and notes
-- (20261101000000_projects_notes.sql): one more optional fact about ONE
-- project, nothing existing touched.
--
-- share_token is the SECRET itself: a long, server-generated, unguessable
-- string (src/app/api/projects/[id]/share/route.ts, randomBytes(24) —
-- see that file for why the alphabet-mapped referral code in
-- lib/affiliate/rules.ts is the wrong shape to copy: a share link is
-- pasted, never typed by hand). UNIQUE so two projects can never resolve
-- to the same public page by construction, not by convention.
--
-- NO COLUMN-LEVEL LOCKDOWN (unlike site_versions/projects.user_id in
-- 20261023100000_projects_site_versions_server_written.sql): the account
-- already has row-scoped UPDATE on its own projects (projects_update_own,
-- 20261001000000_projects.sql) and a row's owner choosing their OWN
-- project's share_token by hand — rather than through
-- api/projects/[id]/share, which always calls randomBytes — only weakens
-- THAT owner's own link, never another account's. src/app/api/projects/
-- [id]/route.ts's existing PATCH whitelist (name/goal/notes/status/
-- colours) is deliberately NOT extended to include this column: generating
-- a share token is its own action, not a field someone fills in.
--
-- NULL ON EVERY EXISTING ROW, same meaning notes/goal already give NULL:
-- nothing shared yet. No backfill.
--
-- Idempotent: add column if not exists. No DROP TABLE, no TRUNCATE, no
-- unqualified DELETE.
-- How to check it after running: npm run db:pending; /api/health lists
-- the columns.
-- How to undo: alter table public.projects drop column if exists share_token;
--              alter table public.projects drop column if exists share_token_created_at;
--              (every project's name, goal, colours, notes, status and
--              membership is untouched — only live share links are lost,
--              and each was revocable by the owner anyway.)
-- ---------------------------------------------------------------------------

alter table public.projects add column if not exists share_token text;
alter table public.projects add column if not exists share_token_created_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_share_token_key'
  ) then
    alter table public.projects add constraint projects_share_token_key unique (share_token);
  end if;
end $$;

comment on column public.projects.share_token is
  'A long, server-generated (randomBytes(24).toString("base64url")), unguessable token that resolves this project''s read-only public page at /shared/[token] (src/app/shared/[token]/page.tsx, read via createAdminClient() — no session). NULL means nothing is currently shared. A revoke clears it back to null, and Share again always makes a brand-new token afterward, never reusing the old one. Never read by lib/user-context.ts or any generation prompt — purely a capability for the public page.';
comment on column public.projects.share_token_created_at is
  'When the current share_token (if any) was made, src/app/api/projects/[id]/share/route.ts''s own POST. NULL exactly when share_token is NULL.';
