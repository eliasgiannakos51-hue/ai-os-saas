#!/usr/bin/env node
/*
 * EVERY LARGE ACTION SHOWS ITS PRICE BEFORE THE BUTTON.
 *
 * The owner's rule, 2026-10-02: "Κόστος-πριν σε κάθε ακριβό feature".
 * "Large" is not a list anybody types. It is the product's own line,
 * LARGE_ACTION_CONFIRM_THRESHOLD in lib/billing/pricing-config.ts, applied
 * to what the estimator says each action costs on each plan — the rows
 * scripts/price-table.mjs prints, computed once in scripts/lib/
 * price-rows.mjs and read here, so the gate and the table cannot drift.
 *
 * WHY THE SCREENS ARE LISTED BY HAND. A scan for them found 11 of 30 and
 * missed Deep Research and the agent depths, which are two of the four
 * largest; scripts/lib/cost-shown-before.mjs says why. So the list is
 * explicit and this file holds it both ways:
 *
 *   1  the population is real: the estimator found actions, and some are
 *      large — an empty population would pass every check below
 *   2  every large action has an entry, and every entry's expression is
 *      in its file WITH THE COMMENTS STRIPPED — a sentence about the
 *      number is not the number
 *   3  no entry is stale: each names an action the estimator still has
 *
 * WHAT IT CANNOT SAY: that the number on screen is the right number, or
 * that it appears before the press rather than after. The first is
 * estimate.ts's own gates; the second is each screen's prodtest.
 *
 * Run: node scripts/tests/cost-before.test.mjs
 */
import { readFileSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";
import { rows, config, PLANS } from "../lib/price-rows.mjs";
import { SHOWN_BEFORE } from "../lib/cost-shown-before.mjs";

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
};

const threshold = config.largeActionConfirmThreshold;
const large = rows.filter((r) => PLANS.some((p) => r.credits[p] > threshold));

console.log("== 1. the population ==");
console.log(
  `        ${rows.length} priced actions; ${large.length} over ${threshold} credits on some plan: ` +
    large.map((r) => `${r.action} (up to ${Math.max(...PLANS.map((p) => r.credits[p]))})`).join(", "),
);
check("the estimator priced every action it has a profile for", rows.length >= 20, `${rows.length} rows`);
check(
  "...and no row came out as NaN — a price nobody can read is not a price",
  rows.every((r) => PLANS.every((p) => Number.isFinite(r.credits[p])) && Number.isFinite(r.eur)),
  rows.filter((r) => !Number.isFinite(r.eur)).map((r) => r.action).join(", "),
);
check("some actions are large — an empty population would pass everything below", large.length >= 1);
check(
  "...and the two the owner named are among them (Deep Research, a website)",
  ["deepResearch", "websiteGenerate"].every((a) => large.some((r) => r.action === a)),
  large.map((r) => r.action).join(", "),
);

console.log("\n== 2. every large action is on a screen before the button ==");
for (const r of large) {
  const entry = SHOWN_BEFORE[r.action];
  check(`${r.action}: has an entry in scripts/lib/cost-shown-before.mjs`, Boolean(entry));
  if (!entry) continue;
  let code = "";
  try {
    code = stripComments(readFileSync(entry.file, "utf8"));
  } catch {
    code = "";
  }
  check(`${r.action}: ${entry.file} renders \`${entry.renders}\``, code.includes(entry.renders));
}

console.log("\n== 3. no entry is stale ==");
const actions = new Set(rows.map((r) => r.action));
for (const [action, entry] of Object.entries(SHOWN_BEFORE)) {
  check(`${action}: still a priced action`, actions.has(action));
  let code = "";
  try {
    code = stripComments(readFileSync(entry.file, "utf8"));
  } catch {
    code = "";
  }
  check(`${action}: its expression is still in ${entry.file}`, code.includes(entry.renders));
}

console.log(
  failures.length
    ? `\nFAILURES: ${pass} passed, ${failures.length} failed`
    : `\nALL PASS: ${pass} passed, 0 failed`,
);
process.exit(failures.length ? 1 : 0);
