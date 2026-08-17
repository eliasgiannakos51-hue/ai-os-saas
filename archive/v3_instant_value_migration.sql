-- ============================================================================
-- V3 — Task 16: Instant Value on Day One.
--
-- Standalone, additive, idempotent. Safe to run on a project that already
-- has supabase_full_project_backup.sql applied.
--
-- THE ROOT PROBLEM THIS FIXES FIRST.
--
-- The headline promise of this feature is an insight like "your three
-- worst trades were all Monday morning". That sentence is impossible to
-- produce from this schema as it stood, and the reason is not the
-- analysis — it is the DATA MODEL. Every module table records only
-- `created_at`, the moment the row was written. Import 400 trades from a
-- CSV and all 400 share one timestamp, to the second. Every
-- time-of-week, month-over-month or trend pattern is then not merely
-- hard to find: it does not exist in the data at all, and any system
-- that reported one would be inventing it.
--
-- So `occurred_at` is added to the three tables where a real-world date
-- is the point of the row — when the trade was taken, when the money
-- moved, when the lead arrived. It is NULLABLE and nothing is
-- backfilled: an existing row genuinely does not know when it happened,
-- and writing `created_at` into it would be manufacturing a fact. Every
-- detector treats a null `occurred_at` as "not datable" and excludes it
-- from time-based analysis rather than guessing.
--
-- `finance_entries.counterparty` exists for the same reason. "40% of
-- your revenue comes from two clients" needs to know which client; a
-- free-text description is where a bookkeeping CSV puts a memo, not
-- reliably a name.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Real-world dates, and who the money was with.
-- ----------------------------------------------------------------------------
alter table public.trades add column if not exists occurred_at timestamptz;
alter table public.finance_entries add column if not exists occurred_at timestamptz;
alter table public.leads add column if not exists occurred_at timestamptz;

-- The counterparty: the client who paid, or the supplier who was paid.
alter table public.finance_entries add column if not exists counterparty text;

-- Partial indexes: the detectors only ever scan datable rows, and a row
-- with no occurred_at is excluded by every one of them.
create index if not exists trades_user_occurred_idx
  on public.trades (user_id, occurred_at)
  where occurred_at is not null;

create index if not exists finance_entries_user_occurred_idx
  on public.finance_entries (user_id, occurred_at)
  where occurred_at is not null;

create index if not exists finance_entries_user_counterparty_idx
  on public.finance_entries (user_id, counterparty)
  where counterparty is not null;

create index if not exists leads_user_occurred_idx
  on public.leads (user_id, occurred_at)
  where occurred_at is not null;

-- ----------------------------------------------------------------------------
-- user_imports — one row per import, whatever the source.
--
-- Exists so that "what did this thing put in my account, and can I undo
-- it" is answerable. An import writes into a dozen module tables at
-- once; without a record of which rows came from which import, an
-- account that imported the wrong file has no way back except deleting
-- rows by hand.
-- ----------------------------------------------------------------------------
create table if not exists public.user_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  --   csv       — a spreadsheet the user uploaded
  --   paste     — free text the user pasted
  --   quick_add — the short question flow
  --   gmail | google_drive — pulled through a V3 Task 3 integration
  source text not null check (source in ('csv', 'paste', 'quick_add', 'gmail', 'google_drive')),

  -- Display only, sanitised. Never used to build a path.
  filename text,
  rows_imported integer not null default 0,
  rows_rejected integer not null default 0,
  -- { "<table>": <count> } — what landed where.
  modules jsonb not null default '{}'::jsonb,
  -- The column mapping that was actually applied, so a wrong import is
  -- explainable rather than mysterious.
  mapping jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_imports_user_created_idx
  on public.user_imports (user_id, created_at desc);

alter table public.user_imports enable row level security;

drop policy if exists "select_own_user_imports" on public.user_imports;
create policy "select_own_user_imports" on public.user_imports
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_imports" on public.user_imports;
create policy "insert_own_user_imports" on public.user_imports
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete_own_user_imports" on public.user_imports;
create policy "delete_own_user_imports" on public.user_imports
  for delete using (auth.uid() = user_id);

-- Every imported row carries the import it came from, so "undo this
-- import" is one delete per table rather than a guess based on
-- timestamps. Nullable: rows created by hand have no import.
alter table public.ideas            add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.competitors      add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.research         add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.finance_entries  add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.learning_entries add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.trades           add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.decisions        add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.products         add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.content          add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.leads            add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.feedback         add column if not exists import_id uuid references public.user_imports(id) on delete set null;
alter table public.metrics          add column if not exists import_id uuid references public.user_imports(id) on delete set null;

