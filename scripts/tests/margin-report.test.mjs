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
const {
  aggregateMarginRows,
  summariseMarginReport,
  effectiveMargin,
  hypotheticalMargin,
  MARGIN_TARGET,
  MARGIN_REPORT_WINDOW_DAYS,
} = mod;

let pass = 0, fail = 0;
function checkTrue(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}
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
check("avg margin from strings", asStrings[0].chargedMargin, 4.35);
check("cost summed, not concatenated", Number(asStrings[0].totalCostEur.toFixed(4)), 0.03);
check("call count", asStrings[0].calls, 2);

console.log("\n== 2. null margin means unknown, never 0 ==");
const allNull = aggregateMarginRows([
  { feature: "chat", achieved_margin: null, real_cost_eur: "0.002" },
  { feature: "chat", achieved_margin: null, real_cost_eur: "0.003" },
]);
check("averageMargin is null (not 0)", allNull[0].chargedMargin, null);
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
check("average excludes the null row", mixed[0].chargedMargin, 5);
check("calls counts ALL rows including the null one", mixed[0].calls, 3);
check("average is above target (not falsely flagged)", mixed[0].chargedMargin >= MARGIN_TARGET, true);

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
check("NaN margin dropped, average stays 4", garbage[0].chargedMargin, 4);
check("NaN cost dropped, total stays finite", Number.isFinite(garbage[0].totalCostEur), true);
check("cost total", Number(garbage[0].totalCostEur.toFixed(2)), 0.01);

console.log("\n== 6. empty input ==");
check("no rows -> empty array", aggregateMarginRows([]), []);

console.log("\n== 7. below-target detection (the reason the table exists) ==");
const below = aggregateMarginRows([
  { feature: "losing_money", achieved_margin: "0.62", real_cost_eur: "0.02" },
  { feature: "losing_money", achieved_margin: "0.85", real_cost_eur: "0.02" },
]);
const avg = below[0].chargedMargin;
check("avg computed", Number(avg.toFixed(3)), 0.735);
check("flagged as below target", avg < MARGIN_TARGET, true);

console.log("\n== 8. missing feature name falls back, does not crash ==");
const noName = aggregateMarginRows([{ feature: "", achieved_margin: "4", real_cost_eur: "0.01" }]);
check("blank feature bucketed as 'unknown'", noName[0].feature, "unknown");


// ---------------------------------------------------------------------
console.log("\n== 13. THE REPORTED BUG: every row read '—' ==");
// The owner's own account is a bypass account, so settleReservation stores
// achieved_margin = null on every one of its rows — correctly, because
// there is no revenue to divide by. The report averaged only the stored
// value, so the whole table showed "—" beside real euros of spend.
const bypassRow = {
  feature: "website_generate",
  achieved_margin: null,
  real_cost_eur: "0.4048",
  credits_charged: 0,
  metadata: { bypassCharge: true, wouldHaveChargedCredits: 110, effectiveCreditPriceEur: 0.0166667 },
};
check("a bypass row still has no CHARGED margin", aggregateMarginRows([bypassRow])[0].chargedMargin, null);
// (110 x 0.0166667) / 0.4048 = 4.529...
const projected = hypotheticalMargin(bypassRow);
check("but its would-be margin is computed", Number(projected.toFixed(3)), 4.529);
check("and it appears in the table", Number(aggregateMarginRows([bypassRow])[0].wouldBeMargin.toFixed(3)), 4.529);
check("the credits it would have taken are summed", aggregateMarginRows([bypassRow])[0].wouldBeCredits, 110);
check("it is counted as bypass, not charged", aggregateMarginRows([bypassRow])[0].bypassCalls, 1);
check("and contributes nothing to charged credits", aggregateMarginRows([bypassRow])[0].chargedCredits, 0);

