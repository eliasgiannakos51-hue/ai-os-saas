// DID THE HOLD COVER THE BILL? — asked of a real Postgres.
//
// scripts/db/reserve-accuracy.mjs prints one query and folds its rows,
// and both halves can be wrong in ways no static read catches:
//
//   * `metadata ? 'reservedCredits'` is the jsonb key-exists operator and
//     ALSO psql's placeholder character. A query that reads correctly in
//     the file can fail the moment a server sees it.
//   * `(metadata->>'reservedCredits')::numeric` casts TEXT. A JSON number
//     reads back as "4" and casts; a JSON null does not, and the
//     difference appears only against a real server.
//   * `count(*) filter (where ...)` over a jsonb cast is the whole
//     finding. An off-by-one in that predicate turns "this feature
//     under-reserves on a fifth of its requests" into a clean report.
//   * The fold decides which features are called OFFENDERS, and a ratio
//     computed over the wrong denominator is the exact failure the
//     instrument exists to catch in estimate.ts.
//
// Run: DATABASE_URL=... node scripts/tests/reserve-accuracy.dbtest.mjs
//  or: npm run test:db -- reserve-accuracy
import { execFileSync } from "node:child_process";
import { buildQuery, parsePsql, summarise, DEFAULT_DAYS } from "../db/reserve-accuracy.mjs";

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

// A SCRATCH SCHEMA, NEVER `drop schema public`. clarification-rate.dbtest
// records what that cost on 2026-09-07: 107 tables became 2 and the next
// suite in the alphabet died on a table this one had deleted. The query
// takes its table as a parameter for exactly this, and the checks below
// hold the SHIPPED default at public.ai_cost_log so the parameter cannot
// become a way for the real call to drift.
const PROBE = "zz_reserve_accuracy_probe";
psql([], `
  drop schema if exists ${PROBE} cascade;
  create schema ${PROBE};
  create table ${PROBE}.ai_cost_log (
    id bigserial primary key,
    feature text not null,
    credits_charged integer not null default 0,
    created_at timestamptz not null default now(),
    metadata jsonb not null default '{}'::jsonb
  );
`);

// THE FIXTURE IS THE ARGUMENT. Three features with three different
// verdicts, plus the two kinds of row that must not be counted.
psql([], `
  insert into ${PROBE}.ai_cost_log (created_at, feature, credits_charged, metadata) values
    -- 'honest': held 10, charged 8 and 9. Never breaches.
    (now() - interval '1 day', 'honest',      8, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'honest',      9, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '2 day', 'honest',      7, '{"reservedCredits":10,"estimatedCredits":9}'),
    -- 'understated': held 4, charged 19 twice and 5 once. THE DEFECT,
    -- and the shape estimate.ts's header describes for the Website
    -- Builder: shows 3, reserves 4, settles 19.
    (now() - interval '1 day', 'understated', 19, '{"reservedCredits":4,"estimatedCredits":3}'),
    (now() - interval '1 day', 'understated', 19, '{"reservedCredits":4,"estimatedCredits":3}'),
    (now() - interval '2 day', 'understated',  5, '{"reservedCredits":4,"estimatedCredits":3}'),
    -- 'occasional': ONE breach in twenty-one. Variance in a measured
    -- cost, not a wrong profile — it must appear in the table and NOT in
    -- the offender list, or every feature is an offender and the list
    -- sorts nothing. That is precisely how the static scan it replaced
    -- died.
    (now() - interval '1 day', 'occasional',  12, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    (now() - interval '1 day', 'occasional',   3, '{"reservedCredits":10,"estimatedCredits":9}'),
    -- A BYPASSED ACCOUNT: admin or active beta, reserves nothing by
    -- design. Counted, it is an infinite under-reserve on every single
    -- admin request and 'bypassed' tops the report for ever.
    (now() - interval '1 day', 'bypassed',    40, '{"reservedCredits":0,"estimatedCredits":38}'),
    -- A ROW THAT NEVER RESERVED AT ALL — a free-allowance settlement.
    -- No key, so no opinion about it.
    (now() - interval '1 day', 'no_reserve',  6, '{"source":"free_allowance"}'),
    -- OUTSIDE THE WINDOW, and it is the worst breach in the table, so a
    -- query that ignores created_at reports it as the headline.
    (now() - interval '400 day', 'honest',  900, '{"reservedCredits":4,"estimatedCredits":3}');
`);

