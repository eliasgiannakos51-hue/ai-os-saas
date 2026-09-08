// THE PER-DAY QUERY, ASKED OF A REAL POSTGRES.
//
// scripts/db/clarification-rate.mjs prints one query and folds its rows.
// Both halves can be wrong in ways no static read catches:
//
//   * `metadata ? 'clarification_verdict'` is the jsonb key-exists
//     operator, and it is also psql's placeholder character. A query that
//     looks right in the file can fail the moment it is run.
//   * `(metadata->>'clarification_paid')::boolean` casts TEXT. A JSON
//     `true` reads back as the string "true" and casts; a JSON `1` does
//     not, and the difference only appears against a real server.
//   * The fold decides the two numbers the item is actually about — how
//     often a question was asked, and how often the free reader settled
//     it without spending. Those are ratios, and a ratio computed over
//     the wrong denominator is the failure this whole item exists to fix.
//
// Run: DATABASE_URL=... node scripts/tests/clarification-rate.dbtest.mjs
//  or: npm run test:db -- clarification-rate
import { execFileSync } from "node:child_process";
import { buildQuery, parsePsql, summarise, DEFAULT_DAYS } from "../db/clarification-rate.mjs";

const DB = process.env.DATABASE_URL ?? process.env.PGDATABASE;
if (!DB) {
  console.log("SKIPPED: no DATABASE_URL / PGDATABASE — this file needs a real Postgres.");
  process.exit(0);
}

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const psql = (args, query) =>
  execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", ...args, "-c", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

// A table shaped like the real one, IN A SCRATCH SCHEMA OF ITS OWN. The
// migration that creates public.ai_cost_log carries a dozen columns this
// query never reads; what it needs is created_at, real_cost_eur and
// metadata, and building only those keeps this file runnable against a
// bare database.
//
// THE FIRST VERSION MADE ROOM BY DELETING THE DATABASE.
//
//     drop schema if exists public cascade; create schema public;
//
// Correct against the throwaway server `npm run test:db` provisions;
// catastrophic against the staging one that script's own header invites
// somebody to point it at, and quietly wrong even on the throwaway:
// measured 2026-09-07, the database had 2 tables afterwards where it had
// had 107, and cost-alert-once.dbtest.mjs — the next suite in the
// alphabet — died on `relation "public.cost_alert_log" does not exist`.
// A filtered run (`npm run test:db -- clarification-rate`) has no next
// suite, which is why the round that shipped this saw nothing.
//
// pack-rate-race.dbtest.mjs had already written the answer down:
// "`truncate user_credits` on a shared database is other suites' data",
// and it builds zz_pack_rate_race_probe instead. This is the same answer,
// one level up — a schema rather than a table, because the query names a
// schema-qualified table and scripts/db/clarification-rate.mjs takes it as
// a parameter for exactly this.
//
// db-migrations.test.mjs section 2b is what stops the next one.
const PROBE = "zz_clarification_rate_probe";
psql([], `
  drop schema if exists ${PROBE} cascade;
  create schema ${PROBE};
  create table ${PROBE}.ai_cost_log (
    id bigserial primary key,
    created_at timestamptz not null default now(),
    real_cost_eur numeric,
    metadata jsonb not null default '{}'::jsonb
  );
`);

// Two days, all three verdicts, and the shapes that break a careless cast.
psql([], `
  insert into ${PROBE}.ai_cost_log (created_at, real_cost_eur, metadata) values
    (now() - interval '1 day', 0,      '{"clarification_verdict":"clear","clarification_paid":false,"clarification_asked":false}'),
    (now() - interval '1 day', 0,      '{"clarification_verdict":"clear","clarification_paid":false,"clarification_asked":false}'),
    (now() - interval '1 day', 0.0021, '{"clarification_verdict":"vague","clarification_paid":true,"clarification_asked":true}'),
    (now() - interval '2 day', 0,      '{"clarification_verdict":"clear","clarification_paid":false,"clarification_asked":false}'),
    (now() - interval '2 day', 0.0018, '{"clarification_verdict":"unsure","clarification_paid":true,"clarification_asked":false}'),
    -- A ROW FROM ANOTHER FEATURE, with no verdict at all. It must not be
    -- counted: the denominator is "requests that ran the check", and
    -- every website generation and chat message in the log would swamp it.
    (now() - interval '1 day', 0.4,    '{"route":"/api/websites/generate"}'),
    -- OUTSIDE THE WINDOW.
    (now() - interval '400 day', 0,    '{"clarification_verdict":"clear","clarification_paid":false,"clarification_asked":false}');
`);

