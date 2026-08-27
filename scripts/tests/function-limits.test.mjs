// Surviving a drop from Vercel Pro to Hobby.
//
// THE STAKES. Two routes declared maxDuration = 800, a Pro/Fluid figure.
// On Hobby the ceiling is 60, and the consequence is NOT "slower":
//
//   1. Vercel validates maxDuration against the plan AT BUILD TIME. A
//      route asking for 800 on Hobby fails the build — the product stops
//      shipping entirely.
//   2. A function killed at 60s runs no catch block. No status written, no
//      settlement, the credit hold stranded until the sweep. That is the
//      exact Deep Research failure already fixed once at the 300s ceiling.
//
// Run: node scripts/tests/function-limits.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const { loadTs } = await import("./load-ts.mjs");
const fl = await loadTs("src/lib/function-limits.ts");

console.log("== 1. the ceiling is configurable, and validated ==");
check("the default is the Pro figure", fl.resolveMaxFunctionDuration({}) === 800);
check("Hobby's 60 is accepted", fl.resolveMaxFunctionDuration({ MAX_FUNCTION_DURATION: "60" }) === 60);
check("300 is accepted", fl.resolveMaxFunctionDuration({ MAX_FUNCTION_DURATION: "300" }) === 300);
// A typo must not turn every long action into an instant failure that
// looks like a broken feature.
for (const bad of ["", "   ", "abc", "0", "5", "9", "-60", "60.5", "99999"]) {
  check(`"${bad}" is rejected, falls back to 800`, fl.resolveMaxFunctionDuration({ MAX_FUNCTION_DURATION: bad }) === 800);
}
check("60 is exactly Hobby's documented ceiling", fl.HOBBY_MAX_DURATION_SECONDS === 60);

console.log("\n== 2. the build step can only ever lower a route's ceiling ==");
// Next requires maxDuration to be a plain literal — every expression form
// was built and rejected with "Unsupported node type", and Next then
// IGNORES the value, which is worse than erroring. So the literal is
// rewritten before the build. This is the property that stops the build
// failing on Hobby.
const { applyToSource, unmanagedOverCeiling } = await import("../apply-function-limits.mjs");
const marked = (n, pref) => `export const maxDuration = ${n}; // @function-limit ${pref}`;
check("a route wanting 800 is lowered to 60", applyToSource(marked(800, 800), 60).applied === 60);
check("and the marker keeps saying it wants 800", applyToSource(marked(800, 800), 60).source.includes("@function-limit 800"));
check("a route wanting 90 is also lowered", applyToSource(marked(90, 90), 60).applied === 60);
check("a route wanting 30 is NEVER inflated", applyToSource(marked(30, 30), 800).applied === 30);
check("raising the ceiling restores the preference", applyToSource(marked(60, 800), 800).applied === 800);
check("an unchanged literal is not rewritten", applyToSource(marked(60, 800), 60).changed === false);
check("a file with no marker is left alone", applyToSource("export const maxDuration = 60;", 60).preferred === null);
// The gap this closes: a route that declares a big literal and forgets the
// marker would be invisible to the rewriter and fail the build on Hobby.
check(
  "an unmarked route above the ceiling is reported",
  unmanagedOverCeiling(["x.ts"], 60, () => "export const maxDuration = 300;").length === 1
);
check(
  "an unmarked route within the ceiling is fine",
  unmanagedOverCeiling(["x.ts"], 60, () => "export const maxDuration = 60;").length === 0
);

console.log("\n== 3. the runtime budget leaves room to save state ==");
const budget = fl.functionBudgetMs();
check(`the budget is under the ceiling (${budget}ms)`, budget < fl.MAX_FUNCTION_DURATION_SECONDS * 1000);
check("with a real safety margin, not a token one", fl.MAX_FUNCTION_DURATION_SECONDS * 1000 - budget >= 8000);
check("and it is never zero or negative", budget >= 1000);
// hasBudgetFor is the predicate every chunked loop consults.
check("work that fits is allowed", fl.hasBudgetFor(0, 1000, 10_000));
check("work that exactly fills the budget is allowed", fl.hasBudgetFor(0, 10_000, 10_000));
check("work that would overrun is refused", fl.hasBudgetFor(0, 10_001, 10_000) === false);
check("elapsed time counts against it", fl.hasBudgetFor(9_000, 2_000, 10_000) === false);

