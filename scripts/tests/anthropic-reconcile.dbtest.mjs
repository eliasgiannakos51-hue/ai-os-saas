// THE SAME ARITHMETIC, DONE BY POSTGRES, ON ROWS THE APP REALLY WRITES.
//
// scripts/db/anthropic-reconcile.mjs carries the reconciliation twice: as
// three SQL queries somebody pastes into the production editor, and as
// repriceModel() in JavaScript. The SQL is the one that answers the
// question for real, and it is the one nothing could execute — so this
// file executes it, against fixtures built by the actual CostAccumulator
// rather than by hand.
//
// FIVE THINGS ONLY A LIVE SERVER CAN SAY:
//
//   1. THAT THE QUERIES PARSE AT ALL. Three CTE chains with lateral
//      joins, a compiled VALUES rate table and eleven UNION ALL branches
//      are not something a regex can pronounce valid. A gate that reads
//      the query text and declares it good is a gate that has never run
//      it.
//
//   2. THAT THE TWO IMPLEMENTATIONS AGREE. Every model in every fixture
//      row is repriced by the SQL and by repriceModel(), and the two
//      figures are compared. A difference is a failure here, because the
//      SQL is what the owner will read the answer off.
//
//   3. THAT A ROW WITH NO MODEL SPLIT IS COUNTED, NOT DROPPED. Rows
//      settled before V5 #12 have no metadata.modelBreakdown and never
//      will. The failure mode this file exists to catch is the quiet one:
//      a query that reports beautifully on the 12% of the month it can
//      see. Fixture row 6 is such a row, and its money has to appear on
//      line 3 of query 2 and in its own bucket in query 3.
//
//   4. THAT THE DIFFERENCE LINE CAN BE NON-ZERO. Sonnet 5 is booked at
//      $3/$15 and invoiced at $2/$10 — a deliberate over-charge declared
//      in DIVERGENCES. Line 9 has to show it. A reconciliation that
//      always reports agreement is agreeing with itself.
//
//   5. THAT AN UNPRICEABLE MODEL IS EXCLUDED RATHER THAN ZEROED. Mythos
//      has no published rate in that file. Pricing it at nothing would
//      shrink the difference and make the report look better the less it
//      knew, so it is excluded from lines 7-9 and stated on line 10.
//
// Run: DATABASE_URL=... node scripts/tests/anthropic-reconcile.dbtest.mjs
//  or: npm run test:db -- anthropic-reconcile
import { execFileSync } from "node:child_process";
import {
  buildInvoiceQuery,
  buildReconcileQuery,
  buildCoverageQuery,
  repriceModel,
  divergenceProblems,
  parsePsql,
} from "../db/anthropic-reconcile.mjs";

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
const near = (a, b, eps = 1e-6) => Math.abs(Number(a) - Number(b)) < eps;

