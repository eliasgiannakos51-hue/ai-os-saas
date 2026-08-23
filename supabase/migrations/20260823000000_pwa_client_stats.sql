-- What the PWA is actually doing on real devices.
--
-- WHY THIS TABLE EXISTS. The question "should Ionexa be a native app?"
-- was asked and could not be answered, because nothing recorded the three
-- facts that decide it: how many people are on iOS (where Safari never
-- offers to install and web push needs an installed app), how many are
-- running installed rather than in a tab, and how many ever accepted
-- notifications. Without them the question gets re-asked every quarter
-- with the same empty hands.
--
-- ONE ROW PER (user, browser profile), not per session and not per visit.
-- The client mints a random id into localStorage and keeps it, so a person
-- who opens the app forty times is one row with a moving last_seen_at, and
-- a person on a phone and a laptop is two rows. Counting visits would
-- answer "how much do installed users use it", which is a different and
-- much less interesting question than "how many people installed it".
--
-- NOTHING IDENTIFYING IS STORED. Not the user agent string, not an IP, not
-- a fingerprint: the client resolves its own platform and browser family
-- into one of a handful of fixed words and sends those. A row says "an iOS
-- Safari, installed, push granted" — which is all the decision needs, and
-- is not enough to re-identify a device.

create table if not exists public.pwa_client_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Random, minted and kept by the browser. Not derived from anything
  -- about the device, so it cannot be recomputed or correlated elsewhere.
  client_id text not null,

  -- 'ios' | 'ipados' | 'android' | 'macos' | 'windows' | 'linux' | 'other'
  platform text not null,
  -- 'safari' | 'chromium' | 'firefox' | 'other'
  browser text not null,
  -- What the browser itself reports: 'standalone' | 'minimal-ui' |
  -- 'fullscreen' | 'window-controls-overlay' | 'browser'
  display_mode text not null,
  -- display_mode <> 'browser', stored rather than derived so a query can
  -- index it and so a future display mode does not silently drop out of
  -- the count.
  installed boolean not null default false,

  -- 'granted' | 'denied' | 'default' | 'unsupported'
  push_permission text not null default 'default',
  -- A live PushSubscription exists in this browser right now. Distinct
  -- from permission: a user can grant permission and never subscribe, and
  -- a subscription can be revoked by the push service without the
  -- permission changing.
  push_subscribed boolean not null default false,

  -- Which install surface this browser was shown, and what came of it.
  -- 'native' is Chrome's beforeinstallprompt; 'ios' is our own
  -- instructions, which is the only thing possible on iPhone.
  install_surface text,
  -- 'accepted' | 'dismissed' | null (shown, no answer yet)
  install_outcome text,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint pwa_client_stats_user_client_key unique (user_id, client_id),
  constraint pwa_client_stats_platform_check check (
    platform in ('ios', 'ipados', 'android', 'macos', 'windows', 'linux', 'other')
  ),
  constraint pwa_client_stats_browser_check check (
    browser in ('safari', 'chromium', 'firefox', 'other')
  ),
  constraint pwa_client_stats_display_mode_check check (
    display_mode in ('standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay', 'browser')
  ),
  constraint pwa_client_stats_push_permission_check check (
    push_permission in ('granted', 'denied', 'default', 'unsupported')
  ),
  constraint pwa_client_stats_install_surface_check check (
    install_surface is null or install_surface in ('native', 'ios')
  ),
  constraint pwa_client_stats_install_outcome_check check (
    install_outcome is null or install_outcome in ('accepted', 'dismissed')
  )
);

create index if not exists pwa_client_stats_user_idx
  on public.pwa_client_stats (user_id);
create index if not exists pwa_client_stats_last_seen_idx
  on public.pwa_client_stats (last_seen_at desc);

alter table public.pwa_client_stats enable row level security;

-- A user may read and write their OWN row and nothing else. The summary
-- below runs as the owner precisely so that reporting never needs a policy
-- that would let one account count another's devices.
drop policy if exists "pwa_client_stats_select_own" on public.pwa_client_stats;
create policy "pwa_client_stats_select_own"
  on public.pwa_client_stats for select
  using (auth.uid() = user_id);

drop policy if exists "pwa_client_stats_insert_own" on public.pwa_client_stats;
create policy "pwa_client_stats_insert_own"
  on public.pwa_client_stats for insert
  with check (auth.uid() = user_id);

drop policy if exists "pwa_client_stats_update_own" on public.pwa_client_stats;
create policy "pwa_client_stats_update_own"
  on public.pwa_client_stats for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists set_pwa_client_stats_updated_at on public.pwa_client_stats;
create trigger set_pwa_client_stats_updated_at
  before update on public.pwa_client_stats
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- The three percentages the "native or not" decision needs.
--
-- Returned as counts AND percentages: a percentage with no denominator is
-- how "80% of users are on iOS" turns out to mean four people. The window
-- is a parameter so the answer can be "in the last 30 days" rather than
-- "since the beginning of time", which for an adoption question are very
-- different numbers.
-- ---------------------------------------------------------------------
create or replace function public.pwa_adoption_summary(p_days integer default 30)
returns table (
  devices bigint,
  ios_devices bigint,
  ios_percent numeric,
  installed_devices bigint,
  installed_percent numeric,
  push_granted_devices bigint,
  push_granted_percent numeric,
  push_subscribed_devices bigint,
  push_subscribed_percent numeric,
  ios_installed_devices bigint,
  ios_installed_percent numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from public.pwa_client_stats
    where last_seen_at >= now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
  ),
  totals as (
    select
      count(*)::bigint as devices,
      count(*) filter (where platform in ('ios', 'ipados'))::bigint as ios_devices,
      count(*) filter (where installed)::bigint as installed_devices,
      count(*) filter (where push_permission = 'granted')::bigint as push_granted_devices,
      count(*) filter (where push_subscribed)::bigint as push_subscribed_devices,
      count(*) filter (where platform in ('ios', 'ipados') and installed)::bigint as ios_installed_devices
    from scoped
  )
  select
    devices,
    ios_devices,
    -- nullif, not a case: with no devices the honest answer is "no data",
    -- and 0% would read as "nobody is on iOS".
    round(100.0 * ios_devices / nullif(devices, 0), 1) as ios_percent,
    installed_devices,
    round(100.0 * installed_devices / nullif(devices, 0), 1) as installed_percent,
    push_granted_devices,
    round(100.0 * push_granted_devices / nullif(devices, 0), 1) as push_granted_percent,
    push_subscribed_devices,
    round(100.0 * push_subscribed_devices / nullif(devices, 0), 1) as push_subscribed_percent,
    ios_installed_devices,
    round(100.0 * ios_installed_devices / nullif(ios_devices, 0), 1) as ios_installed_percent
  from totals;
$$;

-- A SECURITY DEFINER function counts across every account, so no signed-in
-- user may call it. The System Health page reads it with the service-role
-- client, which is the only caller.
revoke all on function public.pwa_adoption_summary(integer) from public;
revoke all on function public.pwa_adoption_summary(integer) from anon;
revoke all on function public.pwa_adoption_summary(integer) from authenticated;
grant execute on function public.pwa_adoption_summary(integer) to service_role;
