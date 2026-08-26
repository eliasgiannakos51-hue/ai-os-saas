// Two money bugs that had nothing to do with each other except who paid.
//
// #1 — THREE TRACKING MODULES CHARGED CREDITS FOR A DATABASE INSERT.
//
//   Website plans (build-modules.ts)  creditCost: 100  = EUR 2.00 on Starter
//   App notes     (build-modules.ts)  creditCost: 300  = EUR 5.00 on Growth
//   Automation    (modules.ts)        creditCost:  50  = half of a Free month
//
// Every one of them is a hand-typed row. build-modules.ts says so in its own
// header — "a table of rows the user types by hand, with no AI call anywhere
// in it" — and sidebar-naming.test.mjs proves it mechanically for the first
// two. /api/modules/create makes no model call of any kind; it validates the
// fields, inserts the row, and deducts. The add form never named a price
// before the click.
//
// #2 — THE WEBSITE ESTIMATE HELD FOR TWO CONTINUATION ROUNDS AND THE BUILDER
// RUNS UP TO FOUR. estimate.ts carried `continuationRounds: 2` under a
// comment asserting "MAX_CONTINUATION_ROUNDS = 2, see lib/website-builder.ts";
// that constant is 4, and its loop is `round <= MAX`, so one call plus four
// continuations. The hold was 26-32% short of what a full-length generation
// can cost, on every plan.
//
// Both are the same shape: a number in one file describing a fact that lives
// in another. So both are checked by DERIVING the fact rather than pinning
// the number.
//
// Run: node scripts/tests/module-charges.test.mjs
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
let pass = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const stripTs = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|\*).*$/gm, "");

console.log("module-charges");

// ---------------------------------------------------------------------
console.log("\n== 1. the module create route makes no AI call ==");
// ---------------------------------------------------------------------
// This is the PREMISE the rest of section 2 rests on, so it is established
// rather than assumed. If this route ever does call a model, the invariant
// below is the wrong one and this check is what says so.
const createRoute = stripTs(read("src/app/api/modules/create/route.ts"));
for (const marker of ["anthropic", "runCompletion", "messages.create", "openai"]) {
  check(`/api/modules/create does not reference ${marker}`, !createRoute.toLowerCase().includes(marker.toLowerCase()));
}
check("...and it does deduct credits, so a price here is a real charge", /deductCredits\s*\(/.test(createRoute));

// ---------------------------------------------------------------------
console.log("\n== 2. so no module declares a price ==");
// ---------------------------------------------------------------------
// Read as VALUES out of both registries, not as "the three known offenders
// are absent" — a fourth module added next month is the case this exists
// for.
const registries = ["src/lib/build-modules.ts", "src/lib/modules.ts"];
const priced = [];
let slugCount = 0;
for (const rel of registries) {
  const code = stripTs(read(rel));
  // Each module literal starts at `slug: "..."`; a creditCost belongs to the
  // slug that precedes it.
  const slugs = [...code.matchAll(/slug:\s*"([^"]+)"/g)];
  slugCount += slugs.length;
  for (const m of code.matchAll(/creditCost:\s*(\d+)/g)) {
    const owner = slugs.filter((s) => s.index < m.index).pop();
    priced.push(`${rel}:${owner ? owner[1] : "?"} = ${m[1]}`);
  }
}
// A floor, because "no module declares a price" is trivially true of a file
// the regex stopped reading. Nineteen module literals today.
check(`both registries were read (${slugCount} module definitions)`, slugCount >= 18, `found ${slugCount}`);
check(
  "no module charges credits for an insert",
  priced.length === 0,
  `priced: ${priced.join(", ")} — /api/modules/create calls no model, so a price here is money for a row the user typed`
);

// The routing that used to be a side effect of the price. Removing
// creditCost from `automation` would have moved it to a direct client
// insert and dropped the route's field validation with it.
const modules = stripTs(read("src/lib/modules.ts"));
const form = stripTs(read("src/components/modules/generic-add-form.tsx"));
check("ModuleConfig has an explicit serverInsert flag", /serverInsert\?:\s*boolean/.test(modules));
check("the automation module sets it", /serverInsert:\s*true/.test(modules));
check("and the form routes on it", /module\.serverInsert/.test(form));

// ---------------------------------------------------------------------
console.log("\n== 3. the estimate holds for as many rounds as the builder runs ==");
// ---------------------------------------------------------------------
const builder = stripTs(read("src/lib/website-builder.ts"));
const maxMatch = builder.match(/const\s+MAX_CONTINUATION_ROUNDS\s*=\s*(\d+)/);
check("MAX_CONTINUATION_ROUNDS is declared in the builder", Boolean(maxMatch));
const maxRounds = maxMatch ? Number(maxMatch[1]) : NaN;

// The loop bound decides what the constant MEANS. `round <= MAX` is one
// initial call plus MAX continuations; `round < MAX` would be MAX - 1. The
// estimate has to track the continuations, not the constant.
const inclusive = /for\s*\(\s*let\s+round\s*=\s*0;\s*round\s*<=\s*MAX_CONTINUATION_ROUNDS/.test(builder);
const exclusive = /for\s*\(\s*let\s+round\s*=\s*0;\s*round\s*<\s*MAX_CONTINUATION_ROUNDS/.test(builder);
check(`the continuation loop bound is readable (${inclusive ? "<=" : exclusive ? "<" : "neither"})`, inclusive || exclusive);
const continuations = inclusive ? maxRounds : maxRounds - 1;

const estimate = stripTs(read("src/lib/billing/estimate.ts"));
const roundsMatch = estimate.match(/continuationRounds:\s*(\d+)/);
check("websiteGenerate declares continuationRounds", Boolean(roundsMatch));
const declared = roundsMatch ? Number(roundsMatch[1]) : NaN;
check(
  `the estimate holds for ${declared} rounds and the builder runs up to ${continuations}`,
  declared === continuations,
  "a hold short of what the generation can cost is a balance that goes negative — the one thing a reservation exists to prevent"
);

// Rule: the comment that let the two disagree said they agreed. It must
// name the real number, or it will do it again.
const roundsComment = read("src/lib/billing/estimate.ts").match(
  /MAX_CONTINUATION_ROUNDS\s*=\s*(\d+),\s*see lib\/website-builder\.ts/
);
check(
  `the prose in estimate.ts names ${maxRounds}, not a stale number`,
  Boolean(roundsComment) && Number(roundsComment[1]) === maxRounds,
  roundsComment ? `it says ${roundsComment[1]}` : "the sentence naming the constant is gone"
);

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`
);
process.exit(failures.length === 0 ? 0 : 1);