console.log("== 1. the query runs at all, and the shipped one reads the real table ==");
let out = "";
let error = null;
try {
  out = psql(["-At", "-F", "\t"], buildQuery(DEFAULT_DAYS, `${PROBE}.ai_cost_log`));
} catch (err) {
  error = String(err.stderr ?? err.message).slice(0, 300);
}
check("the query is valid SQL against a real server", error === null, error ?? "");
check(
  "the default the CLI and --sql use is still public.ai_cost_log",
  buildQuery(DEFAULT_DAYS).includes("from public.ai_cost_log"),
  buildQuery(DEFAULT_DAYS)
);
check(
  "...and the probe schema is nowhere in it",
  !buildQuery(DEFAULT_DAYS).includes(PROBE),
  buildQuery(DEFAULT_DAYS)
);

const rows = parsePsql(out);
const by = new Map(rows.map((r) => [r.feature, r]));

console.log("\n== 2. which rows it counts, and which it leaves alone ==");
check(
  `three features, not five (${rows.length}: ${rows.map((r) => r.feature).join(", ")})`,
  rows.length === 3
);
check("a bypassed account, which reserves nothing by design, is excluded", !by.has("bypassed"));
check("a settlement that never reserved is excluded", !by.has("no_reserve"));
check(
  "the 400-day-old row is outside the window",
  (by.get("honest")?.settlements ?? 0) === 3,
  `honest rows counted: ${by.get("honest")?.settlements}`
);
check(
  "...and its 900-credit breach is not the headline",
  (by.get("honest")?.worstShortfall ?? 0) < 0,
  `honest worst shortfall: ${by.get("honest")?.worstShortfall}`
);

console.log("\n== 3. the breach count is the finding ==");
check(
  "a feature whose hold always covered the bill breaches 0 times",
  by.get("honest")?.overReserve === 0,
  JSON.stringify(by.get("honest"))
);
check(
  "the under-reserving feature breaches on every request",
  by.get("understated")?.overReserve === 3,
  JSON.stringify(by.get("understated"))
);
check(
  "...and its worst shortfall is the real gap, 19 charged against 4 held",
  by.get("understated")?.worstShortfall === 15,
  JSON.stringify(by.get("understated"))
);
check(
  "the occasionally-over feature is counted, once",
  by.get("occasional")?.overReserve === 1,
  JSON.stringify(by.get("occasional"))
);

console.log("\n== 4. what the estimate told the PERSON, beside what was held ==");
check(
  "an under-stating profile shows a charged/estimated ratio above 1",
  (by.get("understated")?.chargedOverEstimated ?? 0) > 1,
  JSON.stringify(by.get("understated"))
);
check(
  "an honest one comes out at or below 1",
  (by.get("honest")?.chargedOverEstimated ?? 99) <= 1,
  JSON.stringify(by.get("honest"))
);

console.log("\n== 5. the fold names offenders, and only offenders ==");
const s = summarise(rows);
check(
  "the under-reserving feature is named",
  s.offenders.some((r) => r.feature === "understated"),
  s.offenders.map((r) => r.feature).join(", ")
);
check(
  "one breach in twenty-two is NOT named — that is variance, not a wrong profile",
  !s.offenders.some((r) => r.feature === "occasional"),
  `occasional: ${by.get("occasional")?.overReserve} of ${by.get("occasional")?.settlements}`
);
check(
  "a feature that never breached is not named",
  !s.offenders.some((r) => r.feature === "honest"),
  s.offenders.map((r) => r.feature).join(", ")
);
check(
  "exactly one offender out of three features",
  s.offenders.length === 1,
  s.offenders.map((r) => r.feature).join(", ")
);
check(
  "the overall breach share is over the settlements that RESERVED",
  s.settlements === 3 + 3 + 25,
  `settlements: ${s.settlements}`
);

psql([], `drop schema if exists ${PROBE} cascade;`);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
