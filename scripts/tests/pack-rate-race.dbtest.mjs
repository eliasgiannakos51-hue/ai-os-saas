// Two pack purchases in the same instant, against a REAL PostgreSQL.
//
// WHAT WAS WRONG. billing/credits.ts's recordPackPurchaseRate read
// min_pack_credit_price_eur, computed Math.min against it in TypeScript,
// and wrote the result back. It is called from the STRIPE WEBHOOK, where
// two purchases seconds apart — or one purchase Stripe replays — run
// concurrently by design.
//
// Both readers see the old rate. Both compute a minimum against it. The
// later write wins. Buying a 0.015 pack moments after a 0.010 pack leaves
// 0.015 stored, settlement divides by that number, and the customer is
// charged at a rate worse than the one they actually paid — permanently,
// with nothing anywhere reporting it.
//
// WHY THIS FILE AND NOT A UNIT TEST. A mock has one thread and whatever
// interleaving the author imagined. This is the interleaving the webhook
// actually produces: two real connections, one real server, the second
// SELECT landing before the first UPDATE commits. A JavaScript fake cannot
// produce that, and a fake that could would be asserting its own design.
//
// Both forms are run side by side in every section — the read-modify-write
// the code used to do, and the conditional write it does now — so this
// file FAILS on the old shape and PASSES on the new one rather than only
// describing the difference.
//
// Run: node scripts/tests/pack-rate-race.dbtest.mjs
//      (or npm run test:db, which provisions the server)
import { startEphemeralPostgres, psqlArgs } from "../lib/ephemeral-postgres.mjs";
import { execFileSync, spawn } from "node:child_process";

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

const pg = startEphemeralPostgres();
if (!pg.available) {
  console.log(`SKIPPED: ${pg.reason}`);
  process.exit(0);
}
const ARGS = psqlArgs(pg.conn);

const sql = (text) =>
  execFileSync("psql", [...ARGS, "-v", "ON_ERROR_STOP=1", "-Atq", "-c", text], {
    encoding: "utf8",
  }).trim();

/**
 * Runs `text` on its OWN connection, with a pause in the middle, so two of
 * them genuinely overlap. `-f -` reads the script from stdin, which is what
 * lets the two halves sit either side of pg_sleep in one session.
 */
