// THE TRADING, BANK AND CRYPTO SCHEMA, AGAINST A REAL POSTGRES.
//
// The claims here are ones only the database can make, and each protects
// something a route cannot:
//
//   A USER CANNOT WRITE THEIR OWN BANK STATEMENT. A statement somebody
//   can edit is not a statement, and no route remembering to check is as
//   strong as no policy existing.
//
//   THERE IS NOWHERE TO PUT A SEED PHRASE. crypto_wallets has one address
//   column, it refuses whitespace, and it is bounded below a mnemonic's
//   length. The TypeScript guard is the friendly first line; this is the
//   one that cannot be bypassed.
//
//   READ-ONLY IS A CHECK CONSTRAINT. A row cannot claim any other access
//   mode, and a payment scope cannot be written into the scopes array.
//
//   RE-RUNNING THE GUARDIAN CANNOT DOUBLE A COUNT. "Eight times in March"
//   becoming sixteen because somebody pressed refresh twice is the exact
//   failure the unique index exists for.
//
// Run: node scripts/tests/trading-journal.dbtest.mjs   (needs a database;
// run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

if (!process.env.DATABASE_URL && !process.env.PGDATABASE) {
  console.log("SKIPPED: no DATABASE_URL or PGDATABASE — run through `npm run test:db`.");
  process.exit(0);
}

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const PSQL_TAG = /^(BEGIN|COMMIT|ROLLBACK|SET|DO|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SELECT \d+|ALTER TABLE|CREATE INDEX)$/;
function answer(out) {
  const lines = out.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !PSQL_TAG.test(l));
  return lines.length === 0 ? "" : lines[lines.length - 1];
}
const dbArgs = () => (process.env.DATABASE_URL ? ["-d", process.env.DATABASE_URL] : ["-d", process.env.PGDATABASE]);
function sql(query) {
  return answer(
    execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", query], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  );
}
function trySql(query) {
  try { return { ok: true, out: sql(query) }; }
  catch (err) { return { ok: false, error: String(err.stderr || err.stdout || err.message) }; }
}
function tryAs(role, userId, query) {
  const script = `set local role ${role};
set local request.jwt.claim.sub = '${userId}';
set local request.jwt.claim.role = '${role}';
${query}`;
  try {
    return {
      ok: true,
      out: answer(
        execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", `begin; ${script}; commit;`], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        })
      ),
    };
  } catch (err) {
    return { ok: false, error: String(err.stderr || err.stdout || err.message) };
  }
}

// Emails namespaced per suite: every dbtest runs against the same
// throwaway database in sequence and auth.users.email is unique.
const USER = "ffffffff-0000-0000-0000-000000000001";
const OTHER = "ffffffff-0000-0000-0000-000000000002";
sql(`insert into auth.users (id, email) values
  ('${USER}', 'trading-user@test.local'), ('${OTHER}', 'trading-other@test.local')
  on conflict (id) do nothing`);
const cleanup = () => {
  for (const t of ["rule_violations", "trading_rules", "trades", "trading_accounts",
                   "bank_transactions", "bank_connections", "crypto_wallets"]) {
    sql(`delete from public.${t} where user_id in ('${USER}', '${OTHER}')`);
  }
};
cleanup();

// ===========================================================================
console.log("== 1. the journal columns landed on the EXISTING trades table ==");
// ===========================================================================

ok("trading_accounts, trading_rules and rule_violations all exist",
  ["trading_accounts", "trading_rules", "rule_violations"].every(
    (t) => sql(`select to_regclass('public.${t}') is not null`) === "t"));

const tradeColumns = sql(
  `select string_agg(column_name, ',' order by column_name) from information_schema.columns
    where table_schema='public' and table_name='trades'`
).split(",");
for (const col of ["account_id", "instrument", "entry_price", "exit_price", "size",
                   "entered_at", "exited_at", "commission", "session",
                   "stop_price", "target_price", "risk_amount"]) {
  ok(`trades.${col} exists`, tradeColumns.includes(col));
}
// THE OLD MODULE COLUMNS SURVIVED. A migration that replaced this table
// would have taken the generic module, the GDPR export and the pattern
// analyser with it.
for (const col of ["symbol", "direction", "result", "pnl", "notes", "occurred_at"]) {
  ok(`the original trades.${col} is untouched`, tradeColumns.includes(col));
}
// EVERY NEW COLUMN IS NULLABLE — there are hand-typed rows in this table
// with nothing but a symbol, and a NOT NULL would have invented data.
const notNullNew = sql(
  `select coalesce(string_agg(column_name, ','), '') from information_schema.columns
    where table_schema='public' and table_name='trades' and is_nullable='NO'
      and column_name in ('account_id','instrument','entry_price','exit_price','size',
                          'entered_at','exited_at','commission','session',
                          'stop_price','target_price','risk_amount')`
);
ok("every new journal column is nullable", notNullNew === "", notNullNew);

// ===========================================================================
console.log("\n== 2. the constraints refuse what the code refuses ==");
// ===========================================================================

const ACCOUNT = "ffffffff-1111-0000-0000-000000000001";
sql(`insert into public.trading_accounts (id, user_id, name, currency, starting_balance)
     values ('${ACCOUNT}', '${USER}', 'Funded', 'EUR', 10000)
     on conflict (id) do nothing`);

ok("a blank account name is refused",
  !trySql(`insert into public.trading_accounts (user_id, name) values ('${USER}', '   ')`).ok);
ok("a negative starting balance is refused",
  !trySql(`insert into public.trading_accounts (user_id, name, starting_balance) values ('${USER}', 'x', -1)`).ok);

const TRADE = "ffffffff-2222-0000-0000-000000000001";
ok("a trade with journal columns inserts",
  trySql(`insert into public.trades (id, user_id, account_id, symbol, instrument, direction, size,
            entry_price, exit_price, stop_price, target_price, risk_amount, commission, pnl,
            entered_at, exited_at, session)
          values ('${TRADE}', '${USER}', '${ACCOUNT}', 'eur/usd', 'EURUSD', 'long', 1,
            1.1, 1.11, 1.09, 1.13, 200, 3, 97,
            '2026-03-02T09:00:00Z', '2026-03-02T10:00:00Z', 'london')`).ok);

ok("an invented session is refused",
  !trySql(`update public.trades set session = 'atlantis' where id = '${TRADE}'`).ok);
ok("...and every real one is accepted",
  ["sydney", "tokyo", "london", "new_york", "other"].every(
    (s) => trySql(`update public.trades set session = '${s}' where id = '${TRADE}'`).ok));
ok("an exit BEFORE the entry is refused",
  !trySql(`update public.trades set exited_at = '2026-03-02T08:00:00Z' where id = '${TRADE}'`).ok);
ok("a negative size is refused",
  !trySql(`update public.trades set size = -1 where id = '${TRADE}'`).ok);
ok("a negative risk amount is refused",
  !trySql(`update public.trades set risk_amount = -1 where id = '${TRADE}'`).ok);
ok("a negative price is refused",
  !trySql(`update public.trades set entry_price = -1 where id = '${TRADE}'`).ok);
// A COMMISSION MAY BE NEGATIVE — a rebate is real money and refusing it
// would make the journal wrong for anybody on a rebate programme.
ok("a NEGATIVE commission is allowed, because a rebate is real",
  trySql(`update public.trades set commission = -0.5 where id = '${TRADE}'`).ok);
sql(`update public.trades set commission = 3 where id = '${TRADE}'`);

// Rule kinds.
const KINDS = ["max_risk_percent", "max_trades_per_day", "min_risk_reward", "allowed_sessions",
               "allowed_instruments", "max_daily_loss", "no_trade_after_loss", "max_position_size"];
ok("every rule kind the code knows is accepted by the CHECK",
  KINDS.every((k) => trySql(
    `insert into public.trading_rules (user_id, original_text, kind, params)
     values ('${USER}', 'r ${k}', '${k}', '{}'::jsonb)`).ok));
ok("an invented rule kind is refused",
  !trySql(`insert into public.trading_rules (user_id, original_text, kind)
           values ('${USER}', 'x', 'max_vibes')`).ok);
ok("a blank rule sentence is refused",
  !trySql(`insert into public.trading_rules (user_id, original_text, kind)
           values ('${USER}', '  ', 'max_risk_percent')`).ok);
ok("params must be a JSON OBJECT, not an array or a scalar",
  !trySql(`insert into public.trading_rules (user_id, original_text, kind, params)
           values ('${USER}', 'x', 'max_risk_percent', '[]'::jsonb)`).ok &&
  !trySql(`insert into public.trading_rules (user_id, original_text, kind, params)
           values ('${USER}', 'x', 'max_risk_percent', '2'::jsonb)`).ok);
ok("an invented source is refused",
  !trySql(`insert into public.trading_rules (user_id, original_text, kind, source)
           values ('${USER}', 'x', 'max_risk_percent', 'guessed')`).ok);

// ===========================================================================
console.log("\n== 3. a count that cannot be doubled, and history that survives ==");
// ===========================================================================

const RULE = sql(`insert into public.trading_rules (user_id, original_text, kind, params)
                  values ('${USER}', 'Max 1 lot', 'max_position_size', '{"size":1}'::jsonb)
                  returning id`);
ok("a rule was created", RULE.length === 36, RULE);

const insertViolation = () => trySql(
  `insert into public.rule_violations (user_id, trade_id, rule_id, rule_kind, rule_text, occurred_at, detail)
   values ('${USER}', '${TRADE}', '${RULE}', 'max_position_size', 'Max 1 lot',
           '2026-03-02T10:00:00Z', '{"observed":2,"allowed":1}'::jsonb)`);
ok("a violation is recorded", insertViolation().ok);
ok("RE-RUNNING THE GUARDIAN CANNOT DOUBLE THE COUNT — the same (trade, rule) is refused",
  !insertViolation().ok);
ok("...and the count is still one",
  sql(`select count(*) from public.rule_violations where user_id='${USER}'`) === "1");

// THE VIOLATION OUTLIVES THE RULE.
sql(`delete from public.trading_rules where id = '${RULE}'`);
ok("deleting the rule does NOT delete the March record of breaking it",
  sql(`select count(*) from public.rule_violations where user_id='${USER}'`) === "1");
ok("...the rule_id is cleared but the user's own sentence survives",
  sql(`select coalesce(rule_id::text,'null') || '|' || rule_text from public.rule_violations
       where user_id='${USER}'`) === "null|Max 1 lot");

// DELETING AN ACCOUNT MUST NOT DELETE THE TRADES MADE IN IT.
{
  const tempAccount = sql(`insert into public.trading_accounts (user_id, name) values ('${USER}', 'Temp') returning id`);
  const tempTrade = sql(`insert into public.trades (user_id, account_id, symbol) values ('${USER}', '${tempAccount}', 'X') returning id`);
  sql(`delete from public.trading_accounts where id = '${tempAccount}'`);
  ok("closing an account keeps the year of trading done in it",
    sql(`select count(*) from public.trades where id = '${tempTrade}'`) === "1");
  ok("...with the account link cleared rather than the row removed",
    sql(`select account_id is null from public.trades where id = '${tempTrade}'`) === "t");
  sql(`delete from public.trades where id = '${tempTrade}'`);
}

// A USER MAY NOT EDIT THE EVIDENCE.
const edit = tryAs("authenticated", USER, `update public.rule_violations set rule_text = 'never happened';`);
ok("a user CANNOT edit a recorded violation", !edit.ok, JSON.stringify(edit).slice(0, 140));
const readOther = tryAs("authenticated", OTHER, `select count(*) from public.rule_violations;`);
ok("...and cannot see somebody else's", readOther.ok && readOther.out === "0");
// They MAY delete: the guardian replaces the set on each re-evaluation.
ok("a user may delete their own violations, which is how re-evaluation replaces the set",
  tryAs("authenticated", USER, `delete from public.rule_violations where user_id='${USER}';`).ok);

// ===========================================================================
console.log("\n== 4. bank: read-only in the schema, not in a comment ==");
// ===========================================================================

const CONNECTION = sql(
  `insert into public.bank_connections (user_id, provider, institution_name, scopes)
   values ('${USER}', 'plaid', 'Test Bank', array['accounts:read','transactions:read'])
   returning id`
);
ok("a read-scoped connection inserts", CONNECTION.length === 36, CONNECTION);

ok("A PAYMENT SCOPE CANNOT BE WRITTEN INTO THE SCOPES ARRAY",
  !trySql(`update public.bank_connections set scopes = array['payments:write'] where id='${CONNECTION}'`).ok);
ok("...nor added alongside legitimate read scopes",
  !trySql(`update public.bank_connections set scopes = array['accounts:read','payments:initiate']
           where id='${CONNECTION}'`).ok);
ok("a connection cannot claim any access mode but read_only",
  !trySql(`update public.bank_connections set access_mode = 'read_write' where id='${CONNECTION}'`).ok);
ok("an unknown provider is refused",
  !trySql(`insert into public.bank_connections (user_id, provider) values ('${USER}', 'my-bank')`).ok);

ok("the bank tables hold no account number, IBAN or sort code",
  sql(`select count(*) from information_schema.columns
       where table_schema='public' and table_name in ('bank_connections','bank_transactions')
         and (column_name ilike '%iban%' or column_name ilike '%account_number%'
              or column_name ilike '%sort_code%' or column_name ilike '%routing%')`) === "0");

sql(`insert into public.bank_transactions (user_id, connection_id, external_id, amount, currency, description, booked_at)
     values ('${USER}', '${CONNECTION}', 'tx-1', -42.50, 'EUR', 'Coffee', '2026-03-02T09:00:00Z')`);
ok("a re-sync UPDATES rather than duplicating — (connection, external_id) is unique",
  !trySql(`insert into public.bank_transactions (user_id, connection_id, external_id, amount, booked_at)
           values ('${USER}', '${CONNECTION}', 'tx-1', -42.50, '2026-03-02T09:00:00Z')`).ok);
ok("a currency that is not three capitals is refused",
  !trySql(`insert into public.bank_transactions (user_id, connection_id, external_id, amount, currency, booked_at)
           values ('${USER}', '${CONNECTION}', 'tx-2', 1, 'euro', now())`).ok);

const readOwn = tryAs("authenticated", USER, `select count(*) from public.bank_transactions;`);
ok("a user reads their own transactions", readOwn.ok && readOwn.out === "1", JSON.stringify(readOwn));
const forgeTx = tryAs("authenticated", USER,
  `insert into public.bank_transactions (user_id, connection_id, external_id, amount, booked_at)
   values ('${USER}', '${CONNECTION}', 'forged', 1000000, now());`);
ok("A USER CANNOT WRITE THEIR OWN BANK STATEMENT", !forgeTx.ok, JSON.stringify(forgeTx).slice(0, 140));
const editTx = tryAs("authenticated", USER, `update public.bank_transactions set amount = 0;`);
ok("nor edit one", !editTx.ok, JSON.stringify(editTx).slice(0, 140));
const deleteTx = tryAs("authenticated", USER, `delete from public.bank_transactions;`);
ok("nor delete one", !deleteTx.ok, JSON.stringify(deleteTx).slice(0, 140));
const forgeConn = tryAs("authenticated", USER,
  `insert into public.bank_connections (user_id, provider) values ('${USER}', 'plaid');`);
ok("a user cannot create a connection pointing at a token of their choosing", !forgeConn.ok);
ok("...but MAY disconnect, which is the one write they need",
  tryAs("authenticated", USER, `delete from public.bank_connections where id='${CONNECTION}';`).ok);
ok("disconnecting takes the synced transactions with it",
  sql(`select count(*) from public.bank_transactions where user_id='${USER}'`) === "0");
const anonBank = tryAs("anon", USER, `select count(*) from public.bank_connections;`);
ok("anon cannot read any of it", !anonBank.ok);

// ===========================================================================
console.log("\n== 5. crypto: nowhere to put a key ==");
// ===========================================================================

const walletColumns = sql(
  `select string_agg(column_name, ',' order by column_name) from information_schema.columns
    where table_schema='public' and table_name='crypto_wallets'`
).split(",");
ok(`crypto_wallets holds exactly what it needs (${walletColumns.join(",")})`,
  JSON.stringify(walletColumns) === JSON.stringify([
    "access_mode", "added_at", "address", "chain", "id", "label", "last_sync_at", "updated_at", "user_id",
  ]),
  walletColumns.join(","));
ok("NO column could hold a private key, a seed phrase or an encrypted secret",
  walletColumns.every((c) => !/private|secret|seed|mnemonic|passphrase|key|xprv|encrypted/i.test(c)),
  walletColumns.filter((c) => /private|secret|seed|mnemonic|passphrase|key|xprv|encrypted/i.test(c)).join(","));
ok("no jsonb column one could be hidden in",
  sql(`select count(*) from information_schema.columns
       where table_schema='public' and table_name='crypto_wallets' and data_type in ('json','jsonb','bytea')`) === "0");

ok("a public address inserts",
  trySql(`insert into public.crypto_wallets (user_id, chain, address, label)
          values ('${USER}', 'ethereum', '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', 'cold')`).ok);
// THE DATABASE REFUSES A SEED PHRASE even if every layer above it failed.
const MNEMONIC = "legal winner thank year wave sausage worth useful legal winner thank yellow";
ok("A SEED PHRASE IS REFUSED BY THE DATABASE ITSELF — it contains whitespace",
  !trySql(`insert into public.crypto_wallets (user_id, chain, address)
           values ('${USER}', 'other', '${MNEMONIC}')`).ok);
ok("...and so is any multi-word value, on every chain",
  ["bitcoin", "ethereum", "solana", "other"].every(
    (c) => !trySql(`insert into public.crypto_wallets (user_id, chain, address)
                    values ('${USER}', '${c}', 'two words')`).ok));
ok("a value longer than any real address is refused",
  !trySql(`insert into public.crypto_wallets (user_id, chain, address)
           values ('${USER}', 'other', '${"x".repeat(129)}')`).ok);
ok("a blank address is refused",
  !trySql(`insert into public.crypto_wallets (user_id, chain, address) values ('${USER}', 'other', '   ')`).ok);
ok("an unknown chain is refused",
  !trySql(`insert into public.crypto_wallets (user_id, chain, address) values ('${USER}', 'dogechain', 'x')`).ok);
ok("a wallet can only ever be watch_only",
  !trySql(`update public.crypto_wallets set access_mode = 'spend' where user_id='${USER}'`).ok);
ok("the same address cannot be added twice on the same chain",
  !trySql(`insert into public.crypto_wallets (user_id, chain, address)
           values ('${USER}', 'ethereum', '0x742d35Cc6634C0532925a3b844Bc454e4438f44e')`).ok);

const otherWallet = tryAs("authenticated", OTHER, `select count(*) from public.crypto_wallets;`);
ok("a user cannot see somebody else's wallets", otherWallet.ok && otherWallet.out === "0");

// ===========================================================================
console.log("\n== 6. both migrations are idempotent ==");
// ===========================================================================

sql(`insert into public.trading_rules (user_id, original_text, kind, params)
     values ('${USER}', 'keep me', 'max_risk_percent', '{"percent":2}'::jsonb)`);

for (const migration of [
  "supabase/migrations/20260830000000_trading_journal.sql",
  "supabase/migrations/20260831000000_bank_crypto.sql",
]) {
  let reapplied = true;
  let error = "";
  try {
    execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-f", migration], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    reapplied = false;
    error = String(err.stderr || err.stdout || err.message);
  }
  ok(`${migration.split("/").pop()} applies a second time without error`, reapplied, error.slice(0, 300));
}

ok("the rule that was there is still there",
  sql(`select original_text from public.trading_rules where user_id='${USER}' and original_text='keep me'`) === "keep me");
ok("the trade that was there is still there, with its journal columns",
  sql(`select instrument || '|' || size::text from public.trades where id='${TRADE}'`) === "EURUSD|1.00000000");
ok("the constraints survive the re-run",
  !trySql(`update public.trades set session = 'atlantis' where id='${TRADE}'`).ok &&
  !trySql(`update public.crypto_wallets set access_mode = 'spend' where user_id='${USER}'`).ok);
ok("...and so do the grants",
  sql(`select has_table_privilege('authenticated', 'public.bank_transactions', 'insert')`) === "f" &&
  sql(`select has_table_privilege('authenticated', 'public.bank_transactions', 'select')`) === "t" &&
  sql(`select has_table_privilege('authenticated', 'public.rule_violations', 'update')`) === "f");

cleanup();
sql(`delete from public.trading_accounts where id = '${ACCOUNT}'`);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