console.log("== 1. the query runs at all ==");
// THE CONDITION IS THE ERROR, not `true` in the happy branch.
//
// `check(..., true)` cannot go red, and scripts/tests/gate-vacuity is
// right to refuse it: a try/catch that asserts `true` on success looks
// like a check and is a comment. The real condition is "psql returned
// without throwing", which is what `error` records.
let out = "";
let error = null;
try {
  out = psql(["-At", "-F", "\t"], buildQuery(DEFAULT_DAYS, `${PROBE}.ai_cost_log`));
} catch (err) {
  error = String(err.stderr ?? err.message).slice(0, 300);
}
check("the query is valid SQL against a real server", error === null, error ?? "");
// AND THE ONE THE PRODUCT ACTUALLY RUNS IS THE DEFAULT. The parameter
// above exists so this suite can build five rows without touching the
// real table; it would be worth nothing if the shipped call read
// somewhere else. `--sql`, the CLI and the paste-into-Supabase pack all
// take the default, so the default is what has to be gated.
check(
  "the default the CLI and --sql use is still public.ai_cost_log",
  buildQuery(DEFAULT_DAYS).includes("from public.ai_cost_log"),
  buildQuery(DEFAULT_DAYS)
);
check(
  "...and the probe table is nowhere in it",
  !buildQuery(DEFAULT_DAYS).includes(PROBE),
  buildQuery(DEFAULT_DAYS)
);

const rows = parsePsql(out);
console.log("\n== 2. what it counts, and what it leaves alone ==");
{
  // FOUR GROUPS, NOT THREE. The query groups by (day, verdict), so two
  // days that each carry `clear` are two rows and not one — which is the
  // whole point of a PER-DAY report and was the first draft of this check
  // getting the arithmetic wrong rather than the query.
  check(
    `one row per (day, verdict) — four of them (${rows.length})`,
    rows.length === 4,
    JSON.stringify(rows)
  );
  const clearDay1 = rows.find((r) => r.verdict === "clear" && r.requests === 2);
  check("the two clear rows of one day are one row of two", Boolean(clearDay1), JSON.stringify(rows));
  check(
    "a row with no verdict is not counted",
    rows.reduce((n, r) => n + r.requests, 0) === 5,
    `${rows.reduce((n, r) => n + r.requests, 0)} — the /api/websites/generate row must be excluded`
  );
  check(
    "a row outside the window is not counted",
    !rows.some((r) => r.requests > 2),
    JSON.stringify(rows)
  );
  const vague = rows.find((r) => r.verdict === "vague");
  check("the paid flag survives the round trip", vague?.paidChecks === 1, JSON.stringify(vague));
  check("...and so does the asked flag", vague?.questionsAsked === 1, JSON.stringify(vague));
  const unsure = rows.find((r) => r.verdict === "unsure");
  check(
    "a paid check that asked NOTHING is counted paid and not asked",
    unsure?.paidChecks === 1 && unsure?.questionsAsked === 0,
    JSON.stringify(unsure)
  );
  check("the cost is summed per day and verdict", Math.abs((vague?.costEur ?? 0) - 0.0021) < 1e-9, JSON.stringify(vague));
}

console.log("\n== 3. the two ratios the item is about ==");
{
  const s = summarise(rows);
  console.log(`        ${JSON.stringify(s)}`);
  check("five requests carried a verdict", s.total === 5);
  check("three were clear", s.clear === 3);
  check("one vague, one unsure", s.vague === 1 && s.unsure === 1);
  // ASKED IS NOT THE SAME AS PAID, and conflating them is the easy error:
  // the unsure row paid for a model call and the model said "no question
  // needed". A rate that counted it as a question asked would report the
  // product interrupting people it did not interrupt.
  check("one question was actually asked", s.asked === 1);
  check("two model calls were paid for", s.paid === 2);
  check("asked share is 1 in 5", Math.abs(s.askedShare - 0.2) < 1e-9, String(s.askedShare));
  check("free share is 3 in 5", Math.abs(s.freeShare - 0.6) < 1e-9, String(s.freeShare));
  // AN EMPTY WINDOW IS NOT A RATE OF ZERO.
  const empty = summarise([]);
  check("no data returns null rather than 0%", empty.askedShare === null && empty.freeShare === null);
}

// THE SCRATCH SCHEMA GOES AWAY. Left behind it would be a schema nobody
// created on purpose in whatever database this was pointed at, and the
// next run would find it and drop it — which is the same class of surprise
// this file was fixed for, only smaller.
psql([], `drop schema if exists ${PROBE} cascade;`);
check(
  "the scratch schema was removed",
  psql(["-At"], `select count(*) from pg_namespace where nspname = '${PROBE}'`).trim() === "0"
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
