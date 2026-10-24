-- ---------------------------------------------------------------------------
-- «ΕΙΔΟΠΟΙΗΣΕ ΜΕ ΟΤΑΝ ΑΝΟΙΞΕΙ» (the final All tools grid, Μέρος §3,
-- 2026-10-24): one row per person who pressed "Notify me" on a tool that
-- is not ready yet (src/lib/nav/all-tools.ts, `ready: false`).
--
-- ONE ROW PER PERSON PER TOOL: a second press is a no-op (unique
-- constraint), not a second row.
--
-- WRITTEN BY THE SERVER ONLY: src/app/api/tools/notify/route.ts is the
-- one writer. The account may insert its own subscription (the whole
-- point of the button) and read and delete its own rows; it may not
-- update one, which would let a row claim a different tool than the one
-- the person pressed.
--
-- HOW A SUBSCRIBER IS ACTUALLY NOTIFIED: there is no cron here. When a
-- tool's `ready` flips to true in lib/nav/all-tools.ts, the same commit
-- runs `node scripts/notify-tool-ready.mjs <toolKey>` once, which inserts
-- a user_notifications row for every subscriber of that tool and deletes
-- their subscriptions. Until that script exists and is run, a
-- subscription just sits here — which is honest: no code anywhere claims
-- to send anything before that step.
--
-- Erased with the account: user_id cascades from auth.users.
-- Idempotent: if not exists, drop policy if exists.
-- How to check it after running: npm run db:pending; /api/health lists
-- tool_notify_subscriptions.
-- How to undo: drop table if exists public.tool_notify_subscriptions;
--   (removes every stored "notify me" press, and nothing else: no other
--   table is touched by this migration).
-- ---------------------------------------------------------------------------

create table if not exists public.tool_notify_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_key text not null,
  created_at timestamptz not null default now(),
  constraint tool_notify_subscriptions_one_per_tool unique (user_id, tool_key)
);

create index if not exists tool_notify_subscriptions_tool_idx
  on public.tool_notify_subscriptions (tool_key);

alter table public.tool_notify_subscriptions enable row level security;

drop policy if exists "select_own_tool_notify_subscriptions" on public.tool_notify_subscriptions;
create policy "select_own_tool_notify_subscriptions" on public.tool_notify_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_tool_notify_subscriptions" on public.tool_notify_subscriptions;
create policy "insert_own_tool_notify_subscriptions" on public.tool_notify_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete_own_tool_notify_subscriptions" on public.tool_notify_subscriptions;
create policy "delete_own_tool_notify_subscriptions" on public.tool_notify_subscriptions
  for delete using (auth.uid() = user_id);

revoke update on public.tool_notify_subscriptions from anon, authenticated;

comment on table public.tool_notify_subscriptions is
  'Who pressed "Notify me" on a not-ready All tools tile, and which tool. Read/inserted/deleted by the account itself through api/tools/notify; never updated by the client. Firing the notification is scripts/notify-tool-ready.mjs, run by hand when a tool''s ready flips to true.';