console.log("\n== 14. a row with no figures to project from stays honest ==");
// Rows written before wouldHaveChargedCredits existed must read "no data",
// not a made-up number.
for (const [label, meta] of [
  ["no metadata at all", null],
  ["metadata without the credits", { bypassCharge: true }],
  ["credits but no rate", { wouldHaveChargedCredits: 110 }],
  ["rate but no credits", { effectiveCreditPriceEur: 0.02 }],
  ["a zero rate", { wouldHaveChargedCredits: 110, effectiveCreditPriceEur: 0 }],
  ["a non-numeric credits value", { wouldHaveChargedCredits: "110", effectiveCreditPriceEur: 0.02 }],
]) {
  check(
    `${label} -> null, not a guess`,
    hypotheticalMargin({ feature: "x", achieved_margin: null, real_cost_eur: "0.4", metadata: meta }),
    null
  );
}
check(
  "a zero real cost is undefined, not Infinity",
  hypotheticalMargin({
    feature: "x",
    achieved_margin: null,
    real_cost_eur: 0,
    metadata: { wouldHaveChargedCredits: 110, effectiveCreditPriceEur: 0.02 },
  }),
  null
);

console.log("\n== 15. BOTH columns, from one mixed fixture ==");
// The whole point of splitting them: a feature used by both a paying
// customer and the owner must report each separately, and neither number
// may contaminate the other.
const bothKinds = aggregateMarginRows([
  // two charged actions: 4.0x and 5.0x -> 4.5x average, 200 credits taken
  { feature: "deep_research", achieved_margin: "4.0", real_cost_eur: "0.10", credits_charged: 80 },
  { feature: "deep_research", achieved_margin: "5.0", real_cost_eur: "0.10", credits_charged: 120 },
  // two bypass actions: 6.0x and 8.0x -> 7.0x projected, 700 would-be
  {
    feature: "deep_research",
    achieved_margin: null,
    real_cost_eur: "0.10",
    credits_charged: 0,
    metadata: { wouldHaveChargedCredits: 300, effectiveCreditPriceEur: 0.002 },
  },
  {
    feature: "deep_research",
    achieved_margin: null,
    real_cost_eur: "0.10",
    credits_charged: 0,
    metadata: { wouldHaveChargedCredits: 400, effectiveCreditPriceEur: 0.002 },
  },
]);
const dr = bothKinds[0];
check("four actions in total", dr.calls, 4);
check("two of them charged", dr.chargedCalls, 2);
check("two of them bypass", dr.bypassCalls, 2);
check("the CHARGED average is only the charged ones", dr.chargedMargin, 4.5);
check("the WOULD-BE average is only the bypass ones", dr.wouldBeMargin, 7);
check("charged credits are only the charged ones", dr.chargedCredits, 200);
check("would-be credits are only the bypass ones", dr.wouldBeCredits, 700);
check("cost counts every action", Number(dr.totalCostEur.toFixed(4)), 0.4);
// The contamination this guards against: a blended average would be 5.75x,
// which is neither number and would read as real revenue.
checkTrue("the two averages are genuinely different", dr.chargedMargin !== dr.wouldBeMargin);

console.log("\n== 16. which margin decides the flag ==");
check(
  "charged wins when it exists",
  effectiveMargin({ chargedMargin: 3.1, wouldBeMargin: 9, chargedCalls: 1, bypassCalls: 1 }),
  { margin: 3.1, hypothetical: false }
);
check(
  "the projection is used when nothing charged",
  effectiveMargin({ chargedMargin: null, wouldBeMargin: 2.2, chargedCalls: 0, bypassCalls: 1 }),
  { margin: 2.2, hypothetical: true }
);
check(
  "neither means no verdict",
  effectiveMargin({ chargedMargin: null, wouldBeMargin: null, chargedCalls: 0, bypassCalls: 1 }),
  { margin: null, hypothetical: false }
);

