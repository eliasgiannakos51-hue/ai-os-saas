// «ΠΟΣΑ ΣΟΥ ΑΠΟΜΕΝΟΥΝ» ΠΡΙΝ ΑΠΟ ΜΙΑ ΑΚΡΙΒΗ ΕΝΕΡΓΕΙΑ (owner, item 1.7 of
// docs/QUEUE.md, 2026-11-09): the shared pre-submit price hint
// (components/credits/cost-estimate.tsx's CostEstimateHint, used by 14
// tool shells) said only the cost. It now also says the balance it would
// be spent from, reusing the SAME useCredits() the top nav and the
// editor-shell balance chip already read — no new fetch, no new state.
//
// What this holds:
//   1. creditsHintKey(remaining, isAdmin): the pure decision — an admin
//      account is never charged (credits-context.tsx's own note), so a
//      balance here would be a number that means nothing; `null` is "not
//      read yet", not "zero", so it says only the price until the real
//      balance answers.
//   2. CostEstimateHint reads both the cost (its own prop) and the
//      balance (useCredits()), and both reach the SAME text whether it is
//      drawn here or registered into the editor field (useFieldCost) —
//      one text-building function, not two copies that can drift.
//   3. The new key exists, with a {remaining} placeholder, in all ten
//      languages, and is a DIFFERENT string from the plain "approx" key
//      wherever it is a real sentence (not just count).
//
// Run: node scripts/tests/cost-estimate-remaining.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";
import { loadTs } from "./load-ts.mjs";

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
const read = (p) => readFileSync(p, "utf8");
const code = (p) => stripComments(read(p));

const FILE = "src/components/credits/cost-estimate.tsx";
const HINT = "src/components/credits/credits-hint.ts";
const mod = await loadTs(HINT);

console.log("cost-estimate-remaining");

console.log("\n== 1. creditsHintKey: the pure decision ==");
check("a real balance, not admin: the richer key", mod.creditsHintKey(140, false) === "approxWithRemaining");
check("admin: the plain key, whatever the number", mod.creditsHintKey(999999, true) === "approx");
check("admin with a zero balance: still the plain key (the number means nothing for this account)", mod.creditsHintKey(0, true) === "approx");
check("balance not read yet (null): the plain key, never a false zero", mod.creditsHintKey(null, false) === "approx");
check("a real balance of exactly zero is still a real balance", mod.creditsHintKey(0, false) === "approxWithRemaining");

console.log("\n== 2. CostEstimateHint: one text, both places it can land ==");
const src = code(FILE);
check("it reads the account's own balance, the same hook top-nav/editor-shell use", /const \{ credits: remaining, isAdmin \} = useCredits\(\);/.test(src));
check("the key comes from the pure decision, not a second copy of the rule", /const key = creditsHintKey\(remaining, isAdmin\);/.test(src));
check(
  "one function builds the text; the drawn line and the field registration both call it",
  (src.match(/text\(credits\)/g) ?? []).length === 2,
  src.match(/text\(credits\)/g)?.join(",")
);
check(
  "the richer key passes `remaining` as a real number, never the possibly-null state variable unchecked",
  /t\(key, \{ count: c, remaining: remaining as number \}\)/.test(src),
);
check("credits-context.tsx is imported from its real path, not re-declared", /from "@\/components\/credits\/credits-context"/.test(src));
check("the decision comes from the pure, tested module, not re-declared here", /from "@\/components\/credits\/credits-hint"/.test(src) && !/export function creditsHintKey/.test(src));

console.log("\n== 3. the words, in every language ==");
const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
check(`the ten languages (${LOCALES.length})`, LOCALES.length === 10);
for (const locale of LOCALES) {
  const estimate = JSON.parse(read(`messages/${locale}.json`)).credits?.estimate ?? {};
  check(`${locale}: approxWithRemaining exists`, typeof estimate.approxWithRemaining === "string" && estimate.approxWithRemaining.trim().length > 0);
  check(`${locale}: it carries a {remaining} placeholder`, /\{remaining[,}]/.test(estimate.approxWithRemaining ?? ""));
  check(`${locale}: it carries the same {count} as approx`, /\{count[,}]/.test(estimate.approxWithRemaining ?? ""));
  check(
    `${locale}: it is a different sentence from the plain "approx" (the balance clause was actually added)`,
    estimate.approxWithRemaining !== estimate.approx,
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
