// THE LEDGER HAS TO MEET A BILL, AND THIS IS WHAT MAKES THAT CHECKABLE
// WITHOUT A DATABASE.
//
// scripts/tests/anthropic-reconcile.dbtest.mjs runs the three queries
// against a real Postgres and compares every figure with the JavaScript
// repricer. It is the stronger proof and it is out of the mutation
// sweep's reach — no *.dbtest.mjs can be driven by it, because the sweep
// has no server. So the parts that can be exercised without one are
// exercised here: the price register, the repricer, the window
// arithmetic, the shape of the SQL, and the accumulator method that puts
// a model on a cost-log row in the first place.
//
// THE ONE THING THIS FILE IS NOT. It cannot tell you whether Anthropic's
// published rates are still what INVOICE_RATES_USD says. Nothing in this
// repository can: that is a fact about a web page, and the only check
// for it is the difference on line 9 of query 2 against a real invoice.
// Said here rather than left implicit, because "the reconciliation gate
// is green" must not be read as "the ledger agrees with the bill".
//
// Run: node scripts/tests/anthropic-reconcile.test.mjs
import { readFileSync } from "node:fs";
import {
  INVOICE_RATES_USD,
  DIVERGENCES,
  PRICING_SOURCE,
  WEB_SEARCH_USD_PER_QUERY,
  CONSOLE_STEPS,
  readBookedRates,
  divergenceProblems,
  rateRows,
  repriceModel,
  monthWindow,
  defaultMonth,
  buildInvoiceQuery,
  buildReconcileQuery,
  buildCoverageQuery,
  parseArgs,
} from "../db/anthropic-reconcile.mjs";

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
const near = (a, b, eps = 1e-9) => Math.abs(Number(a) - Number(b)) < eps;

console.log("== 1. the price register is exact, in both directions ==");
const booked = readBookedRates();
check(
  `it reads real rows out of ${PRICING_SOURCE} (${Object.keys(booked).length} models)`,
  Object.keys(booked).length >= 8,
  Object.keys(booked).join(", ")
);
check(
  "and reads them correctly — Sonnet 4.6 is booked at 3/15",
  booked["claude-sonnet-4-6"]?.input === 3 && booked["claude-sonnet-4-6"]?.output === 15,
  JSON.stringify(booked["claude-sonnet-4-6"])
);
check("nothing is undeclared today", divergenceProblems().length === 0, divergenceProblems().join("; "));

// THE CHECKER ITSELF, PUT THROUGH ALL FOUR OF ITS BRANCHES. A register
// that reports "no problems" because its comparison stopped comparing is
// the shape docs/shapes.md calls a gate that deletes what it measures.
check(
  "a model in the pricing table that this file cannot price reddens it",
  divergenceProblems({ ...booked, "claude-newthing-9": { input: 7, output: 35 } }).some((p) =>
    p.includes("claude-newthing-9")
  ),
  JSON.stringify(divergenceProblems({ ...booked, "claude-newthing-9": { input: 7, output: 35 } }))
);
check(
  "a model whose booked rate quietly changed reddens it",
  divergenceProblems({ ...booked, "claude-haiku-4-5": { input: 2, output: 5 } }).some((p) =>
    p.includes("claude-haiku-4-5")
  ),
  JSON.stringify(divergenceProblems({ ...booked, "claude-haiku-4-5": { input: 2, output: 5 } }))
);
check(
  "a declared divergence that has stopped diverging reddens it",
  divergenceProblems({ ...booked, "claude-sonnet-5": { input: 2, output: 10 } }).some(
    (p) => p.includes("claude-sonnet-5") && p.includes("delete")
  ),
  JSON.stringify(divergenceProblems({ ...booked, "claude-sonnet-5": { input: 2, output: 10 } }))
);
const dropped = { ...booked };
delete dropped["claude-haiku-4-5"];
check(
  "a model priced here that the app has stopped booking reddens it",
  divergenceProblems(dropped).some((p) => p.includes("not in " + PRICING_SOURCE)),
  JSON.stringify(divergenceProblems(dropped))
);
check(
  "every declared divergence carries a reason, not a shrug",
  DIVERGENCES.every((d) => typeof d.why === "string" && d.why.length >= 40),
  JSON.stringify(DIVERGENCES.map((d) => [d.model, (d.why ?? "").length]))
);

console.log("\n== 2. the published cache ratios, not invented ones ==");
const rows = new Map(rateRows().map(([m, k, v]) => [`${m}|${k}`, v]));
check("a 5-minute cache write is 1.25x input", near(rows.get("claude-opus-5|cache_write_5m"), 5 * 1.25));
check("a 1-hour cache write is 2x input", near(rows.get("claude-opus-5|cache_write_1h"), 5 * 2));
check("a cache read is 0.1x input", near(rows.get("claude-opus-5|cache_read"), 0.5));
check("every priced model gets all five kinds", rateRows().length === Object.keys(INVOICE_RATES_USD).length * 5, String(rateRows().length));
check("a web search is $10 per thousand", near(WEB_SEARCH_USD_PER_QUERY, 0.01));

