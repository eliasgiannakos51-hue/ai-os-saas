#!/usr/bin/env node
/*
 * A FLAGGED SITE'S REGENERATE SAYS ITS PRICE, AND DOES NOT START WITHOUT
 * THE CREDITS.
 *
 * Until 2026-10-05 the button read «Αναδημιουργία (δωρεάν)» and the worker
 * charged the run like any other (docs/BUGS.md ΛΘ-7). The owner chose
 * "really free, once" (NEEDS 24); a free run is a new free quota against
 * a combined ceiling with no room left in it (combined-ceiling.test.mjs,
 * section 1), so where its budget comes from is NEEDS 33. Until then the
 * product says the true thing: a price, before the press.
 *
 * And the other half of NEEDS 24, "Αν δεν φτάνουν τα credits, η ενέργεια
 * δεν ξεκινά και ο χρήστης το βλέπει πριν": the route asks the balance
 * BEFORE it moves the row out of 'flagged'. The worker's hold refused it
 * anyway, but only after the row had left 'flagged' — a failed site the
 * button could no longer reach.
 *
 * Every source check runs on the file WITH ITS COMMENTS STRIPPED.
 *
 * Run: node scripts/tests/regenerate-cost.test.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
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

const ROUTE = "src/app/api/websites/[id]/regenerate/route.ts";
const WORKER = "src/app/api/websites/generate/process/route.ts";
const WORKSPACE = "src/components/website-builder/website-builder-workspace.tsx";
const route = stripComments(readFileSync(ROUTE, "utf8"));
const worker = stripComments(readFileSync(WORKER, "utf8"));
const workspace = stripComments(readFileSync(WORKSPACE, "utf8"));

console.log("== 1. no balance, no start ==");
const precheckAt = route.indexOf("hasEnoughCredits(");
const claimAt = route.indexOf(".update(");
check("the route asks the balance", precheckAt > 0);
check(
  "...BEFORE it claims the row, so a refusal leaves the site flagged",
  precheckAt > 0 && claimAt > precheckAt,
  `hasEnoughCredits at ${precheckAt}, claim at ${claimAt}`,
);
check(
  "...for every account the worker would charge: only admin and beta skip it",
  /if \(!isAdminEmail\(user\.email\) && !\(await hasActiveBetaBypass\(user\)\)\) \{/.test(route),
);
check(
  "...against the estimate of the same action the worker holds for",
  /estimateForAction\(\s*"websiteGenerate"/.test(route) && /hasEnoughCredits\(user\.id, estimate\.reserveCredits, plan\)/.test(route),
);
check(
  "...and refuses with a code the screen translates, not an English sentence",
  /code:\s*"insufficient_credits"/.test(route) && /status:\s*402/.test(route),
);

console.log("\n== 2. nothing is called free that is charged ==");
check("the claim still wins once, on a row that is still flagged", route.includes('.eq("status", "flagged")'));
const settles = worker.match(/bypassCharge:\s*(\w+)/g) ?? [];
check(
  "the worker charges a regenerate like any generation: only admin and beta skip the charge",
  settles.length >= 2 && settles.every((s) => s.endsWith("bypassCredits")),
  settles.join(", "),
);
check(
  "the button is priced, from the same estimator",
  /t\("regeneratePaid",\s*\{\s*count:\s*estimateForAction\(\s*"websiteGenerate"/.test(workspace),
);
check("...and no longer says free", !workspace.includes("regenerateFree"));
check("the stored flag message does not promise a free run", !/regenerate it once at no extra charge/i.test(worker));

const langs = readdirSync("messages").filter((f) => f.endsWith(".json"));
check(`the locales scan found ${langs.length}`, langs.length >= 10);
const promisesFree = [];
const missing = [];
for (const f of langs) {
  const j = JSON.parse(readFileSync(`messages/${f}`, "utf8"));
  if (j?.dashboard?.websiteBuilder?.regenerateFree !== undefined) promisesFree.push(`${f}: websiteBuilder.regenerateFree`);
  if (f === "en.json" && /for free/i.test(j?.dashboard?.publishing?.disabledFlagged ?? "")) promisesFree.push(`${f}: publishing.disabledFlagged`);
  if (f === "el.json" && /δωρεάν/.test(j?.dashboard?.publishing?.disabledFlagged ?? "")) promisesFree.push(`${f}: publishing.disabledFlagged`);
  for (const key of ["regeneratePaid", "regenerateNoCredits"]) {
    if (!j?.dashboard?.websiteBuilder?.[key]) missing.push(`${f}: websiteBuilder.${key}`);
  }
}
check("no locale offers a free regenerate", promisesFree.length === 0, promisesFree.join(", "));
check("the price and the refusal are in every locale", missing.length === 0, missing.join(", "));
check(
  "a refused run is said in the user's language",
  /code === "insufficient_credits"[\s\S]{0,120}t\("regenerateNoCredits"/.test(workspace),
);

console.log(`\n  ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILED:\n  " + failures.join("\n  "));
  process.exit(1);
}
