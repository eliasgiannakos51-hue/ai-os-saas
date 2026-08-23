-- ============================================================================
-- BANK CONNECTIONS AND CRYPTO WALLETS (V4 #15)
-- ============================================================================
--
-- ============================================================
-- READ-ONLY, AND THE SCHEMA IS HOW THAT IS TRUE
-- ============================================================
--
-- There is no column here that could initiate anything. No payee, no
-- beneficiary, no transfer, no amount-to-send, no signing key, no payment
-- scope. A bank connection stores a token and what that token is allowed
-- to see; a wallet stores a PUBLIC address. Nothing in this schema can be
-- used to move money, because there is nowhere to put the instruction.
--
-- That is deliberate and it is the strongest form of "read-only": a rule
-- enforced by code can be edited by the next person; a table with no
-- column for the dangerous thing has to be migrated, in a diff somebody
-- reviews.
--
-- ============================================================
-- NEVER A PRIVATE KEY, NEVER A SEED PHRASE
-- ============================================================
--
-- crypto_wallets holds ONE address column. There is no key column, no
-- secret column, no encrypted-secret column, and no jsonb bag one could
-- be hidden in. The input is also refused on the way in by
-- lib/finance/secret-guard.ts, which recognises mnemonics, raw hex keys,
-- WIF and xprv by shape and rejects them WITHOUT echoing them.
--
-- A watch-only extended PUBLIC key (xpub) would be a legitimate thing to
-- store here one day. It is not stored today, and adding it would mean
-- adding a column — which is the point.
--
-- ============================================================
-- CREDENTIALS
-- ============================================================
--
-- The bank access token is CIPHERTEXT, through the same AES-256-GCM
-- module the OAuth integrations already use (lib/integrations/crypto.ts).
-- Not a second implementation: one encryption path means one place for a
-- key to be mishandled, and that path already refuses to encrypt when no
-- key is configured rather than degrading to plaintext.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

-- ----------------------------------------------------------------------
-- 1. bank_connections
-- ----------------------------------------------------------------------
create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- The aggregator. Named rather than free text so an unknown value
  -- cannot be introduced by a route that was never reviewed.
  provider text not null check (provider in ('plaid', 'gocardless', 'tink', 'truelayer', 'manual')),

  -- Display only, and non-sensitive: "Alpha Bank", "Revolut". Never an
  -- account number, never an IBAN.
  institution_name text,

  -- CIPHERTEXT. Format v1.<iv>.<tag>.<ciphertext>, base64url, with the
  -- user id bound in as GCM additional authenticated data — so a
  -- ciphertext moved between rows fails to decrypt instead of quietly
  -- working. Null for 'manual', which has no credential at all.
  access_token_encrypted text,

  -- WHAT THE TOKEN MAY DO, recorded so "connected" can be told from
  -- "connected with more access than we asked for". Every value here is
  -- a READ scope; the CHECK is what makes that a constraint rather than
  -- a convention, and a payment scope cannot be written to this column.
  scopes text[] not null default '{}',

  status text not null default 'connected'
    check (status in ('connected', 'expired', 'revoked', 'error')),

  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  updated_at timestamptz not null default now(),

  -- READ-ONLY, WRITTEN DOWN AND CONSTRAINED. A row cannot claim to be
  -- anything else: the column exists so that a future change granting
  -- write access has to alter a CHECK constraint in a reviewed migration
  -- rather than passing a different string.
  access_mode text not null default 'read_only' check (access_mode = 'read_only'),

  constraint bank_connections_scopes_are_read_only check (
    scopes <@ array['accounts:read', 'transactions:read', 'balances:read', 'identity:read']::text[]
  )
);

create index if not exists bank_connections_user_idx
  on public.bank_connections (user_id, status, connected_at desc);

alter table public.bank_connections enable row level security;

drop policy if exists bank_connections_select_own on public.bank_connections;
create policy bank_connections_select_own
  on public.bank_connections for select using (auth.uid() = user_id);
-- The user may DISCONNECT (delete) but may not write a connection or
-- edit one: a connection is created by the server after the provider's
-- handshake, and a user who could insert one could point the sync at a
-- token of their choosing.
drop policy if exists bank_connections_delete_own on public.bank_connections;
create policy bank_connections_delete_own
  on public.bank_connections for delete using (auth.uid() = user_id);
grant select, delete on public.bank_connections to authenticated;
revoke insert, update on public.bank_connections from authenticated;
revoke all on public.bank_connections from anon;

