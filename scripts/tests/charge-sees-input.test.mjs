#!/usr/bin/env node
/*
 * DOES EVERY CHARGE LOOK AT THE SIZE OF WHAT IT IS CHARGING FOR?
 *
 * THE QUESTION THIS ANSWERS, asked on 2026-09-16: how many features
 * charge without looking at the input? A flat price on variable work is
 * the maxFileMb shape pointed at money — it is right on the average
 * request and wrong on both ends, and the user who notices is the one
 * who was overcharged.
 *
 * WHAT WAS FOUND WHEN IT WAS ASKED. Nothing, which is why this file
 * exists to keep it that way rather than to fix something:
 *
 *   voice           transcribeCostUsd(seconds) — by DURATION
 *   files/ask       context.totalChars + question × passes
 *   pdf + translate system.length + input.length
 *   data-analysis   ANALYSIS_SYSTEM.length + brief.length, and the brief
 *                   is sized by COLUMNS — deliberately, because the model
 *                   never sees the rows, so a 50,000-row and a 200-row
 *                   file with the same columns cost the same and pricing
 *                   by upload size would be charging for storage
 *   deep research   topic length plus a constant search ceiling, and it
 *                   SETTLES on measured usage
 *   modules/create  a flat branch that no module reaches: every
 *                   creditCost was removed (module-charges.test.mjs)
 *
 * ------------------------------------------------------------------
 * THE RULE, AND WHY IT IS NOT "inputChars MUST EXIST"
 * ------------------------------------------------------------------
 *
 * Every route that reserves credits sizes the hold with
 * estimateForAction. What matters is not that it passes `inputChars` —
 * they all do — but that the VALUE VARIES WITH THE REQUEST. A route
 * passing only the length of its own system prompt is passing a
 * constant: the same hold for a haiku and for a novel.
 *
 * So the check is: the expression must mention at least one identifier
 * that is not a module-level constant. `SYSTEM.length + brief.length`
 * passes because `brief` is built per request; `SYSTEM.length` alone
 * would not.
 *
 * IT READS THE EXPRESSION, WHICH IS A LINE-LEVEL TOOL MAKING A CLAIM
 * ABOUT WHAT A VALUE DOES AT RUNTIME (docs/shapes.md, "A line-level tool
 * asserting a structural property"). It cannot tell a `const brief`
 * assigned once at module scope from one assigned per request — so the
 * floor below asserts the scan FOUND routes, and the allowlist is
 * checked in both directions, and that is as far as text can go. The
 * behavioural half is scripts/tests/website-margin-real-numbers.itest.mjs
 * and the settlement path, which charge on MEASURED usage regardless of
 * what the estimate guessed.
 *
 * Run: node scripts/tests/charge-sees-input.test.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL  ${name}\n        ${detail}`); }
};

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e === "route.ts") out.push(p);
  }
  return out;
}

const routes = walk("src/app/api");
console.log("== 1. the routes that size a hold were found ==");
const sizing = routes.filter((f) => /estimateForAction\(/.test(stripComments(readFileSync(f, "utf8"))));
// THE FLOOR. An empty scan agrees with every rule below it.
check(`routes that call estimateForAction (${sizing.length})`, sizing.length >= 15,
  "an empty scan makes every check below vacuous");

console.log("\n== 2. every hold is sized by something that varies with the request ==");
// ONE CLASSIFIER, USED BY THE SCAN AND BY ITS OWN CONTROL BELOW.
// The first version wrote the logic twice — once in the loop, once in
// the positive control — so mutating the real one left the control
// passing and the vacuity survived. A control that tests a COPY of the
// thing tests nothing about the thing.
const NOISE = ["length", "reduce", "sum", "String", "JSON", "stringify", "Math", "max", "min", "join"];
function varyingIdentifiers(expr, moduleConsts) {
  return [...expr.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)]
    .map((x) => x[1])
    .filter((id) => !NOISE.includes(id))
    .filter((id) => !moduleConsts.has(id));
}
const FLAT_PRICE = /creditCost:\s*(\d+)/g;

const flat = [];
for (const file of sizing) {
  const src = stripComments(readFileSync(file, "utf8"));
  // Module-level constants: SCREAMING_CASE, or a `const X =` at column 0.
  const moduleConsts = new Set([
    ...[...src.matchAll(/^const ([A-Za-z_$][\w$]*)\s*=/gm)].map((m) => m[1]),
    ...[...src.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)].map((m) => m[1]),
  ]);
  for (const m of src.matchAll(/inputChars:\s*([^,\n}]+)/g)) {
    const expr = m[1].trim();
    const varying = varyingIdentifiers(expr, moduleConsts);
    if (varying.length === 0) flat.push(`${file.replace("src/app/api/", "")}: inputChars: ${expr}`);
  }
}
check("no route sizes its hold from constants alone", flat.length === 0,
  flat.join("\n        "));

// AND THE DETECTOR CAN STILL TELL A CONSTANT FROM A VARIABLE.
//
// `flat.length === 0` is satisfied by a detector that classifies
// everything as varying, which is the gate-vacuity shape: an emptiness
// assertion over a scan that stopped scanning. charge-sees-input.mutation
// proved it — replacing `varying` with every identifier left this file
// green. So the classifier is exercised on two expressions whose answer
// is known.
{
  const consts = new Set(["ANALYSIS_SYSTEM", "SYSTEM"]);
  check("...and a constants-only expression is recognised as flat",
    varyingIdentifiers("ANALYSIS_SYSTEM.length", consts).length === 0);
  check("...and one carrying a per-request value is not",
    varyingIdentifiers("ANALYSIS_SYSTEM.length + brief.length", consts).length === 1,
    "the classifier can no longer tell a constant from a variable");
}

console.log("\n== 3. and a flat price is not charged for variable work ==");
// Every module creditCost was removed once it was noticed that the
// charge was for inserting a row the user had typed by hand. The branch
// in api/modules/create still exists; nothing may reach it.
const modules = readFileSync("src/lib/build-modules.ts", "utf8") + readFileSync("src/lib/modules.ts", "utf8");
// FLOORED BEFORE IT IS FILTERED, which gate-vacuity.test.mjs requires and
// was right to: "no module charges" is trivially true of a read that
// returned nothing. The line count is the evidence the corpus was
// actually read; stillCharging derives from it, so the floor reaches the
// emptiness assertion below through the chain.
const moduleLines = stripComments(modules).split("\n");
check(`the module definitions were read (${moduleLines.length} lines)`, moduleLines.length >= 50,
  "an empty read makes the check below inspect nothing");
const stillCharging = moduleLines.filter((line) => new RegExp(FLAT_PRICE.source).test(line));
check("no module charges a flat price for a hand-typed row", stillCharging.length === 0,
  stillCharging.join("\n        "));
// THE SAME FLOOR: an empty match list agrees with any rule. The pattern
// is run against a line that is known to carry a charge, so "none found"
// cannot mean "stopped looking".
check("...and the scan can still see one when it is there",
  new RegExp(FLAT_PRICE.source).test("  creditCost: 100,"),
  "the flat-price pattern matches nothing, so the check above inspects nothing");

console.log("\n== 4. the metered features meter ==");
const voice = readFileSync("src/app/api/voice/transcribe/route.ts", "utf8");
check("voice transcription is priced from its duration",
  /transcribeCostUsd\(\s*seconds\s*\)/.test(stripComments(voice)),
  "a flat price per clip would overcharge a sentence and undercharge a lecture");
const speak = readFileSync("src/app/api/voice/speak/route.ts", "utf8");
check("speech synthesis is priced from its text",
  /speakCostUsd\(|\.length/.test(stripComments(speak)));

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`ALL PASS: ${pass} passed, 0 failed`);
