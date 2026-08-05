// Reproduction test for the owner-only margin report aggregation.
// Run: node scripts/tests/margin-report.test.mjs
import { readFileSync } from "node:fs";
import ts from "typescript";
import { pathToFileURL } from "node:url";

const src = readFileSync("src/lib/billing/margin-report.ts", "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const { aggregateMarginRows, MARGIN_TARGET, MARGIN_REPORT_WINDOW_DAYS } = mod;

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`); }
}

console.log("== constants ==");
check("window is 30 days", MARGIN_REPORT_WINDOW_DAYS, 30);
check("target margin is 4x", MARGIN_TARGET, 4);

console.log("\n== 1. PostgREST numeric-as-string coercion ==");
// This is the failure mode that matters: numerics arrive as STRINGS.
// Without Number(), marginSum becomes "04.24.5" and cost concatenates.
const asStrings = aggregateMarginRows([
  { feature: "website_generate", achieved_margin: "4.2", real_cost_eur: "0.0130" },
  { feature: "website_generate", achieved_margin: "4.5", real_cost_eur: "0.0170" },
]);
check("avg margin from strings", asStrings[0].averageMargin, 4.35);
check("cost summed, not concatenated", Number(asStrings[0].totalCostEur.toFixed(4)), 0.03);
check("call count", asStrings[0].calls, 2);

console.log("\n== 2. null margin means unknown, never 0 ==");
const allNull = aggregateMarginRows([
  { feature: "chat", achieved_margin: null, real_cost_eur: "0.002" },
  { feature: "chat", achieved_margin: null, real_cost_eur: "0.003" },
]);
check("averageMargin is null (not 0)", allNull[0].averageMargin, null);
check("cost still accumulates", Number(allNull[0].totalCostEur.toFixed(3)), 0.005);

console.log("\n== 3. mixed null + real: null rows excluded from the average ==");
// 3 rows, one is a bypass (admin/beta) with no margin. Average must be
// (4.0+6.0)/2 = 5.0, NOT (4.0+6.0+0)/3 = 3.333 which would falsely
// trip the below-target red flag.
const mixed = aggregateMarginRows([
  { feature: "create", achieved_margin: "4.0", real_cost_eur: "0.01" },
  { feature: "create", achieved_margin: null,  real_cost_eur: "0.01" },
  { feature: "create", achieved_margin: "6.0", real_cost_eur: "0.01" },
]);
check("average excludes the null row", mixed[0].averageMargin, 5);
check("calls counts ALL rows including the null one", mixed[0].calls, 3);
check("average is above target (not falsely flagged)", mixed[0].averageMargin >= MARGIN_TARGET, true);

console.log("\n== 4. sorted by total cost descending ==");
const sorted = aggregateMarginRows([
  { feature: "cheap",  achieved_margin: "5", real_cost_eur: "0.001" },
  { feature: "costly", achieved_margin: "5", real_cost_eur: "0.900" },
  { feature: "mid",    achieved_margin: "5", real_cost_eur: "0.050" },
]);
check("order", sorted.map((r) => r.feature), ["costly", "mid", "cheap"]);

console.log("\n== 5. garbage values do not poison the sums ==");
const garbage = aggregateMarginRows([
  { feature: "x", achieved_margin: "4.0",     real_cost_eur: "0.01" },
  { feature: "x", achieved_margin: "not-a-#", real_cost_eur: "also-bad" },
]);
check("NaN margin dropped, average stays 4", garbage[0].averageMargin, 4);
check("NaN cost dropped, total stays finite", Number.isFinite(garbage[0].totalCostEur), true);
check("cost total", Number(garbage[0].totalCostEur.toFixed(2)), 0.01);

console.log("\n== 6. empty input ==");
check("no rows -> empty array", aggregateMarginRows([]), []);

console.log("\n== 7. below-target detection (the reason the table exists) ==");
const below = aggregateMarginRows([
  { feature: "losing_money", achieved_margin: "0.62", real_cost_eur: "0.02" },
  { feature: "losing_money", achieved_margin: "0.85", real_cost_eur: "0.02" },
]);
const avg = below[0].averageMargin;
check("avg computed", Number(avg.toFixed(3)), 0.735);
check("flagged as below target", avg < MARGIN_TARGET, true);

console.log("\n== 8. missing feature name falls back, does not crash ==");
const noName = aggregateMarginRows([{ feature: "", achieved_margin: "4", real_cost_eur: "0.01" }]);
check("blank feature bucketed as 'unknown'", noName[0].feature, "unknown");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
