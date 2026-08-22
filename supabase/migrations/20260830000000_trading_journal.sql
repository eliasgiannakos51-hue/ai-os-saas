-- ============================================================================
-- TRADING JOURNAL AND THE STRATEGY GUARDIAN (V4 #14)
-- ============================================================================
--
-- WHAT THIS IS AND, MORE IMPORTANTLY, WHAT IT IS NOT.
--
-- It is a record of trades the user has ALREADY MADE, and a comparison of
-- those trades against rules the user WROTE THEMSELVES. That is the whole
-- product. It does not suggest a trade, it does not rank an instrument, it
-- does not say what a market will do, and there is nowhere in this schema
-- to store any of those things.
--
-- The distinction the brief draws is the one this schema is built around:
--
--     NOT "buy EURUSD"
--     BUT "you broke your own 2% rule, eight times, in March"
--
-- The second is arithmetic over the user's own data. The first is advice,
-- and this product does not give it — see lib/trading/conduct.ts, which is
-- enforced rather than promised.
--
-- WHY `trades` IS EXTENDED AND NOT REPLACED. public.trades already exists
-- as one of the thirteen module tables: it has RLS, an updated_at trigger,
-- a GDPR registry entry, an ask-my-records index and a pattern analyser
-- reading it. A second table also meaning "a trade" would leave two
-- answers to "how many trades did I make", and the wrong one would be the
-- one somebody queried. The journal columns are added to the table that
-- already holds trades.
--
-- EVERY NEW COLUMN IS NULLABLE. There are rows in this table today, typed
-- in by hand through the generic module form, with nothing but a symbol
-- and a P&L. A NOT NULL column would either fail the migration or force a
-- default that invents data — a commission of 0 on a trade nobody recorded
-- a commission for is a lie the statistics would then compute with.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

-- ----------------------------------------------------------------------
-- 1. trading_accounts
-- ----------------------------------------------------------------------
-- A trader usually has more than one: a funded account, a demo, a
-- personal one. Statistics computed across all of them at once are
-- meaningless — a demo account's drawdown is not a drawdown.
create table if not exists public.trading_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  broker text,
  -- ISO 4217. Held per account because a €10,000 drawdown and a $10,000
  -- drawdown are different numbers, and summing them would be arithmetic
  -- on two different units.
  currency text not null default 'EUR',

  -- The denominator for a percentage risk rule, and the origin of the
  -- equity curve. Null when the user has not said — the rules that need
  -- it then report "cannot be checked" rather than dividing by a guess.
  starting_balance numeric(18, 2),

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint trading_accounts_name_not_blank check (length(btrim(name)) > 0),
  constraint trading_accounts_balance_non_negative
    check (starting_balance is null or starting_balance >= 0)
);

create index if not exists trading_accounts_user_idx
  on public.trading_accounts (user_id, is_active, created_at desc);

alter table public.trading_accounts enable row level security;

drop policy if exists trading_accounts_select_own on public.trading_accounts;
create policy trading_accounts_select_own
  on public.trading_accounts for select using (auth.uid() = user_id);
drop policy if exists trading_accounts_insert_own on public.trading_accounts;
create policy trading_accounts_insert_own
  on public.trading_accounts for insert with check (auth.uid() = user_id);
drop policy if exists trading_accounts_update_own on public.trading_accounts;
create policy trading_accounts_update_own
  on public.trading_accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists trading_accounts_delete_own on public.trading_accounts;
create policy trading_accounts_delete_own
  on public.trading_accounts for delete using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.trading_accounts;
create trigger set_updated_at before update on public.trading_accounts
  for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------
-- GRANTS. A POLICY WITHOUT A GRANT IS A LOCKED DOOR.
-- ----------------------------------------------------------------------
-- Postgres checks table PRIVILEGES first and row-level policies second.
-- A table with perfect RLS and no GRANT answers every query with
-- "permission denied for table" — for its owner as much as for anybody
-- else — so the feature is not partly broken, it is entirely dead.
--
-- The thirteen module tables get theirs from a do-loop in the baseline
-- migration, which is exactly why a new table added outside that loop is
-- easy to miss: everything about it LOOKS right. Caught by
-- scripts/tests/trading-journal.dbtest.mjs, which reads as the owner and
-- as a stranger rather than trusting the policy text.

grant select, insert, update, delete on public.trading_accounts to authenticated;
revoke all on public.trading_accounts from anon;

-- ----------------------------------------------------------------------
-- 2. the journal columns on public.trades
-- ----------------------------------------------------------------------
-- ON DELETE SET NULL, not cascade: deleting an account must not delete
-- the trades made in it. A trader who closes a funded account still has a
-- year of their own history, and losing it to a tidy-up is not recoverable.
alter table public.trades add column if not exists account_id uuid
  references public.trading_accounts(id) on delete set null;