console.log("\n== 13. the summary above the table ==");
const summary = summariseMarginReport(bothKinds);
check("total cost", Number(summary.totalCostEur.toFixed(4)), 0.4);
check("charged credits", summary.totalChargedCredits, 200);
check("would-be credits", summary.totalWouldBeCredits, 700);
// Charged exists, so the effective margin for this feature is 4.5x, and
// with one feature the weighted overall margin is the same number.
check("overall margin is cost-weighted", Number(summary.overallMargin.toFixed(2)), 4.5);
check("top feature is named", summary.topFeature.feature, "deep_research");
check("with its share of spend", Number(summary.topFeature.share.toFixed(2)), 1);
check("data with both kinds is NOT projection-only", summary.projectionOnly, false);
check("and nothing is below target", summary.belowTarget, []);

// Weighting matters: a bad margin on the feature that dominates spend is a
// different problem from a bad margin on one that ran twice.
const weighted = summariseMarginReport(
  aggregateMarginRows([
    { feature: "big", achieved_margin: "2.0", real_cost_eur: "9.0", credits_charged: 10 },
    { feature: "small", achieved_margin: "10.0", real_cost_eur: "1.0", credits_charged: 10 },
  ])
);
// (2.0*9 + 10.0*1) / 10 = 2.8 — NOT the flat average of 6.0
check("weighted by cost, not a flat average", Number(weighted.overallMargin.toFixed(2)), 2.8);
check("the costliest feature is first", weighted.topFeature.feature, "big");
check("with its real share", Number(weighted.topFeature.share.toFixed(2)), 0.9);

console.log("\n== 14. projection-only is announced, not left as dashes ==");
const projectionOnly = summariseMarginReport(aggregateMarginRows([bypassRow]));
checkTrue("a table with no charged rows says so", projectionOnly.projectionOnly);
checkTrue("but it is NOT projection-only once anything charged", !summary.projectionOnly);
checkTrue("an empty table is not 'projection only' either", !summariseMarginReport([]).projectionOnly);
check("and an empty table has no overall margin", summariseMarginReport([]).overallMargin, null);
check("nor a top feature", summariseMarginReport([]).topFeature, null);

console.log("\n== 15. below-target flags BOTH real and projected ==");
const belowReal = summariseMarginReport(
  aggregateMarginRows([{ feature: "chat", achieved_margin: "2.2", real_cost_eur: "0.05", credits_charged: 5 }])
);
check("a charged shortfall is flagged", belowReal.belowTarget.length, 1);
check("and marked as real", belowReal.belowTarget[0].hypothetical, false);
const belowProjected = summariseMarginReport(
  aggregateMarginRows([
    {
      feature: "chat",
      achieved_margin: null,
      real_cost_eur: "0.10",
      credits_charged: 0,
      metadata: { wouldHaveChargedCredits: 100, effectiveCreditPriceEur: 0.002 },
    },
  ])
);
// (100 * 0.002) / 0.10 = 2.0x
check("a PROJECTED shortfall is flagged too", belowProjected.belowTarget.length, 1);
check("and marked as a projection", belowProjected.belowTarget[0].hypothetical, true);
check("with the number that triggered it", Number(belowProjected.belowTarget[0].margin.toFixed(2)), 2);
// A projection below target means the pricing would lose money the moment a
// paying customer did the same thing — exactly as urgent as a real one.
checkTrue("a healthy projection is not flagged", summariseMarginReport(aggregateMarginRows([bypassRow])).belowTarget.length === 0);

console.log("\n== 16. the component actually renders both columns ==");
const view = readFileSync("src/components/settings/margin-report.tsx", "utf8");
for (const key of ["colFeature", "colCalls", "colCharged", "colBypass", "colMarginCharged", "colMarginWouldBe", "colCost"]) {
  checkTrue(`the ${key} column exists`, view.includes(`t("${key}")`));
}
checkTrue("the summary tiles render", /SummaryTile/.test(view));
checkTrue("projection-only is announced", /summary\.projectionOnly &&/.test(view));
checkTrue("below-target rows are tinted red", /flagged \? "bg-red-950\/20"/.test(view));
checkTrue("and an alert email is sent for each", /for \(const below of summary\.belowTarget\)/.test(view));
checkTrue("credits_charged is actually selected", /credits_charged, metadata/.test(view));


console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
