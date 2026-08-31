#!/usr/bin/env node
/*
 * WHAT ACTUALLY RUNS WITHOUT SOMEBODY REMEMBERING TO RUN IT.
 *
 * THE DEFECT THIS EXISTS FOR, read out of the repository's own run
 * history: thirty push runs of .github/workflows/verify.yml and ZERO
 * schedule runs. The browser-test job's `if:` names `schedule` and
 * `workflow_dispatch`, so on a push it is skipped — which means the
 * thirty-seven *.prodtest.mjs files had never executed in CI at all.
 *
 * What that cost was measured by running one of them by hand:
 * routes-smoke.prodtest.mjs was CRASHING at its fifth section, and eight
 * of its assertions named sidebar groups and page titles from before the
 * V4.6 #3 consolidation. A suite nothing runs stops being a suite.
 *
 * AND THE FILE'S OWN PROSE HAD DRIFTED TOO. It said "thirty-one
 * *.prodtest.mjs files". There were thirty-seven. A number in a comment
 * is a number nothing checks — so this file checks the STRUCTURE instead
 * of trusting the prose: every suite family that exists in
 * scripts/tests/ must be named by some job in the workflow.
 *
 * Run: node scripts/tests/ci-coverage.test.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (typeof cond !== "boolean") {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        check() takes a BOOLEAN; got ${Array.isArray(cond) ? "an array" : typeof cond}`);
    return;
  }
  if (cond) pass++;
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}

const WORKFLOW = ".github/workflows/verify.yml";
check("the workflow exists at all", existsSync(WORKFLOW),
  "without one, the only automatic guard is a pre-commit hook");
const wf = readFileSync(WORKFLOW, "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const suites = readdirSync("scripts/tests");

console.log("== 1. every family of suite is named by some job ==");
{
  // family -> the npm script or command that runs it. A family with files
  // and no runner is a family nothing executes.
  const FAMILIES = [
    [".test.mjs", "test:unit", /npm run build|npm run test:unit/],
    [".mutation.mjs", "test:mutation", /npm run test:mutation/],
    [".dbtest.mjs", "test:db", /npm run test:db/],
    [".itest.mjs", "test:integration", /npm run test:integration/],
    [".prodtest.mjs", "test:prod", /npm run test:prod|routes-smoke\.prodtest\.mjs/],
  ];
  for (const [ext, script, inWorkflow] of FAMILIES) {
    const count = suites.filter((f) => f.endsWith(ext)).length;
    check(`there are ${ext} suites to run (${count})`, count >= 1);
    check(`  package.json has a script for ${ext} (${script})`, typeof pkg.scripts?.[script] === "string");
    check(`  and the workflow runs it`, inWorkflow.test(wf),
      `nothing in ${WORKFLOW} matches ${inWorkflow}`);
  }
}

console.log("== 2. the browser tests run on a push, not only on a schedule ==");
{
  // The nightly job is fine as a nightly job. What was missing was
  // anything at all on a push — and a schedule that has never fired is
  // indistinguishable, from the outside, from no coverage.
  check("a job runs a browser test on every push",
    /prodtest-smoke:/.test(wf) && /node scripts\/tests\/routes-smoke\.prodtest\.mjs/.test(wf),
    "the nightly job's `if:` skips it on a push");
  const smokeBlock = wf.slice(wf.indexOf("prodtest-smoke:"), wf.indexOf("prodtests:"));
  check("...and that job is NOT gated on the schedule event",
    !/if:\s*github\.event_name == 'schedule'/.test(smokeBlock),
    "gating it the same way would reproduce the gap exactly");
  check("...and it installs a browser", /playwright install/.test(smokeBlock));
  check("...and it has a timeout, so a wedged run does not sit for six hours",
    /timeout-minutes:/.test(smokeBlock));
  check("the nightly job still exists for the rest", /prodtests:/.test(wf) && /npm run test:prod/.test(wf));
}

console.log("== 3. no count is written into the prose where nothing checks it ==");
{
  // The specific rot this file was written after: "thirty-one
  // *.prodtest.mjs files" in a comment beside thirty-seven of them.
  // NOT GLOBAL. `.test()` on a /g regex advances lastIndex and returns
  // false on every other call, so a filter over many lines would skip
  // half of them — the exact trap scripts/tests/injection-patterns.test.mjs
  // was written after.
  const WRITTEN_NUMBER = /\b(twenty|thirty|forty|fifty|sixty)-?\w*\s+\*?\.?(prodtest|mutation|dbtest|itest|test)\b/i;
  // THE FLOOR ON THE THING BEING SCANNED, which is the comment lines: a
  // filter over an empty list finds no claims and passes.
  const prose = wf.split("\n").filter((l) => l.trim().startsWith("#"));
  check(`the workflow's comments were read (${prose.length} lines)`, prose.length >= 20,
    "an empty read makes the check below vacuous");
  const claims = prose.filter((l) => WRITTEN_NUMBER.test(l));
  check("the workflow states no suite count in words", claims.length === 0,
    `a number in a comment is a number nothing checks: ${claims.join(", ")}`);
}

console.log("== 4. the build gate needs no secret ==");
{
  // A build that needs env vars is a build a clean clone cannot do, and
  // the step's own name promises this.
  const verifyBlock = wf.slice(wf.indexOf("  verify:"), wf.indexOf("prodtest-smoke:"));
  const buildStep = verifyBlock.slice(verifyBlock.indexOf("- name: build"));
  check("the build step supplies no env block",
    !/^\s+env:/m.test(buildStep.slice(0, buildStep.indexOf("- name:", 5) + 1 || undefined)),
    "a build that needs a secret cannot be reproduced from a clean clone");
  check("...and the database step reads the log for a SKIP",
    /SKIPPED/.test(wf) && /false green/.test(wf),
    "run-dbtests.mjs exits 0 when no Postgres is reachable");
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