-- The normalised instrument ("EURUSD"), beside the free-text `symbol` the
-- user typed ("eur/usd", "EUR USD"). Both, because grouping statistics by
-- what somebody typed produces one bucket per spelling.
alter table public.trades add column if not exists instrument text;

alter table public.trades add column if not exists entry_price numeric(20, 8);
alter table public.trades add column if not exists exit_price numeric(20, 8);
-- Position size in the instrument's own units (lots, contracts, coins).
-- Not converted to money here: the conversion needs a contract size this
-- schema does not know, and a wrong conversion is worse than none.
alter table public.trades add column if not exists size numeric(20, 8);

alter table public.trades add column if not exists entered_at timestamptz;
alter table public.trades add column if not exists exited_at timestamptz;

-- Charged, not derived. A commission the user did not record is null, and
-- the statistics say "before costs" rather than pretending it was zero.
alter table public.trades add column if not exists commission numeric(18, 2);

-- Which session the trade was OPENED in. Derived from entered_at by
-- lib/trading/journal.ts and stored, because the derivation depends on a
-- timezone the row does not carry and recomputing it later would silently
-- change history.
alter table public.trades add column if not exists session text;

-- The plan, as it was at entry. Kept so a rule about risk-reward can be
-- checked against what was PLANNED — checking it against the outcome
-- would mark every trade that hit its stop as a rule violation, which is
-- the opposite of what a stop is for.
alter table public.trades add column if not exists stop_price numeric(20, 8);
alter table public.trades add column if not exists target_price numeric(20, 8);
-- Money at risk, in the account's currency.
alter table public.trades add column if not exists risk_amount numeric(18, 2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trades_session_known') then
    alter table public.trades add constraint trades_session_known
      check (session is null or session in ('sydney', 'tokyo', 'london', 'new_york', 'other'));
  end if;

  -- A trade cannot be closed before it was opened. Both null is fine (an
  -- old hand-typed row); one null is fine (a position still open).
  if not exists (select 1 from pg_constraint where conname = 'trades_exit_after_entry') then
    alter table public.trades add constraint trades_exit_after_entry
      check (entered_at is null or exited_at is null or exited_at >= entered_at);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trades_size_non_negative') then
    alter table public.trades add constraint trades_size_non_negative
      check (size is null or size >= 0);
  end if;

  -- Commission is a COST. A negative one is a rebate, which is real, so
  -- this bounds nothing except the absurd — but risk_amount is money the
  -- trader put at risk and cannot be below zero.
  if not exists (select 1 from pg_constraint where conname = 'trades_risk_non_negative') then
    alter table public.trades add constraint trades_risk_non_negative
      check (risk_amount is null or risk_amount >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trades_prices_non_negative') then
    alter table public.trades add constraint trades_prices_non_negative
      check (
        (entry_price is null or entry_price >= 0) and
        (exit_price is null or exit_price >= 0) and
        (stop_price is null or stop_price >= 0) and
        (target_price is null or target_price >= 0)
      );
  end if;
end $$;

-- The statistics query: this user's closed trades, newest first, filtered
-- by account.
create index if not exists trades_journal_idx
  on public.trades (user_id, account_id, exited_at desc);
create index if not exists trades_instrument_idx
  on public.trades (user_id, instrument)
  where instrument is not null;
create index if not exists trades_session_idx
  on public.trades (user_id, session)
  where session is not null;

-- ----------------------------------------------------------------------
-- 3. trading_rules — the user's own words, and a checkable form of them
-- ----------------------------------------------------------------------
-- BOTH ARE STORED, and that is the design.
--
-- `original_text` is exactly what the user wrote: "Max 2% risk. Only
-- London." It is never rewritten, and it is what the UI shows them. If
-- the parse below is wrong, the user can see that it is wrong, because
-- their own sentence is sitting next to it.
--
-- `kind` and `params` are the CHECKABLE form. An AI turns the sentence
-- into them ONCE, at save time, and the user confirms it. Every trade is
-- then evaluated by ordinary code (lib/trading/guardian.ts).
--
-- WHY NOT ASK THE MODEL EACH TIME. "You broke this rule 8 times in March"
-- is a COUNT. A model asked to compare 200 trades against a sentence will
-- produce a number that looks like a count and is not one, it will
-- produce a different number tomorrow, and nothing in the product could
-- tell. Parsing once and counting in code makes the number arithmetic.
create table if not exists public.trading_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Null means "every account". A rule about session applies wherever the
  -- user trades; a rule about position size usually does not.
  account_id uuid references public.trading_accounts(id) on delete cascade,

  -- Verbatim. Never rewritten, never normalised.
  original_text text not null,

  kind text not null check (kind in (
    'max_risk_percent',
    'max_trades_per_day',
    'min_risk_reward',
    'allowed_sessions',
    'allowed_instruments',
    'max_daily_loss',
    'no_trade_after_loss',
    'max_position_size'
  )),
  -- The kind's own parameters. Shape validated in TypeScript
  -- (lib/trading/rules.ts) rather than in SQL: a jsonb CHECK expressive
  -- enough for eight different shapes would be unreadable, and the
  -- validator is exercised by the build gate.
  params jsonb not null default '{}'::jsonb,

  is_active boolean not null default true,

  -- 'ai' when a model parsed the sentence, 'manual' when the user built
  -- the rule from the form. Recorded because a rule the user checked and
  -- a rule a model guessed deserve different confidence, and a violation
  -- report that cannot tell them apart is one the user cannot argue with.
  source text not null default 'manual' check (source in ('ai', 'manual')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint trading_rules_text_not_blank check (length(btrim(original_text)) > 0),
  constraint trading_rules_params_is_object check (jsonb_typeof(params) = 'object')
);

create index if not exists trading_rules_user_idx
  on public.trading_rules (user_id, is_active, created_at desc);

alter table public.trading_rules enable row level security;

drop policy if exists trading_rules_select_own on public.trading_rules;
create policy trading_rules_select_own
  on public.trading_rules for select using (auth.uid() = user_id);
drop policy if exists trading_rules_insert_own on public.trading_rules;
create policy trading_rules_insert_own
  on public.trading_rules for insert with check (auth.uid() = user_id);
drop policy if exists trading_rules_update_own on public.trading_rules;
create policy trading_rules_update_own
  on public.trading_rules for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists trading_rules_delete_own on public.trading_rules;
create policy trading_rules_delete_own
  on public.trading_rules for delete using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.trading_rules;
create trigger set_updated_at before update on public.trading_rules
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.trading_rules to authenticated;
revoke all on public.trading_rules from anon;

-- ----------------------------------------------------------------------
-- 4. rule_violations
-- ----------------------------------------------------------------------
-- One row per (trade, rule) that failed. Regenerable: evaluation is
-- deterministic, so re-running it over the same trades and the same rules
-- produces exactly these rows again — which is why the unique constraint
-- is (trade_id, rule_id) and writes are upserts rather than inserts.
--
-- `rule_kind` and `rule_text` are DENORMALISED on purpose. A user who
-- deletes a rule still has the March report that referenced it, and a
-- report reading "you broke rule <deleted>" is a report nobody can use.
create table if not exists public.rule_violations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades(id) on delete cascade,
  -- SET NULL, not cascade: the violation outlives the rule.
  rule_id uuid references public.trading_rules(id) on delete set null,

  rule_kind text not null,
  -- The user's own sentence, as it was WHEN THE VIOLATION HAPPENED.
  -- Editing a rule must not rewrite the history of what was broken.
  rule_text text not null default '',

  -- When the trade happened, not when this row was written. A March
  -- report is about March.
  occurred_at timestamptz,

  -- What was observed and what was allowed: {"observed": 3.4,
  -- "allowed": 2, "unit": "percent"}. Enough for the sentence
  -- "risked 3.4% against your 2% rule" without re-deriving anything.
  detail jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint rule_violations_detail_is_object check (jsonb_typeof(detail) = 'object')
);

-- IDEMPOTENT RE-EVALUATION. Without this, re-running the guardian after
-- the user edits one rule would double every violation already recorded,
-- and "8 times in March" would become 16.
create unique index if not exists rule_violations_trade_rule_idx
  on public.rule_violations (trade_id, rule_id)
  where rule_id is not null;

create index if not exists rule_violations_user_idx
  on public.rule_violations (user_id, occurred_at desc);
create index if not exists rule_violations_kind_idx
  on public.rule_violations (user_id, rule_kind, occurred_at desc);

alter table public.rule_violations enable row level security;

drop policy if exists rule_violations_select_own on public.rule_violations;
create policy rule_violations_select_own
  on public.rule_violations for select using (auth.uid() = user_id);
-- INSERT AND DELETE, BUT NO UPDATE. The guardian rewrites the set by
-- deleting and re-inserting for the trades it re-evaluated; there is no
-- legitimate reason to edit a recorded violation in place, and a user who
-- could would be editing the evidence.
drop policy if exists rule_violations_insert_own on public.rule_violations;
create policy rule_violations_insert_own
  on public.rule_violations for insert with check (auth.uid() = user_id);
drop policy if exists rule_violations_delete_own on public.rule_violations;
create policy rule_violations_delete_own
  on public.rule_violations for delete using (auth.uid() = user_id);
-- SELECT, INSERT AND DELETE, BUT NEVER UPDATE. The guardian replaces the
-- set by deleting and re-inserting; editing a recorded violation in place
-- would be editing the evidence.
grant select, insert, delete on public.rule_violations to authenticated;
revoke update on public.rule_violations from authenticated;
revoke all on public.rule_violations from anon;
