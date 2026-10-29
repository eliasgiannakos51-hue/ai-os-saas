-- ---------------------------------------------------------------------------
-- REBUILD, Κομμάτι 4's last piece: an app published to its own address
-- (/a/<subdomain>), next to the self-test and the Brand Kit hint that
-- landed earlier in the same round.
--
-- How to undo: alter table public.rebuild_projects
--   drop column if exists subdomain,
--   drop column if exists is_active,
--   drop column if exists published_at;
--   (every published app stops being reachable at its address; nothing
--   else reads these three columns, and rebuild_projects itself is
--   untouched).
--
-- WHY THREE COLUMNS ON THE SAME ROW, NOT A SECOND TABLE: an app has at
-- most one address, ever (same as a published site — see
-- published_sites_website_id_key in 20260803000000_baseline_schema.sql),
-- and rebuild_projects is already the one row an app lives on. A second
-- table would need its own FK, its own RLS, and its own join on every
-- read, to say one-to-one what a nullable column already says.
--
-- WHY /a/ AND NOT /s/ OR /r/: Site's published_sites owns the /s/
-- namespace and its subdomain uniqueness, and the affiliate referral link
-- already owns /r/ (src/app/r/[code]/route.ts, ionexa.ai/r/AB2C4XYZ — the
-- actual reason /r/ was tried first and rejected: Next.js refuses to
-- build with two ambiguous dynamic routes at the same path depth).
-- Sharing /s/ would mean checking THIS table
-- against THAT one on every publish, or merging two products' lifecycles
-- (view counts, SEO, per-page rows) that Rebuild has none of. Different
-- prefix, independent namespace, no cross-table check needed — the same
-- choice Games (QUEUE GM1) will face for its own "Publish σε δική του
-- διεύθυνση" and should make the same way.
--
-- is_active, separately from subdomain being set: unpublishing clears
-- is_active but KEEPS subdomain, so a re-publish restores the same
-- address — the same reversible-unpublish rule published_sites already
-- uses (src/app/api/websites/[id]/publish/route.ts's DELETE handler).
-- The unique index applies whenever subdomain is set, regardless of
-- is_active: nobody's old address becomes free just because they paused
-- it.
--
-- READ BY THE PUBLIC ROUTE (src/app/a/[subdomain]/route.ts) WITH THE
-- ADMIN CLIENT, like published_sites: a stranger must not be able to
-- read this table at all, only receive one app's html for a live
-- subdomain. WRITTEN BY api/rebuild/[id]/route.ts's "publish"/
-- "unpublish" actions only — the account still cannot write this row
-- itself (revoked in 20261014000000_server_written_tables.sql, unchanged
-- here).
-- ---------------------------------------------------------------------------

alter table public.rebuild_projects
  add column if not exists subdomain text,
  add column if not exists is_active boolean not null default false,
  add column if not exists published_at timestamptz;

create unique index if not exists rebuild_projects_subdomain_key
  on public.rebuild_projects (lower(subdomain))
  where subdomain is not null;

-- The public route's only query.
create index if not exists rebuild_projects_subdomain_active_idx
  on public.rebuild_projects (lower(subdomain), is_active)
  where subdomain is not null;

comment on column public.rebuild_projects.subdomain is
  'The /a/<subdomain> address this app was ever given. Kept across unpublish so a re-publish restores the same links.';
comment on column public.rebuild_projects.is_active is
  'Whether /a/<subdomain> currently serves this app. False after Unpublish; the row and its subdomain are kept.';
comment on column public.rebuild_projects.published_at is
  'When this app first went live at its current subdomain. Unset until the first publish.';
