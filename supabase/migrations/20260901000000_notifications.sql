-- ============================================================================
-- NOTIFICATIONS THAT ARE WORTH SENDING (V4 #18)
-- ============================================================================
--
-- The in-app half already exists: public.user_notifications, added by
-- 20260814_agent_delivery_channels.sql, with service-role-only writes
-- because a user who could insert could write themselves a message in our
-- voice carrying a link of their choosing. This migration adds the four
-- things that turn it into a notification SYSTEM:
--
--   PER-TYPE, PER-CHANNEL PREFERENCES. The brief's "ο χρήστης επιλέγει
--   ΑΝΑ ΤΥΠΟ πού θέλει" — one row per (user, type), holding the channels
--   that type may use. Not a column per type: seven types times four
--   channels is twenty-eight booleans and a migration for every new type.
--
--   QUIET HOURS, which DEFER rather than drop. deliver_at on the
--   notification row is the whole mechanism; see lib/notify/quiet-hours.ts
--   for why discarding would be the wrong reading of the setting.
--
--   THE CHAT TARGETS. A Telegram chat id and a Discord webhook are both
--   credentials — anybody holding the webhook can post into that channel
--   — so they are CIPHERTEXT through the same AES-256-GCM module the
--   OAuth tokens use, never plaintext.
--
--   THE MEASUREMENT. notification_events records sent/opened/clicked per
--   type and channel, so "if click rate is under 10% the type is not
--   worth sending" is a query rather than an opinion.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

-- ----------------------------------------------------------------------
-- 1. user_notifications gains what the system needs
-- ----------------------------------------------------------------------
-- All nullable/defaulted: there are rows in this table already, written
-- by the agent delivery path, and a NOT NULL would either fail the
-- migration or invent a type for them.
alter table public.user_notifications add column if not exists type text;
-- Set when several collapsed into one (rule 2). 1 means "just this one".
alter table public.user_notifications add column if not exists group_count int not null default 1;
alter table public.user_notifications add column if not exists group_key text;
-- WHEN IT MAY BE DELIVERED, which is not when it was created. Quiet hours
-- move this forward; the in-app row itself is visible immediately,
-- because a bell filling up overnight interrupts nobody.
alter table public.user_notifications add column if not exists deliver_at timestamptz;
-- Rule 5's measurement: did one click actually happen.
alter table public.user_notifications add column if not exists clicked_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_notifications_group_count_positive') then
    alter table public.user_notifications
      add constraint user_notifications_group_count_positive check (group_count >= 1);
  end if;
end $$;

-- The dispatcher's own query: what is due to go out.
create index if not exists user_notifications_deliver_idx
  on public.user_notifications (deliver_at)
  where deliver_at is not null and read_at is null;
create index if not exists user_notifications_type_idx
  on public.user_notifications (user_id, type, created_at desc)
  where type is not null;

-- ----------------------------------------------------------------------
-- 2. notification_settings — one row per user
-- ----------------------------------------------------------------------
create table if not exists public.notification_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Minutes since local midnight, 0..1439. Null means no quiet hours.
  --
  -- START MAY BE GREATER THAN END, and that is the normal case: 22:00 to
  -- 08:00 is 1320 to 480. Any CHECK asserting start < end would reject
  -- the setting almost everybody actually wants.
  quiet_start_minute int,
  quiet_end_minute int,

  -- Minutes to add to UTC for this user's local time. An offset rather
  -- than an IANA zone name because lib/notify/quiet-hours.ts is a pure
  -- module the build gate loads, and shipping a timezone database into it
  -- to answer "is it 3am for them" is not a trade worth making.
  utc_offset_minutes int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint notification_settings_quiet_start_range
    check (quiet_start_minute is null or (quiet_start_minute >= 0 and quiet_start_minute <= 1439)),
  constraint notification_settings_quiet_end_range
    check (quiet_end_minute is null or (quiet_end_minute >= 0 and quiet_end_minute <= 1439)),
  -- Both or neither. One half of a window is a setting that cannot mean
  -- anything, and the code would have to invent the other end.
  constraint notification_settings_quiet_both_or_neither
    check ((quiet_start_minute is null) = (quiet_end_minute is null)),
  constraint notification_settings_offset_range
    check (utc_offset_minutes between -840 and 840)
);

alter table public.notification_settings enable row level security;

drop policy if exists notification_settings_select_own on public.notification_settings;
create policy notification_settings_select_own
  on public.notification_settings for select using (auth.uid() = user_id);
drop policy if exists notification_settings_insert_own on public.notification_settings;
create policy notification_settings_insert_own
  on public.notification_settings for insert with check (auth.uid() = user_id);
drop policy if exists notification_settings_update_own on public.notification_settings;
create policy notification_settings_update_own
  on public.notification_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A POLICY WITHOUT A GRANT IS A LOCKED DOOR. Postgres checks table
-- privileges before row policies, so a table with perfect RLS and no
-- GRANT answers every query with "permission denied", including the
-- owner's. This cost a whole feature one migration ago.
grant select, insert, update on public.notification_settings to authenticated;
revoke all on public.notification_settings from anon;

