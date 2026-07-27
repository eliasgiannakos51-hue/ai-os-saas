-- ============================================================================
-- AI OS — Supabase schema
-- 13 tables, each scoped to the owning user via RLS (user_id = auth.uid()).
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ideas
-- ----------------------------------------------------------------------------
create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  problem text,
  customer text,
  competitors text,
  market_size text,
  mvp text,
  score integer,
  verdict text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. competitors
-- ----------------------------------------------------------------------------
create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid references public.ideas(id) on delete set null,
  name text not null,
  product text,
  pricing text,
  strengths text,
  weaknesses text,
  url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. research
-- ----------------------------------------------------------------------------
create table if not exists public.research (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid references public.ideas(id) on delete set null,
  topic text not null,
  source text,
  summary text,
  url text,
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. finance_entries
-- ----------------------------------------------------------------------------
create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  category text,
  amount numeric(14, 2) not null,
  currency text not null default 'USD',
  description text,
  entry_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. learning_entries
-- ----------------------------------------------------------------------------
create table if not exists public.learning_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source text,
  category text,
  notes text,
  entry_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6. trades
-- ----------------------------------------------------------------------------
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  side text check (side in ('long', 'short')),
  entry_price numeric(18, 6),
  exit_price numeric(18, 6),
  quantity numeric(18, 6),
  pnl numeric(18, 2),
  notes text,
  trade_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. decisions
-- ----------------------------------------------------------------------------
create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid references public.ideas(id) on delete set null,
  title text not null,
  context text,
  options text,
  decision text,
  rationale text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 8. products
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid references public.ideas(id) on delete set null,
  name text not null,
  description text,
  status text,
  price numeric(14, 2),
  url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 9. content
-- ----------------------------------------------------------------------------
create table if not exists public.content (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  platform text,
  type text,
  status text,
  url text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 10. leads
-- ----------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text,
  company text,
  source text,
  status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 11. feedback
-- ----------------------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text,
  content text not null,
  sentiment text,
  related_item text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 12. metrics
-- ----------------------------------------------------------------------------
create table if not exists public.metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  value numeric(18, 4),
  unit text,
  period text,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 13. automations
-- ----------------------------------------------------------------------------
create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  trigger_event text,
  action_type text,
  status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security
-- Every table: owner-only access, scoped by user_id = auth.uid().
-- ============================================================================

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'ideas', 'competitors', 'research', 'finance_entries', 'learning_entries',
      'trades', 'decisions', 'products', 'content', 'leads', 'feedback',
      'metrics', 'automations'
    ])
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format(
      'drop policy if exists "select_own_%1$s" on public.%1$s;', t
    );
    execute format(
      'create policy "select_own_%1$s" on public.%1$s for select using (auth.uid() = user_id);', t
    );

    execute format(
      'drop policy if exists "insert_own_%1$s" on public.%1$s;', t
    );
    execute format(
      'create policy "insert_own_%1$s" on public.%1$s for insert with check (auth.uid() = user_id);', t
    );

    execute format(
      'drop policy if exists "update_own_%1$s" on public.%1$s;', t
    );
    execute format(
      'create policy "update_own_%1$s" on public.%1$s for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t
    );

    execute format(
      'drop policy if exists "delete_own_%1$s" on public.%1$s;', t
    );
    execute format(
      'create policy "delete_own_%1$s" on public.%1$s for delete using (auth.uid() = user_id);', t
    );
  end loop;
end $$;

-- ============================================================================
-- updated_at auto-touch trigger (applied to every table above)
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'ideas', 'competitors', 'research', 'finance_entries', 'learning_entries',
      'trades', 'decisions', 'products', 'content', 'leads', 'feedback',
      'metrics', 'automations'
    ])
  loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();', t
    );
  end loop;
end $$;
