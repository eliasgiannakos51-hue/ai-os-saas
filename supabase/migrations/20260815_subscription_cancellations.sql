-- Exit survey answers for self-service cancellation.
--
-- IDEMPOTENT. Safe to run more than once: every statement is guarded, and
-- there is no DROP, TRUNCATE or unqualified DELETE anywhere in this file.
--
-- The survey is OPTIONAL and SKIPPABLE. A row appears here only when the
-- user chose a reason or typed something; cancelling without answering
-- writes nothing at all, which is why every column but user_id is
-- nullable and why nothing in the cancellation path reads this table back.

create table if not exists public.subscription_cancellations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The tier they were on when they left. Denormalised on purpose: the
  -- user's metadata will say "free" a month later, and the whole point of
  -- this row is to know which plan people leave from.
  plan_tier text,
  -- One of the four fixed options, or null when only free text was given.
  reason text,
  note text,
  created_at timestamptz not null default now()
);

alter table public.subscription_cancellations
  add column if not exists plan_tier text;
alter table public.subscription_cancellations
  add column if not exists reason text;
alter table public.subscription_cancellations
  add column if not exists note text;
alter table public.subscription_cancellations
  add column if not exists created_at timestamptz not null default now();

-- Only the four options the UI offers, or nothing. A constraint rather
-- than trust in the route: the route validates too, but a second writer
-- (an admin script, a backfill) would not.
do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'subscription_cancellations_reason_check'
       and conrelid = 'public.subscription_cancellations'::regclass
  ) then
    alter table public.subscription_cancellations
      add constraint subscription_cancellations_reason_check
      check (reason is null or reason in (
        'too_expensive', 'missing_feature', 'not_using', 'found_alternative'
      ));
  end if;
end
$constraint$;

create index if not exists subscription_cancellations_created_at_idx
  on public.subscription_cancellations (created_at desc);

alter table public.subscription_cancellations enable row level security;

-- The user may read their own answers; nobody may write through the anon
-- or authenticated key. The insert happens with the service role from
-- api/billing/cancel, so a client cannot forge a cancellation record for
-- somebody else, and cannot rewrite their own after the fact.
do $policies$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'subscription_cancellations'
       and policyname = 'select_own_subscription_cancellations'
  ) then
    create policy "select_own_subscription_cancellations"
      on public.subscription_cancellations
      for select
      using (auth.uid() = user_id);
  end if;
end
$policies$;