-- ----------------------------------------------------------------------------
-- user_insights — the "here is what I found" list.
--
-- The evidence is stored ALONGSIDE the sentence, and that is the whole
-- design. An insight is a claim about somebody's business; if the
-- numbers behind it are not kept, nobody — including us — can ever check
-- whether it was true. `evidence` holds the computed facts the sentence
-- was written from, and `detector` names the code that produced them.
-- ----------------------------------------------------------------------------
create table if not exists public.user_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_id uuid references public.user_imports(id) on delete set null,

  -- Which deterministic detector found the pattern. NOT free text: an
  -- insight whose provenance is a model's imagination has no place here,
  -- and a fixed vocabulary is what makes that enforceable.
  detector text not null,
  -- Where the user should go to see it for themselves.
  module_slug text,

  headline text not null,
  detail text not null,
  -- The numbers. { "sampleSize": 41, "share": 0.62, ... } — whatever the
  -- detector measured, so the claim is auditable after the fact.
  evidence jsonb not null default '{}'::jsonb,
  -- How much of the user's data the pattern rests on. Shown, not hidden:
  -- a pattern in nine rows is a hint, and saying so is the difference
  -- between an insight and a horoscope.
  sample_size integer not null default 0,

  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);

create index if not exists user_insights_user_created_idx
  on public.user_insights (user_id, created_at desc);

create index if not exists user_insights_user_active_idx
  on public.user_insights (user_id, created_at desc)
  where dismissed_at is null;

alter table public.user_insights enable row level security;

drop policy if exists "select_own_user_insights" on public.user_insights;
create policy "select_own_user_insights" on public.user_insights
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_insights" on public.user_insights;
create policy "insert_own_user_insights" on public.user_insights
  for insert with check (auth.uid() = user_id);

-- Dismiss is an UPDATE the owner makes. Deliberately no DELETE policy:
-- an insight is dismissed, not erased, so the same pattern is not
-- re-reported to somebody who has already said they know.
drop policy if exists "update_own_user_insights" on public.user_insights;
create policy "update_own_user_insights" on public.user_insights
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- user_onboarding — one row per user, created on first sight.
--
-- Holds the two facts the flow needs to not repeat itself: whether the
-- user has finished (or skipped) it, and whether the one FREE import and
-- analysis has been spent.
--
-- The free run is an activation investment, and it has to be recorded
-- server-side on a table the user cannot write the flag on. `activation_used_at`
-- is therefore only ever set by the service-role client — the owner's
-- UPDATE policy exists for the flow's own progress fields, and the API
-- writes the billing flag with the admin client so a crafted request
-- cannot un-spend it.
-- ----------------------------------------------------------------------------
create table if not exists public.user_onboarding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- What the user said they wanted to do, from the first step.
  goal text,
  completed_at timestamptz,
  skipped_at timestamptz,
  -- Set once, by the server, when the free import+analysis is consumed.
  activation_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_onboarding enable row level security;

drop policy if exists "select_own_user_onboarding" on public.user_onboarding;
create policy "select_own_user_onboarding" on public.user_onboarding
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_user_onboarding" on public.user_onboarding;
create policy "insert_own_user_onboarding" on public.user_onboarding
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_user_onboarding" on public.user_onboarding;
create policy "update_own_user_onboarding" on public.user_onboarding
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.user_onboarding;
create trigger set_updated_at before update on public.user_onboarding
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Claiming the one free activation run.
--
-- A conditional UPDATE rather than a read-then-write, for the same
-- reason every other claim in this schema is one: two requests that both
-- read "not used yet" would both get a free run. `where activation_used_at
-- is null` makes exactly one of them win, in the database, and the
-- caller finds out which by whether a row came back.
--
-- SECURITY DEFINER and granted only to service_role: the flag decides
-- whether real money is spent for free, so the client must not be able
-- to reach it even though it owns the row.
-- ----------------------------------------------------------------------------
create or replace function public.claim_activation_run(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed integer;
begin
  insert into public.user_onboarding (user_id)
    values (target_user_id)
    on conflict (user_id) do nothing;

  update public.user_onboarding
    set activation_used_at = now()
    where user_id = target_user_id
      and activation_used_at is null;

  get diagnostics claimed = row_count;
  return claimed > 0;
end;
$$;

revoke all on function public.claim_activation_run(uuid) from public;
revoke all on function public.claim_activation_run(uuid) from anon;
revoke all on function public.claim_activation_run(uuid) from authenticated;
grant execute on function public.claim_activation_run(uuid) to service_role;
