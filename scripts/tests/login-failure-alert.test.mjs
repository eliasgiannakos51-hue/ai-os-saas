#!/usr/bin/env node
/*
 * THE OWNER HEARS ABOUT A WAVE OF FAILED SIGN-INS (ΑΣ-8.5).
 *
 * api/auth/login blocks one address after 8 failures in 15 minutes. The
 * two shapes that block misses — many addresses at once, one account from
 * many addresses — are counted by lib/auth/login-failure-alert.ts, which
 * emails ADMIN_EMAILS once an hour per cause. This holds:
 *
 *   1  the decision, executed: under each threshold nothing, at it an alert
 *   2  the account is never stored as its address, and the alert masks it
 *   3  the login route counts every failure, and only failures
 *   4  an alert is rationed: one per cause per hour, and a failure to count
 *      or send never fails the sign-in
 *
 * Run: node scripts/tests/login-failure-alert.test.mjs
 */
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

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

const MOD = "src/lib/auth/login-failure-alert.ts";
const POLICY = "src/lib/auth/login-failure-policy.ts";
const ROUTE = "src/app/api/auth/login/route.ts";
const lib = await loadTs(POLICY);
const { LOGIN_FAILURE_ALERT: C, alertsFor, accountKey, maskEmail } = lib;
const src = stripComments(readFileSync(MOD, "utf8"));
const route = stripComments(readFileSync(ROUTE, "utf8"));

console.log("== 1. the decision, executed ==");
check("the thresholds are real numbers above the per-address block", C.globalThreshold > 8 && C.accountThreshold > 8, JSON.stringify(C));
check("a quiet window alerts nobody", alertsFor({ global: C.globalThreshold - 1, account: C.accountThreshold - 1 }).length === 0);
check("a site-wide wave alerts", JSON.stringify(alertsFor({ global: C.globalThreshold, account: 1 })) === '["global"]');
check("one account tried from many addresses alerts", JSON.stringify(alertsFor({ global: 3, account: C.accountThreshold })) === '["account"]');
check("a count that could not be read alerts nobody, rather than guessing", alertsFor({ global: null, account: null }).length === 0);

console.log("\n== 2. no address is stored ==");
const key = accountKey("Maria.Papa@example.gr");
check("the account key is a 64-character hash", /^[0-9a-f]{64}$/.test(key), key);
check("...the same for the same address however it is typed", key === accountKey("  maria.papa@EXAMPLE.gr "));
check("...and it does not contain the address", !key.includes("maria"));
check("the alert masks the address", maskEmail("maria.papa@example.gr") === "m***@example.gr", maskEmail("maria.papa@example.gr"));
const identifiers = [...src.matchAll(/recordRateLimitHit\(\{[^}]*identifier:\s*([\w"]+)/g)].map((m) => m[1]);
check(
  "every row written is keyed on \"all\" or the hash, never the address",
  identifiers.length === 2 && identifiers.every((i) => i === '"all"' || i === "account"),
  identifiers.join(", "),
);

console.log("\n== 3. the route counts every failure, and only failures ==");
const failBranch = route.slice(route.indexOf("if (signInError) {"), route.indexOf("return NextResponse.json({ ok: true })"));
check("the failure branch counts it", /await noteLoginFailure\(email\)/.test(failBranch));
check("...after the per-address block records it", failBranch.indexOf("recordRateLimitHit") < failBranch.indexOf("noteLoginFailure"));
check("a successful sign-in is not counted", (route.match(/noteLoginFailure\(/g) ?? []).length === 1);

console.log("\n== 4. rationed, and never in the way ==");
check(
  "each alert takes a slot first: one per cause per window",
  (src.match(/checkRateLimit\(\{\s*scope: c\.alertScope,[\s\S]{0,120}?maxAttempts: 1,\s*windowMinutes: c\.alertEveryMinutes/g) ?? []).length === 2,
);
check("...and the window is an hour", C.alertEveryMinutes === 60);
check("a failure to count or send is caught and said, never thrown", /catch \(err\) \{\s*console\.error\(/.test(src));
const scopes = readFileSync("src/lib/health/nav-freshness.ts", "utf8");
check(
  "the three scopes are excluded from the activity probe, which counts signed-in traffic",
  [C.globalScope, C.accountScope, C.alertScope].every((s) => scopes.includes(`"${s}"`)),
);

console.log(`\n  ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILED:\n  " + failures.join("\n  "));
  process.exit(1);
}