drop trigger if exists set_updated_at on public.notification_settings;
create trigger set_updated_at before update on public.notification_settings
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------
-- 3. notification_preferences — one row per (user, type)
-- ----------------------------------------------------------------------
create table if not exists public.notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Matches NOTIFICATION_TYPES in lib/notify/types.ts. Text with a CHECK
  -- rather than an enum so adding an eighth type is one migration line
  -- instead of an ALTER TYPE that cannot run inside a transaction.
  type text not null check (type in (
    'agent_completed', 'website_published', 'research_ready', 'credits_low',
    'payment_failed', 'team_member_joined', 'error_needs_attention'
  )),

  -- Rule 4: opt out of a whole type.
  enabled boolean not null default true,

  -- Where this type may go. An empty array with enabled = true means
  -- "keep it, send it nowhere but the bell" — which is a real thing
  -- somebody wants and is different from switching the type off.
  channels text[] not null default '{}',

  updated_at timestamptz not null default now(),

  primary key (user_id, type),

  -- Only channels the code knows. A typo in an array element would
  -- otherwise sit there sending nothing, forever, silently.
  constraint notification_preferences_known_channels
    check (channels <@ array['in_app', 'email', 'telegram', 'discord']::text[])
);

create index if not exists notification_preferences_user_idx
  on public.notification_preferences (user_id);

alter table public.notification_preferences enable row level security;

drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own
  on public.notification_preferences for select using (auth.uid() = user_id);
drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own
  on public.notification_preferences for insert with check (auth.uid() = user_id);
drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own
  on public.notification_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists notification_preferences_delete_own on public.notification_preferences;
create policy notification_preferences_delete_own
  on public.notification_preferences for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.notification_preferences to authenticated;
revoke all on public.notification_preferences from anon;

drop trigger if exists set_updated_at on public.notification_preferences;
create trigger set_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------
-- 4. notification_channels — where Telegram and Discord actually go
-- ----------------------------------------------------------------------
-- A Discord webhook URL is a CREDENTIAL: anybody holding it can post into
-- that channel as us, forever, with no further authentication. A Telegram
-- chat id is less dangerous but is still a pointer at a private
-- conversation. Both are ciphertext through lib/integrations/crypto.ts —
-- the same AES-256-GCM path the OAuth tokens use, because one encryption
-- path means one place for a key to be mishandled.
create table if not exists public.notification_channels (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('telegram', 'discord')),

  -- CIPHERTEXT. Format v1.<iv>.<tag>.<ciphertext>, base64url, with the
  -- user id bound in as GCM additional authenticated data — so a value
  -- moved between rows fails to decrypt instead of quietly working.
  target_encrypted text not null,

  -- Non-sensitive, for the settings screen: "#alerts", "@yourname". Never
  -- the webhook, never the chat id.
  label text,

  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, kind)
);

alter table public.notification_channels enable row level security;

drop policy if exists notification_channels_select_own on public.notification_channels;
create policy notification_channels_select_own
  on public.notification_channels for select using (auth.uid() = user_id);
-- The user may DISCONNECT. They may not write one: the row is created by
-- the server after the target has been verified with a test message, and
-- a user who could insert could point our sender at somebody else's
-- Discord channel.
drop policy if exists notification_channels_delete_own on public.notification_channels;
create policy notification_channels_delete_own
  on public.notification_channels for delete using (auth.uid() = user_id);

grant select, delete on public.notification_channels to authenticated;
revoke insert, update on public.notification_channels from authenticated;
revoke all on public.notification_channels from anon;

drop trigger if exists set_updated_at on public.notification_channels;
create trigger set_updated_at before update on public.notification_channels
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------
-- 5. notification_events — the measurement
-- ----------------------------------------------------------------------
-- One row per thing that happened to a notification. Append-only.
--
-- WHY NOT COLUMNS ON user_notifications: an email and an in-app record of
-- the same notification are delivered to different places and can be
-- opened independently, so "opened" is not one fact. And a rate needs a
-- denominator that survives the notification being deleted.
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  notification_id uuid references public.user_notifications(id) on delete set null,

  type text not null,
  channel text not null check (channel in ('in_app', 'email', 'telegram', 'discord')),
  event text not null check (event in ('sent', 'opened', 'clicked', 'suppressed')),

  -- Why it was suppressed, when it was: "the agent produced nothing",
  -- "quiet hours", "the user turned this type off". Rule 1 is only
  -- checkable if the refusals are counted too.
  reason text,

  at timestamptz not null default now()
);

create index if not exists notification_events_rate_idx
  on public.notification_events (type, channel, event, at desc);
create index if not exists notification_events_user_idx
  on public.notification_events (user_id, at desc);

alter table public.notification_events enable row level security;

-- The owner may read their own. Writes are service-role only: a user who
-- could insert could inflate the click rate of a type and change what the
-- product decides is worth sending.
drop policy if exists notification_events_select_own on public.notification_events;
create policy notification_events_select_own
  on public.notification_events for select using (auth.uid() = user_id);

grant select on public.notification_events to authenticated;
revoke insert, update, delete on public.notification_events from authenticated;
revoke all on public.notification_events from anon;
