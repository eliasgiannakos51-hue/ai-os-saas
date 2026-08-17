-- An agent's result can go somewhere other than email.
--
-- WHAT WAS THERE. delivery_method allowed 'email' and 'slack'. Slack was
-- reachable through the API but appeared nowhere in the agent editor, so
-- in practice every agent anyone could create emailed. For a product whose
-- promise is "it works while you are not looking", the one destination is
-- the inbox people already ignore.
--
-- Four channels are added: Telegram, Discord, and in-app — plus Slack,
-- which existed and is now actually selectable.
--
-- THE RULE THE SCHEMA ENFORCES: an agent delivers only where its OWNER
-- established. That is not a policy sentence, it is why the two new
-- credential channels do not put their destination in user_agents at all:
--
--   telegram — delivery_target holds the chat id, but the BOT TOKEN lives
--              in user_delivery_channels, encrypted, one row per user. An
--              agent cannot name a bot it was not given.
--   discord  — delivery_target holds the constant 'discord:webhook'. The
--              URL is a bearer credential: whoever holds it can post to
--              that channel forever. Copying it into every agent row would
--              also copy it into the run history and the GDPR export.
--   in_app   — delivery_target holds 'in_app:self'. There is no address to
--              get wrong.
--
-- Idempotent: safe to run more than once.

-- ----------------------------------------------------------------------
-- 1. The constraint.
-- ----------------------------------------------------------------------
-- Replaced rather than dropped: a row must still never hold a delivery
-- method nothing can honour. Every existing row is 'email' or 'slack' and
-- stays valid, so this widens without rewriting anything.
alter table public.user_agents
  drop constraint if exists user_agents_delivery_method_check;
alter table public.user_agents
  add constraint user_agents_delivery_method_check
  check (delivery_method in ('email', 'slack', 'telegram', 'discord', 'in_app'));

-- ----------------------------------------------------------------------
-- 2. Where the credentials live.
-- ----------------------------------------------------------------------
-- One row per (user, channel). A second save replaces the first, because
-- "my Telegram bot" is a single thing a person has, not a collection.
create table if not exists public.user_delivery_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Only the channels that need a stored secret. Slack is an OAuth
  -- connection and lives in user_integrations; email and in-app need
  -- nothing at all.
  channel text not null check (channel in ('telegram', 'discord')),

  -- ENCRYPTED, with the key that is not in this database
  -- (lib/integrations/crypto.ts, INTEGRATION_ENCRYPTION_KEY). A Telegram
  -- bot token lets the holder speak AS the user's bot; a Discord webhook
  -- URL lets them post into the user's server. Both are keys to a
  -- different building, exactly like the OAuth tokens next door, and the
  -- column name says so to anyone about to write to it.
  secret_encrypted text not null,

  -- The non-secret half: Telegram's chat id. Empty for Discord, whose
  -- destination is inside the encrypted URL.
  target text not null default '',

  -- What the user is shown instead of the secret: "1234••••wxyz".
  secret_hint text not null default '',

  -- Whether the credential has been proved to work by actually calling
  -- the platform, and when. A token that was accepted by a regex and
  -- never tried is a delivery that fails silently at 08:00.
  verified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_delivery_channels_user_channel_key
  on public.user_delivery_channels (user_id, channel);

alter table public.user_delivery_channels enable row level security;

-- The user may READ their own rows (the ciphertext is useless without the
-- key, and being able to see that a channel is configured is the point)
-- and DELETE them, because disconnecting must not depend on a server
-- round-trip succeeding. Writes go through the API, which encrypts.
drop policy if exists "user_delivery_channels_select_own" on public.user_delivery_channels;
create policy "user_delivery_channels_select_own" on public.user_delivery_channels
  for select using (auth.uid() = user_id);

drop policy if exists "user_delivery_channels_delete_own" on public.user_delivery_channels;
create policy "user_delivery_channels_delete_own" on public.user_delivery_channels
  for delete using (auth.uid() = user_id);

comment on table public.user_delivery_channels is
  'Per-user credentials for the delivery channels that need one. The secret is encrypted with INTEGRATION_ENCRYPTION_KEY, which is not in this database. An agent can only deliver to a channel that has a row here for its owner.';
comment on column public.user_delivery_channels.secret_encrypted is
  'Telegram bot token or Discord webhook URL. Encrypted — a plaintext write here is a breach, not a shortcut.';

-- ----------------------------------------------------------------------
-- 3. In-app notifications, which had a bell and nothing behind it.
-- ----------------------------------------------------------------------
-- The dashboard's notification bell has always rendered "No notifications"
-- from a hard-coded string: there was no table, no query and no way for
-- anything to ever put something in it. A UI element that can only ever
-- say one thing is a promise the product does not keep, and it is also
-- the obvious home for an agent result that should not leave the product.
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- What produced it. Text rather than an enum so a sixth source does not
  -- need a migration — the same decision ai_jobs.kind made.
  source text not null default 'agent',

  title text not null,
  body text not null default '',
  -- Where "open it" goes. Relative paths only; the API refuses anything
  -- else, because a notification is a link the user is invited to trust.
  url text,

  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- The list query: "my newest notifications", and the unread count.
create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);
create index if not exists user_notifications_unread_idx
  on public.user_notifications (user_id)
  where read_at is null;

alter table public.user_notifications enable row level security;

drop policy if exists "user_notifications_select_own" on public.user_notifications;
create policy "user_notifications_select_own" on public.user_notifications
  for select using (auth.uid() = user_id);

-- Marking one read is the user's own action on their own row. There is no
-- INSERT policy: a user who could insert could write themselves a
-- notification claiming to be from us, with a link.
drop policy if exists "user_notifications_update_own" on public.user_notifications;
create policy "user_notifications_update_own" on public.user_notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- AND read_at IS THE ONLY COLUMN THEY MAY CHANGE — which the policy above
-- does NOT say, because an RLS policy cannot. It decides WHICH ROWS an
-- UPDATE may touch, never which columns.
--
-- Measured on PostgreSQL 16 with that policy alone: `update
-- user_notifications set url = 'https://evil.test', title = 'Ionexa
-- Security'` as `authenticated` succeeded on the user's own row. That is
-- the same outcome the missing INSERT policy exists to prevent — a
-- notification that looks like it came from us, carrying a link — reached
-- one step later, by editing a real one instead of writing a new one.
-- Self-targeted, so not a route to another account, but the comment above
-- claimed a restriction that was not there.
--
-- A column-level grant is the mechanism that can express it. With this,
-- marking read still works and rewriting the title or the URL is
-- "permission denied for table user_notifications".
revoke update on public.user_notifications from anon, authenticated;
grant update (read_at) on public.user_notifications to authenticated;

drop policy if exists "user_notifications_delete_own" on public.user_notifications;
create policy "user_notifications_delete_own" on public.user_notifications
  for delete using (auth.uid() = user_id);

comment on table public.user_notifications is
  'In-app notifications. Written by the service role only (an agent delivering in-app); read, marked read and deleted by the owner.';
