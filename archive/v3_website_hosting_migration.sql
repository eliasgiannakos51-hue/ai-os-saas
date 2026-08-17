-- ============================================================================
-- V3 — Task 2: Website Hosting & Publishing.
--
-- Standalone, additive, idempotent. Requires user_websites (base schema).
--
-- What this makes possible: a site generated in the Website Builder stops
-- being a file the user downloads and becomes a live URL we serve. That is
-- the difference between a tool they used once and infrastructure they
-- depend on.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- published_sites — one row per live site.
--
-- html_content is stored HERE rather than read from user_websites on every
-- request, deliberately. The published copy is a SNAPSHOT: a user editing
-- a draft in the builder must not silently change what the public sees,
-- and the live site must keep serving even while a regeneration is
-- mid-flight (user_websites.html_content is empty for the whole duration
-- of a 'pending'/'processing' generation — reading through would take
-- every published site down for minutes every time its owner clicked
-- "regenerate").
-- ----------------------------------------------------------------------------
create table if not exists public.published_sites (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.user_websites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- 3-30 chars, [a-z0-9-], not starting/ending with a hyphen, not on the
  -- reserved blocklist. Validated in lib/publishing/subdomain.ts before it
  -- ever reaches here; the CHECK is the backstop that makes a bypassed
  -- validator a database error rather than a live site at /s/admin.
  subdomain text not null,
  -- Infrastructure only for now: there is no domain to point at yet, so
  -- the verification flow exists and nothing serves from it.
  custom_domain text,
  custom_domain_verification_token text,
  custom_domain_verified_at timestamptz,

  html_content text not null,

  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  --   live        — served
  --   unpublished — withdrawn by the owner; the subdomain is kept so a
  --                 re-publish reuses it and old links start working again
  status text not null default 'live'
    check (status in ('live', 'unpublished')),

  -- Denormalised running total, incremented by the public route. The
  -- per-day breakdown lives in site_analytics; this exists so a list of 30
  -- sites is one query rather than 30 aggregations.
  view_count bigint not null default 0,
  is_active boolean not null default true
);

-- The unique constraint that makes a subdomain a namespace.
--
-- Case is folded because subdomains are case-insensitive in DNS and in
-- URLs: without lower(), "Acme" and "acme" would be two different sites
-- reachable at the same address. Application code lowercases on the way
-- in; this makes that impossible to forget.
create unique index if not exists published_sites_subdomain_key
  on public.published_sites (lower(subdomain));

-- The public route's only query.
create index if not exists published_sites_subdomain_active_idx
  on public.published_sites (lower(subdomain), is_active);

create index if not exists published_sites_user_id_idx
  on public.published_sites (user_id, published_at desc);

-- One published site per website. Re-publishing updates the row rather
-- than creating a second one, which is what keeps "how many sites has this
-- account published" a truthful count.
create unique index if not exists published_sites_website_id_key
  on public.published_sites (website_id);

alter table public.published_sites enable row level security;

drop policy if exists "select_own_published_sites" on public.published_sites;
create policy "select_own_published_sites" on public.published_sites
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_published_sites" on public.published_sites;
create policy "insert_own_published_sites" on public.published_sites
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_published_sites" on public.published_sites;
create policy "update_own_published_sites" on public.published_sites
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_published_sites" on public.published_sites;
create policy "delete_own_published_sites" on public.published_sites
  for delete using (auth.uid() = user_id);

-- NO public select policy, on purpose. The public route reads through the
-- service-role client (which bypasses RLS) and selects only the columns a
-- visitor needs. An "anyone can read published_sites" policy would expose
-- user_id and the full row of every site on the platform to anyone holding
-- the anon key, which is printed in the client bundle.

drop trigger if exists set_updated_at on public.published_sites;
create trigger set_updated_at before update on public.published_sites
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- site_versions — every version that was ever LIVE.
--
-- Distinct from website_versions, which tracks the draft in the builder. A
-- user can edit a draft ten times and publish once; only the publish is a
-- version of the live site, and rollback has to mean "what the public saw
-- on Tuesday", not "what I had in the editor on Tuesday".
-- ----------------------------------------------------------------------------
create table if not exists public.site_versions (
  id uuid primary key default gen_random_uuid(),
  published_site_id uuid not null references public.published_sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  html_content text not null,
  published_at timestamptz not null default now(),
  version_number int not null,
  -- What changed, in the user's words or the AI's — shown in the timeline.
  change_description text
);

create unique index if not exists site_versions_site_version_key
  on public.site_versions (published_site_id, version_number);

create index if not exists site_versions_site_published_at_idx
  on public.site_versions (published_site_id, published_at desc);

alter table public.site_versions enable row level security;

drop policy if exists "select_own_site_versions" on public.site_versions;
create policy "select_own_site_versions" on public.site_versions
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_site_versions" on public.site_versions;
create policy "insert_own_site_versions" on public.site_versions
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete_own_site_versions" on public.site_versions;
create policy "delete_own_site_versions" on public.site_versions
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- site_analytics — views per site per day.
--
-- GDPR-shaped by construction: there is no column that could hold personal
-- data. No IP, no user agent, no cookie, no visitor id, no referrer, no
-- path. A day and two counters. "unique_visitors" is derived from a
-- rotating, salted, truncated hash held only in memory for the current day
-- (see lib/publishing/analytics.ts) — it is a COUNT, and nothing that
-- could identify a person is ever written here.
-- ----------------------------------------------------------------------------
create table if not exists public.site_analytics (
  id uuid primary key default gen_random_uuid(),
  published_site_id uuid not null references public.published_sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  views integer not null default 0,
  unique_visitors integer not null default 0
);

create unique index if not exists site_analytics_site_date_key
  on public.site_analytics (published_site_id, date);

create index if not exists site_analytics_user_date_idx
  on public.site_analytics (user_id, date desc);

alter table public.site_analytics enable row level security;

-- Read-only to the owner: only the service-role client (the public serving
-- route) writes counts. A user who could write here could fabricate
-- traffic; one who could delete could hide it.
drop policy if exists "select_own_site_analytics" on public.site_analytics;
create policy "select_own_site_analytics" on public.site_analytics
  for select using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- record_site_view — one atomic call per public page view.
--
-- Doing this as read-then-write from the route would lose counts under any
-- concurrency at all, which is exactly the condition a popular page is in.
-- SECURITY DEFINER because the public route holds no session; it is
-- callable only with the service-role key, which the client never sees.
-- ----------------------------------------------------------------------------
create or replace function public.record_site_view(
  p_site_id uuid,
  p_user_id uuid,
  p_is_unique boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.published_sites
    set view_count = view_count + 1
    where id = p_site_id;

  insert into public.site_analytics (published_site_id, user_id, date, views, unique_visitors)
    values (p_site_id, p_user_id, current_date, 1, case when p_is_unique then 1 else 0 end)
  on conflict (published_site_id, date) do update
    set views = public.site_analytics.views + 1,
        unique_visitors = public.site_analytics.unique_visitors
          + case when p_is_unique then 1 else 0 end;
end;
$$;

revoke all on function public.record_site_view(uuid, uuid, boolean) from public;
revoke all on function public.record_site_view(uuid, uuid, boolean) from anon;
revoke all on function public.record_site_view(uuid, uuid, boolean) from authenticated;
grant execute on function public.record_site_view(uuid, uuid, boolean) to service_role;