console.log("\n== 3. the repricer ==");
check(
  "Sonnet 5 reprices at the published 2/10, not the booked 3/15",
  near(repriceModel("claude-sonnet-5", { inputTokens: 1e6, outputTokens: 2e5 }).listUsd, 4),
  String(repriceModel("claude-sonnet-5", { inputTokens: 1e6, outputTokens: 2e5 }).listUsd)
);
check(
  "a batch line is halved",
  near(repriceModel("batch:claude-sonnet-4-6", { inputTokens: 2e6 }).listUsd, 3),
  String(repriceModel("batch:claude-sonnet-4-6", { inputTokens: 2e6 }).listUsd)
);
check(
  "and is still labelled a batch line",
  repriceModel("batch:claude-sonnet-4-6", { inputTokens: 2e6 }).billing === "batch"
);
check(
  "a non-Anthropic provider prices to null, never to zero",
  repriceModel("external:elevenlabs", { inputTokens: 0 }).listUsd === null
);
check(
  "a model with no published rate prices to null, never to zero",
  repriceModel("claude-mythos-5", { inputTokens: 1e6 }).listUsd === null
);
check(
  "web searches are charged per request",
  near(repriceModel("claude-opus-5", { webSearches: 30 }).listUsd, 0.3)
);
check(
  "a cache read costs a tenth of an input token, not the same",
  near(repriceModel("claude-opus-5", { cacheReadTokens: 1e6 }).listUsd, 0.5)
);
check(
  "a 1-hour cache write costs 2x, not 1.25x",
  near(repriceModel("claude-opus-5", { cacheWrite1hTokens: 1e6 }).listUsd, 10)
);
check(
  "a missing field contributes nothing rather than NaN",
  near(repriceModel("claude-opus-5", { inputTokens: 1e6, cacheWrite1hTokens: undefined }).listUsd, 5)
);

console.log("\n== 4. the month window is half-open and cannot be fudged ==");
check("August ends where September begins", monthWindow("2026-08").stop === "2026-09-01");
check("December rolls into the next year", monthWindow("2026-12").stop === "2027-01-01");
let threw = false;
try {
  monthWindow("2026-13");
} catch {
  threw = true;
}
check("a thirteenth month is refused", threw);
threw = false;
try {
  monthWindow("last month");
} catch {
  threw = true;
}
check("so is prose", threw);
check(
  "the default is the last COMPLETE month, not the current one",
  defaultMonth(new Date(Date.UTC(2026, 8, 8))) === "2026-08",
  defaultMonth(new Date(Date.UTC(2026, 8, 8)))
);
check(
  "and in January that is the previous December",
  defaultMonth(new Date(Date.UTC(2027, 0, 3))) === "2026-12",
  defaultMonth(new Date(Date.UTC(2027, 0, 3)))
);
check("--month overrides it", parseArgs(["--month", "2026-05"]).month === "2026-05");