const psql = (sql) =>
  execFileSync(
    "psql",
    [...(process.env.DATABASE_URL ? [process.env.DATABASE_URL] : []), "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );

// A SCRATCH SCHEMA, NOT public. The fixtures need an ai_cost_log with
// rows of their own choosing, and `npm run test:db`'s own header invites
// somebody to point DATABASE_URL at a staging database. Making room in
// `public` is how this repository lost 105 tables on 2026-09-07; the
// schema below is created and dropped, and nothing the migrations build
// is touched.
const SCHEMA = "reconcile_probe";
const TABLE = `${SCHEMA}.ai_cost_log`;
const MONTH = "2026-08";

// The fixture breakdowns are produced by the REAL CostAccumulator, so the
// shape under test is the shape settlement writes. A hand-typed JSON
// literal here would prove the queries can read a JSON literal.
const { loadTs } = await import("./load-ts.mjs");
const { CostAccumulator } = await loadTs("src/lib/billing/cost-accumulator.ts");

function acc(build) {
  const a = new CostAccumulator();
  build(a);
  return { breakdown: a.byModel(), usd: Number(a.totalUsdCost.toFixed(8)) };
}

// R1  two models in ONE action — the case ai_cost_log's summed columns
//     cannot represent and this whole item exists for.
const r1 = acc((a) => {
  a.record("classification", { input_tokens: 1_000_000, output_tokens: 100_000 }, "claude-haiku-4-5");
  a.record(
    "generation",
    {
      input_tokens: 200_000,
      output_tokens: 20_000,
      cache_creation_input_tokens: 100_000,
      cache_read_input_tokens: 400_000,
    },
    // A DATED SNAPSHOT ID. It has to land on the alias key, or the
    // invoice comparison gets a model the console has never heard of.
    "claude-opus-5-20260101"
  );
});
// R2  the declared divergence: booked $3/$15, invoiced $2/$10.
const r2 = acc((a) => {
  a.record("generation", { input_tokens: 1_000_000, output_tokens: 200_000 }, "claude-sonnet-5");
});
// R3  a batch call: tokens whole, money halved.
const r3 = acc((a) => {
  a.recordBatch("generation", { input_tokens: 2_000_000 }, "claude-sonnet-4-6", "msgbatch_probe");
});
// R4  a provider that will never appear on an Anthropic invoice.
const r4 = acc((a) => {
  a.recordExternal("speak", { provider: "elevenlabs", usdCost: 0.75, units: 900, unit: "characters" });
});
// R5  a model in MODEL_PRICING_USD with no published rate in the script.
const r5 = acc((a) => {
  a.record("generation", { input_tokens: 1_000_000 }, "claude-mythos-5");
});
// R9  the web_search server tool, billed per request rather than per token.
const r9 = acc((a) => {
  a.record("web_search", { server_tool_use: { web_search_requests: 30 } }, "claude-opus-5");
});

const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const row = (day, meta, usd, credits) =>
  `(timestamptz '2026-08-${day} 12:00:00+00', ${meta}, ${usd}, ${(usd * 0.92).toFixed(8)}, ${credits})`;
const withSplit = (r, extra = {}) => lit({ planSlug: "growth", ...extra, modelBreakdown: r.breakdown });

try {
  psql(`
    drop schema if exists ${SCHEMA} cascade;
    create schema ${SCHEMA};
    create table ${TABLE} (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null,
      metadata jsonb not null default '{}'::jsonb,
      real_cost_usd numeric(18,8) not null default 0,
      real_cost_eur numeric(18,8) not null default 0,
      credits_charged integer not null default 0
    );
    insert into ${TABLE} (created_at, metadata, real_cost_usd, real_cost_eur, credits_charged) values
      ${row("02", withSplit(r1), r1.usd, 100)},
      ${row("03", withSplit(r2), r2.usd, 200)},
      ${row("04", withSplit(r3), r3.usd, 50)},
      ${row("05", withSplit(r4), r4.usd, 10)},
      ${row("06", withSplit(r5), r5.usd, 400)},
      ${row("07", lit({ planSlug: "free" }), 4.2, 5)},
      ${row("08", lit({ planSlug: "free", modelBreakdown: {} }), 0, 0)},
      ${row("09", withSplit(r9), r9.usd, 3)},
      (timestamptz '2026-09-02 12:00:00+00', ${withSplit(r1)}, 999, 919, 9999);
  `);

  console.log("\n== 0. the price register is exact in both directions ==");
  const problems = divergenceProblems();
  check("every booked model is priced here or declared", problems.length === 0, problems.join("; "));

  console.log("\n== 1. the three queries run on a real server ==");
  const coverage = parsePsql(psql(buildCoverageQuery(MONTH, TABLE)));
  const invoice = parsePsql(psql(buildInvoiceQuery(MONTH, TABLE)));
  const recon = parsePsql(psql(buildReconcileQuery(MONTH, TABLE)));
  check("coverage returns rows", coverage.length === 3, JSON.stringify(coverage));
  check("the invoice shape returns rows", invoice.length > 0, String(invoice.length));
  check("the reconciliation returns its eleven lines", recon.length === 11, String(recon.length));

  console.log("\n== 2. the month boundary is half-open ==");
  const totalRow = recon.find((r) => r[0] === "1");
  check("the September row is outside the window", Number(totalRow[3]) === 8, JSON.stringify(totalRow));
  check(
    "and its money is not in the total",
    near(totalRow[2], r1.usd + r2.usd + r3.usd + r4.usd + r5.usd + 4.2 + 0 + r9.usd),
    `${totalRow[2]}`
  );

  console.log("\n== 3. a row with no model split is counted, not dropped ==");
  const byState = new Map(coverage.map((r) => [r[0], r]));
  check(
    "the pre-V5#12 row has its own bucket",
    byState.get("no split recorded (settled before V5 #12)")?.[1] === "1",
    JSON.stringify(coverage)
  );
  check(
    "with its money on it",
    near(byState.get("no split recorded (settled before V5 #12)")?.[2], 4.2),
    JSON.stringify(coverage)
  );
  check(
    "an EMPTY split is a third state, not the same as a missing one",
    byState.get("split recorded but EMPTY (a bug — nothing was accumulated)")?.[1] === "1",
    JSON.stringify(coverage)
  );
  check(
    "and the reconciliation says the same on line 3",
    near(recon.find((r) => r[0] === "3")[2], 4.2),
    JSON.stringify(recon.find((r) => r[0] === "3"))
  );

  console.log("\n== 4. the SQL and repriceModel() agree, model by model ==");
  const expected = new Map();
  for (const r of [r1, r2, r3, r4, r5, r9]) {
    for (const [key, usage] of Object.entries(r.breakdown)) {
      const p = repriceModel(key, usage);
      const prev = expected.get(p.model) ?? { booked: 0, list: 0, priceable: p.listUsd !== null };
      prev.booked += usage.usdCost;
      if (p.listUsd !== null) prev.list += p.listUsd;
      expected.set(p.model, prev);
    }
  }
  // Query 1 gives tokens per (model, kind); summing its invoice_usd back
  // up is the comparison that catches a per-kind rate applied to the
  // wrong kind — a mistake the per-model total in query 2 would hide.
  const sqlByModel = new Map();
  for (const [model, , , , , , usd] of invoice) {
    if (usd === "" || usd === undefined) continue;
    sqlByModel.set(model, (sqlByModel.get(model) ?? 0) + Number(usd));
  }
  for (const [model, exp] of expected) {
    if (!exp.priceable) continue;
    check(
      `query 1 prices ${model} exactly as repriceModel does`,
      near(sqlByModel.get(model), exp.list, 1e-5),
      `sql ${sqlByModel.get(model)} vs js ${exp.list}`
    );
  }
  check(
    "a model with no published rate is reported with a null rate, not priced",
    invoice.some((r) => r[0] === "claude-mythos-5" && r[7] === "no published rate in this script"),
    JSON.stringify(invoice.filter((r) => r[0] === "claude-mythos-5"))
  );
  check(
    "the web_search line is counted in searches, not tokens",
    invoice.some((r) => r[2] === "web_search" && r[3] === "searches" && r[4] === "30" && near(r[6], 0.3)),
    JSON.stringify(invoice.filter((r) => r[2] === "web_search"))
  );

  console.log("\n== 5. the reconciliation walk ==");
  const line = (n) => recon.find((r) => r[0] === String(n));
  const anthropicPriceable = [...expected.entries()].filter(
    ([model, e]) => e.priceable && !model.startsWith("external:")
  );
  const bookedPriceable = anthropicPriceable.reduce((s, [, e]) => s + e.booked, 0);
  const listPriceable = anthropicPriceable.reduce((s, [, e]) => s + e.list, 0);

  check("line 4 equals line 2 — the split covers every attributed row", near(line(4)[2], line(2)[2]), `${line(4)[2]} vs ${line(2)[2]}`);
  check("line 5 holds only the external provider", near(line(5)[2], 0.75), JSON.stringify(line(5)));
  check("line 6 holds only the batch call", near(line(6)[2], r3.usd), JSON.stringify(line(6)));
  check("line 7 is what we booked on priceable Anthropic models", near(line(7)[2], bookedPriceable), `${line(7)[2]} vs ${bookedPriceable}`);
  check("line 8 is the same tokens at the published rate", near(line(8)[2], listPriceable), `${line(8)[2]} vs ${listPriceable}`);
  check("line 9 is the difference, and it is NOT zero", near(line(9)[2], listPriceable - bookedPriceable) && Number(line(9)[2]) !== 0, JSON.stringify(line(9)));
  check(
    "line 9 is exactly the Sonnet 5 over-charge the register declares (-2)",
    near(line(9)[2], -2),
    JSON.stringify(line(9))
  );
  check("line 10 states the unpriceable model instead of zeroing it", near(line(10)[2], r5.usd) && Number(r5.usd) > 0, JSON.stringify(line(10)));
  check("the unpriceable model is NOT inside line 7", !near(line(7)[2], bookedPriceable + r5.usd), JSON.stringify(line(7)));

  console.log("\n== 6. a batch line is halved in money and whole in tokens ==");
  const batchInput = invoice.find((r) => r[0] === "claude-sonnet-4-6" && r[2] === "input");
  check("the tokens are not halved", batchInput?.[4] === "2000000", JSON.stringify(batchInput));
  check("the money is", near(batchInput?.[6], 3), JSON.stringify(batchInput));
  check("and the row says it was batched", batchInput?.[1] === "batch", JSON.stringify(batchInput));

  console.log("\n== 7. a dated snapshot id lands on the alias the console names ==");
  check(
    "claude-opus-5-20260101 was recorded as claude-opus-5",
    invoice.some((r) => r[0] === "claude-opus-5") && !invoice.some((r) => r[0].includes("20260101")),
    JSON.stringify(invoice.map((r) => r[0]))
  );
} finally {
  psql(`drop schema if exists ${SCHEMA} cascade;`);
}

console.log(`\n  ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