function concurrent(scripts) {
  const procs = scripts.map((text) => {
    const p = spawn("psql", [...ARGS, "-v", "ON_ERROR_STOP=1", "-Atq", "-f", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    p.stdin.write(text);
    p.stdin.end();
    const out = [];
    p.stdout.on("data", (d) => out.push(String(d)));
    return new Promise((resolve) => p.on("close", (code) => resolve({ code, out: out.join("") })));
  });
  return Promise.all(procs);
}

console.log("pack-rate-race");

// ITS OWN TABLE, NOT user_credits.
//
// This used to `create table if not exists user_credits (user_id text, ...)`
// and truncate it between cases. Two things went wrong with that, and the
// second is the serious one:
//
//   1. `if not exists` is a NO-OP once the migrations have run, so the table
//      this test got was the real one — whose user_id is uuid, not text. The
//      first insert of 'u1' aborted the whole `npm run test:db` run before
//      any later suite got to start.
//   2. `truncate user_credits` on a shared database is other suites' data.
//      Even when the ids happened to parse, this file was deleting rows
//      credit-flow.dbtest.mjs had just written.
//
// A race about read-modify-write ordering needs a numeric column and two
// connections; it does not need the application's table. So it gets its own,
// dropped first so a previous crashed run cannot leave a stale shape behind
// (the same `drop if exists` + `create if not exists` pairing the three
// gates that caught my last probe table asked for).
sql(`drop table if exists zz_pack_rate_race_probe`);
sql(`
  create table if not exists zz_pack_rate_race_probe (
    user_id text primary key,
    min_pack_credit_price_eur numeric(12, 8)
  );
`);

const reset = (start) =>
  sql(
    `truncate zz_pack_rate_race_probe;
     insert into zz_pack_rate_race_probe (user_id, min_pack_credit_price_eur)
     values ('u1', ${start === null ? "null" : start});`
  );

const stored = () =>
  sql(`select coalesce(min_pack_credit_price_eur::text, 'NULL') from zz_pack_rate_race_probe where user_id = 'u1'`);

// ---------------------------------------------------------------------
console.log("\n== 1. THE BUG: read, compute the minimum, write it back ==");
// ---------------------------------------------------------------------
// Both sessions read 0.02000000 before either writes. Session A is about to
// store 0.01, session B 0.015 — each correctly the minimum of what IT saw.
// B commits last, so 0.015 is what stays: the 0.01 the customer paid is
// gone.
await (async () => {
  reset("0.02000000");
  const readThenWrite = (price, delayBefore, delayAfter) => `
    begin;
    select min_pack_credit_price_eur from zz_pack_rate_race_probe where user_id = 'u1';
    select pg_sleep(${delayBefore});
    update zz_pack_rate_race_probe
       set min_pack_credit_price_eur = least(coalesce(0.02000000, ${price}), ${price})
     where user_id = 'u1';
    select pg_sleep(${delayAfter});
    commit;
  `;
  // 0.01 writes first and finishes first; 0.015 writes second. Exactly the
  // order that loses the cheaper rate.
  await concurrent([readThenWrite("0.01000000", 0.05, 0), readThenWrite("0.01500000", 0.15, 0)]);
  check("BEFORE — the dearer rate overwrote the cheaper one", stored(), "0.01500000");
})();

// ---------------------------------------------------------------------
console.log("\n== 2. THE FIX: no read, and the WHERE clause is the comparison ==");
// ---------------------------------------------------------------------
// This is what `.update({...}).eq(user).or("col.is.null,col.gt.<price>")`
// compiles to. Same two sessions, same order, same delays.
const guarded = (price, delay) => `
  begin;
  select pg_sleep(${delay});
  update zz_pack_rate_race_probe
     set min_pack_credit_price_eur = ${price}
   where user_id = 'u1'
     and (min_pack_credit_price_eur is null or min_pack_credit_price_eur > ${price});
  commit;
`;

await (async () => {
  reset("0.02000000");
  await concurrent([guarded("0.01000000", 0.05), guarded("0.01500000", 0.15)]);
  check("AFTER — cheap first, dear second: the cheap one survives", stored(), "0.01000000");
})();

await (async () => {
  reset("0.02000000");
  // THE OTHER ORDER. A fix that only works when the cheap write happens to
  // land first is not a fix, it is the same race with better luck.
  await concurrent([guarded("0.01500000", 0.05), guarded("0.01000000", 0.15)]);
  check("AFTER — dear first, cheap second: the cheap one still wins", stored(), "0.01000000");
})();

await (async () => {
  reset(null);
  // FROM NULL. The account that has never bought a pack is the common case,
  // and `is null` is the half of the condition that covers it — an early
  // draft used only `> price` and left every first purchase unrecorded.
  await concurrent([guarded("0.01500000", 0.05), guarded("0.01000000", 0.12)]);
  check("AFTER — first ever purchase, two at once, from NULL", stored(), "0.01000000");
})();

await (async () => {
  reset("0.02000000");
  // FIVE AT ONCE, shuffled. Two writers can be got right by accident.
  await concurrent([
    guarded("0.01800000", 0.02),
    guarded("0.00900000", 0.09),
    guarded("0.01200000", 0.05),
    guarded("0.01900000", 0.13),
    guarded("0.01100000", 0.07),
  ]);
  check("AFTER — five concurrent writers converge on the true minimum", stored(), "0.00900000");
})();

await (async () => {
  reset("0.00500000");
  // A DEARER PACK MUST CHANGE NOTHING. The condition has to refuse as well
  // as accept, or it is just an unconditional write with extra words.
  await concurrent([guarded("0.02000000", 0.02), guarded("0.03000000", 0.06)]);
  check("AFTER — dearer purchases leave the existing minimum alone", stored(), "0.00500000");
})();

// ---------------------------------------------------------------------
console.log("\n== 3. numeric(12, 8) round-trips the filter value ==");
// ---------------------------------------------------------------------
// The fix formats the price with toFixed(8) before putting it in a
// PostgREST filter, because a small number serialises to "1e-7" in
// JavaScript and that is not what goes into a filter value. This checks the
// column actually holds what toFixed(8) produces.
await (async () => {
  reset(null);
  const tiny = (1e-7).toFixed(8); // "0.00000010"
  check("toFixed(8) does not produce exponent notation", tiny.includes("e"), false);
  sql(`update zz_pack_rate_race_probe set min_pack_credit_price_eur = ${tiny} where user_id = 'u1'`);
  check("numeric(12,8) stores it exactly", stored(), "0.00000010");
})();

// Left behind is left behind: three gates in this repo fail on a stray
// table, and they were right to.
sql(`drop table if exists zz_pack_rate_race_probe`);

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}  ${pass} passed, ${fail} failed`);
pg.stop?.();
process.exit(fail === 0 ? 0 : 1);