console.log("\n== 5. the queries a person pastes into the production editor ==");
const queries = {
  invoice: buildInvoiceQuery("2026-08"),
  reconcile: buildReconcileQuery("2026-08"),
  coverage: buildCoverageQuery("2026-08"),
};
const WRITES = /(?:^|[\s(;,])(insert|update|delete|drop|truncate|alter|grant|revoke|create)[\s(]/i;
for (const [name, sql] of Object.entries(queries)) {
  check(`the ${name} query writes nothing`, !WRITES.test(sql), (sql.match(WRITES) ?? [])[0]);
  check(
    `the ${name} query needs no parameters`,
    !/\$\d|(?<![:\w])\?(?!\?)/.test(sql),
    (sql.match(/\$\d|\?/) ?? [])[0]
  );
  check(`the ${name} query names the month it is about`, sql.includes("2026-08-01") && sql.includes("2026-09-01"));
  check(`the ${name} query reads ai_cost_log`, sql.includes("public.ai_cost_log"));
  // HALF-OPEN IN THE SQL TOO, not just in monthWindow. A `<=` on the
  // upper bound puts the first instant of the next month inside this
  // invoice, and the row it catches is on both months' reports.
  check(
    `the ${name} query's upper bound is exclusive`,
    /created_at\s+<\s+timestamptz/.test(sql) && !/created_at\s*<=/.test(sql),
    (sql.match(/created_at[^\n]*/g) ?? []).join(" | ")
  );
}
check(
  "the invoice query carries its own price table, so it can be pasted unedited",
  queries.invoice.includes("('claude-opus-5', 'input', 5::numeric)"),
  "rate CTE missing"
);
check(
  "the invoice query splits by model and by token kind",
  queries.invoice.includes("cache_write_1h") && queries.invoice.includes("modelBreakdown"),
);
check(
  "the reconciliation names the rows it CANNOT reconcile",
  queries.reconcile.includes("NO model split"),
);
check(
  "the reconciliation excludes non-Anthropic spend from the comparison",
  queries.reconcile.includes("billing <> 'non-anthropic'"),
);
check(
  "the coverage query does not expand the model split",
  !queries.coverage.includes("jsonb_each"),
  "expanding it would count a row once per model it used"
);
check(
  "no query uses the ? operator, which several drivers read as a placeholder",
  Object.values(queries).every((q) => !q.includes("metadata ? ")),
);

console.log("\n== 6. the split is recorded at settlement, unconditionally ==");
const settle = readFileSync("src/lib/billing/reservations.ts", "utf8");
const meta = settle.indexOf("p_metadata: {");
const written = settle.indexOf("modelBreakdown: costs.byModel()");
check("settleReservation writes modelBreakdown", written !== -1);
check("inside the metadata it stores on the row", meta !== -1 && written > meta, `${meta} / ${written}`);
check(
  "and never as `|| undefined` — an absent key has to mean an OLD row",
  !/modelBreakdown:[^\n]*\|\|\s*undefined/.test(settle),
  "an empty split and a missing one must stay distinguishable"
);

console.log("\n== 7. CostAccumulator.byModel, run for real ==");
const { loadTs } = await import("./load-ts.mjs");
const { CostAccumulator } = await loadTs("src/lib/billing/cost-accumulator.ts");
const a = new CostAccumulator();
a.record("classification", { input_tokens: 1_000_000 }, "claude-haiku-4-5");
a.record("generation", { input_tokens: 1_000_000 }, "claude-opus-5-20260101");
a.record("retry", { input_tokens: 1_000_000 }, "claude-opus-5");
a.recordExternal("speak", { provider: "elevenlabs", usdCost: 0.75, units: 9, unit: "characters" });
a.recordBatch("generation", { input_tokens: 2_000_000 }, "claude-sonnet-4-6", "msgbatch_x");
const split = a.byModel();
check(
  "two models in one action stay two rows",
  split["claude-haiku-4-5"]?.inputTokens === 1_000_000 && split["claude-opus-5"]?.inputTokens === 2_000_000,
  JSON.stringify(Object.keys(split))
);
check("a dated snapshot id folds onto its alias", !Object.keys(split).some((k) => k.includes("20260101")));
check("the batch prefix survives, because it changes the rate", Boolean(split["batch:claude-sonnet-4-6"]));
check("the external prefix survives, because it changes the invoice", Boolean(split["external:elevenlabs"]));
check(
  "calls are counted per model, not per action",
  split["claude-opus-5"]?.calls === 2 && split["claude-haiku-4-5"]?.calls === 1,
  JSON.stringify([split["claude-opus-5"]?.calls, split["claude-haiku-4-5"]?.calls])
);
const summed = Object.values(split).reduce((s, v) => s + v.usdCost, 0);
check(
  "the split accounts for every dollar the accumulator holds",
  near(summed, a.totalUsdCost, 1e-6),
  `${summed} vs ${a.totalUsdCost}`
);
check(
  "an empty accumulator gives an empty split, not a missing one",
  JSON.stringify(new CostAccumulator().byModel()) === "{}"
);
const restored = CostAccumulator.restore([
  // A snapshot written by an older deploy: no cacheWrite1hTokens, no
  // webFetches. `+ undefined` here would be NaN, and NaN serialises to
  // null in jsonb — a blank where a number belongs.
  { stage: "generation", model: "claude-opus-5", usage: { inputTokens: 1e6, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, webSearches: 0, usdCost: 5 } },
]);
check(
  "a pre-1h-cache snapshot does not turn the split into NaN",
  Number.isFinite(restored.byModel()["claude-opus-5"].cacheWrite1hTokens),
  JSON.stringify(restored.byModel())
);

console.log("\n== 8. what to look for on console.anthropic.com ==");
check("there is a checklist at all", CONSOLE_STEPS.length >= 5, String(CONSOLE_STEPS.length));
check(
  "every step says where to look, what to read, and what to compare it with",
  CONSOLE_STEPS.every((s) => s.where && s.look && s.against),
  JSON.stringify(CONSOLE_STEPS.filter((s) => !(s.where && s.look && s.against)))
);
check(
  "it names the two console pages the numbers actually live on",
  CONSOLE_STEPS.some((s) => /-> Usage/.test(s.where)) && CONSOLE_STEPS.some((s) => /-> Cost/.test(s.where)),
  JSON.stringify(CONSOLE_STEPS.map((s) => s.where))
);
check(
  "it names the two things the ledger cannot see — a second key, and the wrong workspace",
  CONSOLE_STEPS.some((s) => /API KEY/i.test(s.where + s.look)) &&
    CONSOLE_STEPS.some((s) => /workspace/i.test(s.where + s.look)),
  JSON.stringify(CONSOLE_STEPS.map((s) => s.where))
);

console.log(`\n  ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
