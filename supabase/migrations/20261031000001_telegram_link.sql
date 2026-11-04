-- ---------------------------------------------------------------------------
-- IONEXA IN TELEGRAM (the owner's "24. IONEXA ΣΤΟ TELEGRAM", κομμάτι 1):
-- which Telegram chat is allowed to COMMAND an account, and the short-lived
-- codes that establish that.
--
-- How to undo: drop table if exists public.telegram_pairings;
--              drop table if exists public.telegram_links;
--   (every connected chat stops being able to command Ionexa and has to be
--   connected again from /dashboard/integrations; notifications are NOT
--   affected, because they live in public.notification_channels and are a
--   different grant — see "TWO GRANTS" below. Nothing of the person's own
--   work is in either table, so nothing of theirs is lost.)
--
-- TWO GRANTS, DELIBERATELY NOT ONE TABLE. public.notification_channels
-- (20260901000000_notifications.sql) already holds a Telegram chat id per
-- account, and it would have been one column cheaper to add a boolean to
-- it. It is a different grant and it is the larger one:
--
--   notification_channels   "Ionexa may SEND to this chat."  A leak there
--                           means somebody receives my alerts.
--   telegram_links          "This chat may TELL Ionexa what to do."  A leak
--                           here means somebody spends my credits, reads
--                           what I have made and publishes as me.
--
-- A person who ticked "notify me on Telegram" months ago did not consent to
-- the second thing, and a schema where one row means both makes that
-- consent impossible to ask for separately. Two tables, two consents, two
-- disconnects.
--
-- WHY THE CHAT ID IS KEPT TWICE, in two different shapes. The webhook
-- (κομμάτι 2) receives a chat id from Telegram and has to answer "whose
-- account is this?" — a lookup BY chat id. notification_channels cannot do
-- that: its target is AES-GCM ciphertext with a fresh iv, so the same chat
-- id encrypts differently every time and is unsearchable by design. So:
--
--   chat_id_fingerprint   keyed HMAC-SHA256 (src/lib/telegram/identity.ts).
--                         Deterministic, unique, indexed: the webhook's
--                         lookup. KEYED, NOT A PLAIN DIGEST, and that is
--                         the whole point of the column's existence rather
--                         than a convenience: a Telegram user id is a
--                         decimal integer below about 2^34, so the entire
--                         space can be hashed in minutes on a laptop. A
--                         bare sha256(chat_id) in a leaked backup is the
--                         chat id. The HMAC key is derived from
--                         INTEGRATION_ENCRYPTION_KEY, which is not in this
--                         database, so a copy of this table is a column of
--                         values that match nothing.
--   chat_id_encrypted     the same id through lib/integrations/crypto.ts,
--                         the one encryption path in the product, because
--                         sending a message needs the id back and an HMAC
--                         does not come back.
--
-- ONE CHAT COMMANDS AT MOST ONE ACCOUNT, and that is the unique index on
-- chat_id_fingerprint, not a check in a route. Without it, a chat already
-- linked to account A that presents account B's code would end up able to
-- command both, and whichever row the webhook happened to read first would
-- decide whose credits got spent. A constraint refuses that in the
-- database; a route can be rewritten.
--
-- ONE ACCOUNT HAS AT MOST ONE CHAT: user_id is the primary key. The
-- owner's own wording is "ποιο chat ανήκει σε ποιον χρήστη" — singular —
-- and a single place that can command an account is a smaller thing to
-- audit, to show on one line, and to disconnect with one button.
--
-- PRIVATE CHATS ONLY, NEVER GROUPS: the owner's «Μόνο ιδιωτικές
-- συνομιλίες, όχι ομάδες». Enforced in κομμάτι 2's webhook, where the
-- chat type arrives; there is nothing in this schema to enforce it with,
-- and a column repeating the claim would be a comment pretending to be a
-- constraint. chat_kind is stored so the claim is at least AUDITABLE
-- after the fact, with a CHECK that the only value ever written is
-- 'private'.
--
-- WRITTEN BY THE SERVER ONLY, like every table since
-- 20261014000000_server_written_tables.sql. The account may read its own
-- link and delete it; it may not insert or update one, because a browser
-- that could insert could point this at a chat the person does not hold.
--
-- Erased with the account: user_id cascades from auth.users.
-- Idempotent: if not exists, drop policy if exists.
-- ---------------------------------------------------------------------------

create table if not exists public.telegram_links (
  -- The primary key, not just a foreign key: one chat per account.
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Keyed HMAC, hex. Unique: see "ONE CHAT COMMANDS AT MOST ONE ACCOUNT".
  chat_id_fingerprint text not null unique,

  -- Ciphertext, v1.<iv>.<tag>.<ct>, base64url, with the user id bound in as
  -- GCM additional authenticated data — so a value moved between rows fails
  -- to decrypt instead of quietly working for the wrong person.
  chat_id_encrypted text not null,

  -- WHAT THE SCREEN SHOWS, so that a person can tell at a glance whether
  -- the connected chat is theirs. Both nullable: a Telegram account need
  -- not have a username, and a name can be absent. Bounded because they
  -- arrive from Telegram, which is to say from whoever opened the chat.
  telegram_username text check (telegram_username is null or length(telegram_username) <= 32),
  telegram_name text check (telegram_name is null or length(telegram_name) <= 120),

  -- 'private' is the only value this product ever writes (see "PRIVATE
  -- CHATS ONLY"). The CHECK is here so that a future route that forgets
  -- the rule fails loudly instead of linking a group.
  chat_kind text not null default 'private' check (chat_kind = 'private'),

  created_at timestamptz not null default now(),
  -- Last time this chat sent something Ionexa acted on. Null until it
  -- does. This is the column "Recent activity" counts from; the activity
  -- LIST itself is κομμάτι 2's, because there are no messages to list
  -- until a webhook exists to receive them.
  last_used_at timestamptz
);

alter table public.telegram_links enable row level security;

drop policy if exists "select_own_telegram_link" on public.telegram_links;
create policy "select_own_telegram_link" on public.telegram_links
  for select using (auth.uid() = user_id);

-- Disconnecting is a delete, not a flag: once the row is gone the chat's
-- fingerprint matches nothing, so the next message from it is a message
-- from a stranger, with no second check to forget.
drop policy if exists "delete_own_telegram_link" on public.telegram_links;
create policy "delete_own_telegram_link" on public.telegram_links
  for delete using (auth.uid() = user_id);

grant select, delete on public.telegram_links to authenticated;
revoke insert, update on public.telegram_links from anon, authenticated;
revoke all on public.telegram_links from anon;

comment on table public.telegram_links is
  'Which Telegram chat may command an account. A DIFFERENT and larger grant than notification_channels, which only says where to send - see the migration header. One row per account; chat_id_fingerprint unique so one chat commands at most one account.';

-- ---------------------------------------------------------------------------
-- The ten-minute codes
-- ---------------------------------------------------------------------------
-- THE MIRROR OF iowork's PAIRING, AND THE MIRROR IS THE SAFER DIRECTION.
-- In iowork (20261031000000_iowork_devices.sql) the code is minted by a
-- computer with no account — api/iowork/pair has no session by design —
-- so a stranger can mint one and phish a real account holder into typing
-- it. Here the code is minted by a SIGNED-IN person, which is why user_id
-- below is NOT NULL from the moment the row is created: nobody can make a
-- code that points at somebody else's account.
--
-- The risk runs the other way, and it is why this is still a two-step
-- flow. The code travels out of the browser, through a human, into a chat;
-- it can be forwarded, screenshotted or asked for ("support needs your
-- link code"). So presenting a valid code does NOT link anything. It fills
-- in the chat columns below and stops; the link is created only when the
-- SIGNED-IN person sees who is asking and presses a second button
-- (src/app/api/telegram/link/route.ts, action "confirm"). The leaked code
-- alone is not enough, because the confirming screen is one the attacker
-- cannot reach.
--
-- NO POLICY AT ALL, deliberately, the same as iowork_pairings: only the
-- service role reads or writes this table, and RLS with no policy is the
-- tightest statement of that. A pending code must not be readable from a
-- browser even by its own owner, because "readable from a browser" is how
-- a code gets harvested before it is used.
--
-- How to undo: see the header (dropped together with telegram_links).
create table if not exists public.telegram_pairings (
  id uuid primary key default gen_random_uuid(),

  -- Eight characters from PAIRING_ALPHABET (src/lib/pairing-code.ts).
  code text not null unique,

  -- NOT NULL, unlike iowork_pairings.user_id: see the mirror note above.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Filled by the webhook in κομμάτι 2 when a chat presents this code.
  -- Null means "nobody has presented it yet", which is what the Connect
  -- page is waiting for.
  chat_id_fingerprint text,
  chat_id_encrypted text,
  telegram_username text check (telegram_username is null or length(telegram_username) <= 32),
  telegram_name text check (telegram_name is null or length(telegram_name) <= 120),
  presented_at timestamptz,

  -- Set by the signed-in confirm. A row with this set has already done its
  -- job and is refused if presented again: single use, checked by a
  -- compare-and-swap on this column rather than by reading it first.
  confirmed_at timestamptz,

  created_at timestamptz not null default now()
);

-- The webhook looks a pairing up by its code; the sweep finds old ones by
-- age; the Connect page polls its own newest pairing by user.
create index if not exists telegram_pairings_created_idx on public.telegram_pairings (created_at);
create index if not exists telegram_pairings_user_idx on public.telegram_pairings (user_id, created_at desc);

alter table public.telegram_pairings enable row level security;

revoke all on public.telegram_pairings from anon, authenticated;

comment on table public.telegram_pairings is
  'Pending Telegram connections, ten minutes each (TELEGRAM_PAIRING_TTL_MINUTES in src/lib/telegram/pairing.ts). RLS on with no policy on purpose: only the service role touches it, so a pending code cannot be harvested from the browser. Presenting a code does not link - a signed-in confirm does.';
