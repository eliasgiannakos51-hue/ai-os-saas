#!/usr/bin/env node
/*
 * A VALUE THAT CANNOT BE WHAT ITS NAME SAYS — REFUSED, AND NAMED.
 *
 * Run: node scripts/tests/env-shape.test.mjs
 *
 * THE GAP THIS CLOSES WAS NAMED AND LEFT OPEN. env-sensitivity.mjs's
 * own header ended: "the shape is taken from the NAME, which is all
 * this file knows — and a name that says URL and holds something else
 * is a different problem." It was written after the first `build:ci`
 * run passed 252 gates and then died in `next build` with
 *
 *     TypeError: Invalid URL
 *     Error: Failed to collect page data for /_not-found
 *
 * because NEXT_PUBLIC_SUPABASE_URL held a string that is not a URL. The
 * message names neither the variable nor the file.
 *
 * WHAT IS HELD HERE
 *
 *   1. ONE RULE, NOT TWO. The shapes live in
 *      scripts/lib/env-shape-rules.mjs and both readers — the sentinel
 *      builder and the build-time refusal — come from it. Two copies of
 *      a regex is two things that can disagree the first time either is
 *      edited.
 *   2. THE VALIDATOR ACTUALLY REFUSES, proved by calling it with a bad
 *      value of every shape it claims to know, and ACCEPTS a good one —
 *      both directions, because a validator that says no to everything
 *      passes the first half perfectly.
 *   3. ABSENT IS NOT MALFORMED. An unset variable and an empty string
 *      are a different, handled condition all over this repository, and
 *      this is the property that makes the build-time refusal safe: it
 *      can only rename a failure that was going to happen.
 *   4. THE BUILD CALLS IT, and calls it before anything else can fail
 *      anonymously.
 *   5. THE FATAL SET IS NEXT_PUBLIC_*, and the reason is written into
 *      next.config.mjs rather than implied here.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { shapeOf, sentinelFor, malformedReason, malformedEnvVars } from "../lib/env-shape-rules.mjs";
import { envVarsInExample } from "../lib/env-usage.mjs";

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const RULES = "scripts/lib/env-shape-rules.mjs";
const CONFIG = "next.config.mjs";
const SENSITIVITY = "scripts/env-sensitivity.mjs";

console.log("== 1. one rule, and both readers come from it ==");
{
  const sens = readFileSync(SENSITIVITY, "utf8");
  const cfg = readFileSync(CONFIG, "utf8");
  check("the sentinel builder imports the shared rules",
    /from "\.\/lib\/env-shape-rules\.mjs"/.test(sens), "it has its own copy again");
  check("...and does not carry its own shape regexes any more",
    !/URL\|URI\|ENDPOINT\|ORIGIN\|HOST/.test(sens),
    "a second copy of the shape rule is a second thing to edit and forget");
  check("the build config imports them too",
    /from "\.\/scripts\/lib\/env-shape-rules\.mjs"/.test(cfg));
  // ASKED BY RUNNING IT, NOT BY READING IT.
  //
  // This was `cfg.indexOf("refuseMalformedEnv();") < cfg.indexOf("export default")`,
  // and the mutation sidecar caught it within the hour: commenting the
  // call out leaves the string in the file, inside the comment, at the
  // same index. Green on a build config that refuses nothing. Fourth
  // time in this session a check of mine has matched its own text —
  // comments are not code, and here neither is a call that is not made.
  //
  // So the config is IMPORTED in a child process with a malformed
  // NEXT_PUBLIC_ value in its environment, and required to throw. The
  // child is given PATH and HOME and nothing else of this machine's, so
  // a stray variable here cannot decide the answer.
  const child = (env) => {
    try {
      execFileSync(process.execPath, ["-e", 'import("./next.config.mjs").then(() => process.exit(0), () => process.exit(7))'], {
        encoding: "utf8",
        stdio: "pipe",
        env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
        timeout: 120_000,
      });
      return 0;
    } catch (e) {
      return e.status ?? 1;
    }
  };
  check("importing the build config REFUSES a malformed NEXT_PUBLIC_ value",
    child({ NEXT_PUBLIC_SITE_URL: "abc" }) === 7,
    "the config loaded with a value that cannot produce a working bundle");
  check("...and loads when the same value is well-formed",
    child({ NEXT_PUBLIC_SITE_URL: "https://ionexa.app" }) === 0,
    "it refuses a value that would have worked, which is worse than not checking");
  check("...and loads when it is absent",
    child({}) === 0,
    "an unset variable is a different, handled condition and must not fail a build");
}

console.log("\n== 2. the shapes a name can promise, and what each refuses ==");
// EVERY SHAPE THE RULE FILE KNOWS, derived from the file rather than
// listed here: a shape added without a case below leaves this gate
// measuring less than it did.
const declaredShapes = [...new Set(
  [...readFileSync(RULES, "utf8").matchAll(/return "(url|email|number|key32|opaque)";/g)].map((m) => m[1])
)];
check(`the rule file declares ${declaredShapes.length} shapes (${declaredShapes.join(", ")})`,
  declaredShapes.length >= 5, declaredShapes.join(", "));

// name, a value that must be REFUSED, a value that must be ACCEPTED
const CASES = [
  ["NEXT_PUBLIC_SITE_URL", "abc", "https://ionexa.app"],
  ["NEXT_PUBLIC_SITE_URL", "ftp://files.example", "http://localhost:3000"],
  ["SUPPORT_EMAIL", "not-an-email", "help@ionexa.app"],
  ["ADMIN_EMAILS", "a@b.com, oops", "a@b.com, c@d.com"],
  ["CREDIT_PRICE_EUR", "banana", "0.02"],
];
for (const [name, bad, good] of CASES) {
  check(`${name}=${JSON.stringify(bad)} is refused (${shapeOf(name)})`,
    malformedReason(name, bad) !== null, "accepted a value its name says is impossible");
  check(`...and ${JSON.stringify(good)} is accepted`,
    malformedReason(name, good) === null, String(malformedReason(name, good)));
}
// THE OTHER DIRECTION FOR THE WHOLE VALIDATOR. A rule that refuses
// everything would pass every "is refused" above.
const shapesCovered = new Set(CASES.map(([n]) => shapeOf(n)));
check(`the cases cover ${shapesCovered.size} of the checked shapes (${[...shapesCovered].join(", ")})`,
  shapesCovered.size >= 3, [...shapesCovered].join(", "));
check("an opaque name is never refused, whatever it holds",
  malformedReason("ANTHROPIC_API_KEY", "anything at all !@#$") === null,
  "a key has no shape this file can know, and guessing one refuses working keys");

console.log("\n== 3. absent is not malformed ==");
// THE PROPERTY THAT MAKES THE BUILD-TIME REFUSAL SAFE.
for (const empty of [undefined, null, "", "   "]) {
  check(`NEXT_PUBLIC_SITE_URL=${JSON.stringify(empty)} is not a finding`,
    malformedReason("NEXT_PUBLIC_SITE_URL", empty) === null,
    "an unset variable is a different, handled condition — api/health reports it and half the product degrades on purpose");
}

console.log("\n== 4. the sentinel every instrument uses passes its own rule ==");
// THE BUG THIS IS ABOUT, in the other direction: a sentinel of the
// wrong shape made `next build` die and the tool cry wolf. Every
// sentinel the sensitivity sweep hands out must be a value its own
// validator accepts, or build:ci fails on its instrument rather than on
// the repository.
const names = [...envVarsInExample()];
check(`the project declares variables (${names.length})`, names.length >= 100, String(names.length));
const selfRejecting = names.filter((n) => malformedReason(n, sentinelFor(n)) !== null);
check("every sentinel is a value the rule accepts", selfRejecting.length === 0,
  selfRejecting.map((n) => `${n}=${sentinelFor(n)} — ${malformedReason(n, sentinelFor(n))}`).join("\n        "));

console.log("\n== 5. the population is the project's own names ==");
// AND NOT THE MACHINE'S. The first version of the build-time check read
// every variable in process.env and reported
// CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST — a container variable ending in
// _HOST that holds a boolean. A rule about what a name in THIS
// repository promises has to range over the names this repository
// declares.
const cfg = readFileSync(CONFIG, "utf8");
check("the build reads the project's declared names, not process.env's keys",
  /envVarsInExample\(\)/.test(cfg) && !/Object\.keys\(process\.env\)/.test(cfg),
  "a _HOST from the container is not this project's variable");
const shaped = names.filter((n) => shapeOf(n) !== "opaque");
check(`${shaped.length} of the ${names.length} declared names have a shape to check`,
  shaped.length >= 5 && shaped.length < names.length,
  "either the shape rule stopped matching, or it now claims to know every key's format");
console.log(`        ${shaped.map((n) => `${n}:${shapeOf(n)}`).join(", ")}`);

console.log("\n== 6. the fatal set, and why it is not everything ==");
check("NEXT_PUBLIC_* is fatal", /startsWith\("NEXT_PUBLIC_"\)/.test(cfg));
check("...and the rest is reported, not fatal",
  /env WARNING \(not failing\)/.test(cfg),
  "a value the build never reads must not become a new way for a deploy to go red");
check("...and the split carries its reason in the file",
  /BAKED INTO THE BUNDLE/.test(cfg) && /NEW way for a deploy\s*\n\s*\*\s*to go red/.test(cfg),
  "a split with no argument beside it is one the next reader deletes");
const fatalNow = malformedEnvVars(process.env, names).filter((b) => b.name.startsWith("NEXT_PUBLIC_"));
check("this machine holds no malformed NEXT_PUBLIC_ value", fatalNow.length === 0,
  fatalNow.map((b) => `${b.name} ${b.why}`).join(", "));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