drop trigger if exists set_updated_at on public.bank_connections;
create trigger set_updated_at before update on public.bank_connections
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------
-- 2. bank_transactions
-- ----------------------------------------------------------------------
-- What was synced. Read-only in the strongest sense: the user cannot
-- write these rows at all, because a bank statement somebody can edit is
-- not a bank statement.
create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.bank_connections(id) on delete cascade,

  -- The provider's own id for this transaction. Unique per connection so
  -- a re-sync updates rather than duplicates.
  external_id text not null,

  -- Signed: negative is money out. One column rather than a type plus a
  -- magnitude, because two columns that must agree eventually do not.
  amount numeric(18, 2) not null,
  currency text not null default 'EUR',

  description text,
  -- The provider's category, kept verbatim. Not re-categorised by us:
  -- a wrong category on somebody's spending is a claim about their life.
  category text,

  booked_at timestamptz not null,
  created_at timestamptz not null default now(),

  -- NO account number, NO IBAN, NO counterparty account. The description
  -- is what a statement line says; the routing details are not needed to
  -- show somebody their spending and are the part that would matter if
  -- this table leaked.
  constraint bank_transactions_currency_shape check (currency ~ '^[A-Z]{3}$')
);

create unique index if not exists bank_transactions_external_idx
  on public.bank_transactions (connection_id, external_id);
create index if not exists bank_transactions_user_idx
  on public.bank_transactions (user_id, booked_at desc);

alter table public.bank_transactions enable row level security;

drop policy if exists bank_transactions_select_own on public.bank_transactions;
create policy bank_transactions_select_own
  on public.bank_transactions for select using (auth.uid() = user_id);
-- NO INSERT, UPDATE OR DELETE POLICY AT ALL. Only the sync writes here.
grant select on public.bank_transactions to authenticated;
revoke insert, update, delete on public.bank_transactions from authenticated;
revoke all on public.bank_transactions from anon;

-- ----------------------------------------------------------------------
-- 3. crypto_wallets
-- ----------------------------------------------------------------------
-- ONE ADDRESS COLUMN, and nothing else that could be a secret.
create table if not exists public.crypto_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  chain text not null check (chain in ('bitcoin', 'ethereum', 'solana', 'other')),

  -- PUBLIC. A private key, a WIF, an xprv or a seed phrase is refused by
  -- lib/finance/secret-guard.ts before it reaches this column, and the
  -- length bound below is a second, dumber barrier: a 24-word mnemonic is
  -- longer than any address on any of these chains.
  address text not null,

  label text,

  -- Watch-only, and constrained the same way bank access_mode is.
  access_mode text not null default 'watch_only' check (access_mode = 'watch_only'),

  added_at timestamptz not null default now(),
  last_sync_at timestamptz,
  updated_at timestamptz not null default now(),

  constraint crypto_wallets_address_not_blank check (length(btrim(address)) > 0),
  -- 128 characters. Every address on every supported chain fits well
  -- inside it; a 12-word mnemonic does not.
  constraint crypto_wallets_address_length check (length(address) <= 128),
  -- NO WHITESPACE. An address never contains a space; a seed phrase is
  -- almost entirely spaces. This is the cheapest possible check for the
  -- most dangerous possible input, and it is in the database rather than
  -- only in TypeScript because that is the layer that cannot be bypassed.
  constraint crypto_wallets_address_single_token check (address !~ '\s')
);

create unique index if not exists crypto_wallets_user_address_idx
  on public.crypto_wallets (user_id, chain, address);
create index if not exists crypto_wallets_user_idx
  on public.crypto_wallets (user_id, added_at desc);

alter table public.crypto_wallets enable row level security;

drop policy if exists crypto_wallets_select_own on public.crypto_wallets;
create policy crypto_wallets_select_own
  on public.crypto_wallets for select using (auth.uid() = user_id);
drop policy if exists crypto_wallets_insert_own on public.crypto_wallets;
create policy crypto_wallets_insert_own
  on public.crypto_wallets for insert with check (auth.uid() = user_id);
drop policy if exists crypto_wallets_update_own on public.crypto_wallets;
create policy crypto_wallets_update_own
  on public.crypto_wallets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists crypto_wallets_delete_own on public.crypto_wallets;
create policy crypto_wallets_delete_own
  on public.crypto_wallets for delete using (auth.uid() = user_id);

-- A POLICY WITHOUT A GRANT IS A LOCKED DOOR — see the note in
-- 20260830000000_trading_journal.sql. Postgres checks table privileges
-- before row policies, so a table with perfect RLS and no GRANT answers
-- every query with "permission denied", including the owner's.
grant select, insert, update, delete on public.crypto_wallets to authenticated;
revoke all on public.crypto_wallets from anon;

drop trigger if exists set_updated_at on public.crypto_wallets;
create trigger set_updated_at before update on public.crypto_wallets
  for each row execute function public.set_updated_at();
