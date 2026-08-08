-- Web Push subscriptions + per-type opt-in.
--
-- One row per (user, browser endpoint): the same account on a phone and a
-- laptop is two rows, and each can be revoked independently — which is
-- what actually happens when a browser rotates a subscription. The
-- endpoint is the natural key, not the user, and it is globally unique
-- (it is a URL minted by the push service), so the unique constraint sits
-- there.
--
-- Per-type opt-in lives on the row rather than in a separate preferences
-- table because a push permission is granted per DEVICE: a user may want
-- agent results on their phone and nothing on their work laptop. Storing
-- the choice next to the endpoint is what makes that expressible.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  -- The two keys from PushSubscription.getKey(), base64url encoded.
  p256dh text not null,
  auth text not null,
  user_agent text,
  -- Per-type opt-in. Default true: the user has just granted browser
  -- permission at this point, so the meaningful choice is which types to
  -- turn OFF, not which to turn on.
  notify_agent_results boolean not null default true,
  notify_mission_reminders boolean not null default true,
  notify_low_credits boolean not null default true,
  notify_collaboration boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Set when the push service reports the subscription is gone (404/410).
  -- Kept rather than deleted so a later re-subscribe from the same
  -- browser can be told apart from a first-ever one in the logs.
  revoked_at timestamptz
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id)
  where revoked_at is null;

alter table public.push_subscriptions enable row level security;

-- The user owns their own subscriptions and nothing else. Sending is done
-- by the service-role client (which bypasses RLS), so there is
-- deliberately no policy granting anyone read access to another user's
-- endpoint — a push endpoint is a capability URL: anyone holding it can
-- push to that browser.
drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

-- Keep updated_at honest, using the trigger function this schema already
-- defines for every other table.
drop trigger if exists set_push_subscriptions_updated_at on public.push_subscriptions;
create trigger set_push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();