console.log("\n== 4. handoff auth is a real secret, never an empty one ==");
// A continuation endpoint callable without a secret would let anyone burn
// another account's credits by guessing a report id.
const before = process.env.CRON_SECRET;
delete process.env.CRON_SECRET;
check("no CRON_SECRET means no handoff, not an unauthenticated one", fl.internalHandoffToken() === null);
process.env.CRON_SECRET = "   ";
check("a whitespace secret is also refused", fl.internalHandoffToken() === null);
process.env.CRON_SECRET = "s3cret";
check("a real secret is returned", fl.internalHandoffToken() === "s3cret");
if (before === undefined) delete process.env.CRON_SECRET;
else process.env.CRON_SECRET = before;

console.log("\n== 5. NO route declares a raw number above Hobby's ceiling ==");
// The whole point. A single missed route is a failed build on Hobby, so
// this walks EVERY route file rather than checking a sample.
const routes = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) walk(full);
    else if (entry === "route.ts") routes.push(full);
  }
})("src/app/api");
check(`the api route walk found routes (${routes.length})`, routes.length >= 100,
  "the offender list below is a filter of this — an empty walk makes it pass on nothing");

let declared = 0;
const offenders = [];
for (const file of routes) {
  const src = readFileSync(file, "utf8");
  const m = src.match(/export const maxDuration\s*=\s*(.+?);/);
  if (!m) continue;
  declared++;
  const expr = m[1].trim();
  if (!/^\d+$/.test(expr)) {
    // Anything but a literal is silently IGNORED by Next — the build
    // succeeds and the setting does nothing.
    offenders.push(`${file}: ${expr} (not a literal — Next will ignore it)`);
    continue;
  }
  // A literal above Hobby's ceiling is only safe if the build step can
  // lower it, which means it must carry a marker.
  if (Number(expr) > fl.HOBBY_MAX_DURATION_SECONDS && !/@function-limit \d+/.test(src)) {
    offenders.push(`${file}: ${expr} with no @function-limit marker`);
  }
}
check(`every route is literal and Hobby-reachable (${declared} declare maxDuration)`, offenders.length === 0, offenders.join("\n        "));
check("and the check actually looked at routes", declared >= 20);
// The three that need the most time are the ones that matter most.
for (const file of [
  "src/app/api/research/[id]/run/route.ts",
  "src/app/api/research/[id]/continue/route.ts",
  "src/app/api/websites/generate/process/route.ts",
]) {
  const src = readFileSync(file, "utf8");
  check(`${file.split("/api/")[1]} carries a marker`, /export const maxDuration = \d+; \/\/ @function-limit \d+/.test(src));
}
check("the build runs the rewriter first", JSON.parse(readFileSync("package.json", "utf8")).scripts.build.startsWith("node scripts/apply-function-limits.mjs &&"));

console.log("\n== 6. the work itself is sized to the budget, not to a guess ==");
const wb = readFileSync("src/lib/website-builder.ts", "utf8");
check("the website continuation deadline reads the budget", /Math\.min\(700_000, functionBudgetMs\(\)\)/.test(wb));
check("the old hardcoded deadline constant is gone", !/const CONTINUATION_DEADLINE_MS = 700_000/.test(wb));
check(
  "the per-round reserve scales instead of being a flat 120s",
  /Math\.min\(120_000, Math\.max\(15_000, Math\.floor\(budget \/ 3\)\)\)/.test(wb)
);
// The bug that scaling fixes: a flat 120s reserve against a 48s budget
// refuses EVERY continuation, so a truncated document can never finish.
const limits = await loadTs("src/lib/research/research-limits.ts");
check(
  "one research question fits inside a Hobby-sized budget",
  limits.RESEARCH_QUESTION_BUDGET_MS < 60_000 * 0.8,
  `${limits.RESEARCH_QUESTION_BUDGET_MS}ms vs ~48000ms of usable 60s budget`
);
check("and the question budget is pessimistic, not the timeout", limits.RESEARCH_QUESTION_BUDGET_MS < limits.RESEARCH_QUESTION_TIMEOUT_MS);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
