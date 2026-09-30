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
// WHAT THE WORKFLOW RUNS, WITH ITS PROSE STRIPPED.
//
// This file's own mutation sidecar caught the reason on its first run:
// the "CI stops running the gates" mutant replaced `run: npm run gates`
// with `run: echo skipped` and section 1 stayed GREEN, because the
// phrase `npm run gates` also appears in the comment paragraph above
// that step explaining why it exists. Fifth time in one session that a
// check of mine has matched its own commentary.
//
// `wf` is kept for section 3, which reads the prose ON PURPOSE — it is
// the section about numbers written into comments where nothing checks
// them. Everything that asks "does CI RUN this" reads wfCode.
const wfCode = wf
  .split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const suites = readdirSync("scripts/tests");

console.log("== 1. every family of suite is named by some job ==");
{
  // family -> the npm script or command that runs it. A family with files
  // and no runner is a family nothing executes.
  const FAMILIES = [
    // WAS `/npm run build|npm run test:unit/`, and the first half of that
    // alternation stopped being true on 2026-09-27: the unit suites left
    // `npm run build` for `npm run gates`. An alternation that keeps a
    // stale branch is one that passes on the stale branch.
    [".test.mjs", "test:unit", /npm run gates|npm run test:unit/],
    [".mutation.mjs", "test:mutation", /npm run test:mutation/],
    [".dbtest.mjs", "test:db", /npm run test:db/],
    [".itest.mjs", "test:integration", /npm run test:integration/],
    [".prodtest.mjs", "test:prod", /npm run test:prod|routes-smoke\.prodtest\.mjs/],
  ];
  for (const [ext, script, inWorkflow] of FAMILIES) {
    const count = suites.filter((f) => f.endsWith(ext)).length;
    check(`there are ${ext} suites to run (${count})`, count >= 1);
    check(`  package.json has a script for ${ext} (${script})`, typeof pkg.scripts?.[script] === "string");
    check(`  and the workflow runs it`, inWorkflow.test(wfCode),
      `nothing in ${WORKFLOW} matches ${inWorkflow}`);
  }
}

console.log("== 1b. the build BUILDS, and the checks are a step of their own ==");
// ---------------------------------------------------------------------
// ASKED FOR ON 2026-09-27, after a Vercel log finally arrived:
//
//   19:28:15  mutation-tree: ...WARNING (advisory, not failing)
//   19:30:04  Error: Command "npm run build" exited with 1
//
// `npm run build` is what Vercel runs, and it ran the function limits,
// the marker check, the mutation-tree check, the i18n check and all 294
// unit gates before compiling a line. Two minutes of checks about this
// repository's own conventions, on the critical path of every
// deployment — and a gate that goes red there takes the DEPLOY with it.
// A build should build.
//
// THREE CLAIMS, NOT ONE, because a build that stops testing and a CI
// that never started is strictly worse than what was there before:
//
//   1. `build` contains no checker and no suite.
//   2. `build` still contains the one step that PRODUCES rather than
//      checks — apply-function-limits REWRITES the route files'
//      maxDuration literals, so a build without it ships different code
//      — and still compiles.
//   3. Every checker that left is named in `gates`, and section 1 above
//      requires the workflow to run it on every push.
{
  const build = pkg.scripts.build ?? "";
  const gates = pkg.scripts.gates ?? "";
  const CHECKERS = [
    "check-mutation-markers.mjs",
    "check-mutation-tree.mjs",
    "check-i18n.js",
    "build-identity.mjs",
    "test:unit",
  ];
  const leftBehind = CHECKERS.filter((c) => build.includes(c));
  check(`the build runs no checker (${build})`, leftBehind.length === 0,
    `${leftBehind.join(", ")} — a check on the deploy's critical path can take production down`);
  check("...and no suite of any kind", !/\.test\.mjs|test:unit|run-gates/.test(build), build);
  // THE OTHER DIRECTION, AND IT IS THE ONE THAT MATTERS: an empty build
  // script satisfies every clause above.
  check("the build still rewrites the function limits — producing, not checking",
    build.includes("apply-function-limits.mjs"), build);
  check("...and still compiles", /next build/.test(build), build);
  const homeless = CHECKERS.filter((c) => !gates.includes(c));
  check(`every checker that left the build is in gates (${CHECKERS.length})`,
    homeless.length === 0,
    `${homeless.join(", ")} — moved out of the build and into nothing`);
  check("...and gates is not the build under another name", !/next build/.test(gates), gates);
}

console.log("== 1c. the deployment itself is tried, by something ==");
// ---------------------------------------------------------------------
// A SIXTH FAMILY, and it is not a *.mjs one: checks/*.md are the briefs
// the e2e-bot drives a real, signed-in deployment with. Same rule as
// section 1 — a family with files and no runner is a family nothing
// executes — and the same failure it exists to prevent: checks/make.md
// was written on 2026-09-27 and nothing anywhere ran it.
{
  const checkFiles = readdirSync("checks").filter((f) => f.endsWith(".md") && f !== "README.md");
  check(`there are check files to run (${checkFiles.length})`, checkFiles.length >= 1, checkFiles.join(", "));
  check("some job runs the bot", /node scripts\/e2e-bot\.mjs/.test(wfCode),
    `nothing in ${WORKFLOW} runs scripts/e2e-bot.mjs`);
  // EVERY check file, not the one that happened to be named first. A
  // job naming basic.md alone would report on nine checks and stay
  // silent about the four that cost money.
  for (const f of checkFiles) {
    check(`  ...and it names checks/${f}`, wfCode.includes(`checks/${f}`),
      `the job runs the bot but never passes checks/${f}`);
  }

  // THE THREE FENCES ROUND A JOB THAT SPENDS REAL MONEY.
  //
  // Without them this is a bill: deployment_status fires for every
  // preview too, and a job that ran on each of them would generate a
  // website per push. Each fence is checked by what it does rather than
  // by the comment above it.
  check("it runs only on a SUCCESSFUL deployment",
    /github\.event\.deployment_status\.state == 'success'/.test(wfCode),
    "a failed deployment would be driven as if it were live");
  // THE FILTER MOVED OUT OF THE JOB'S `if:` on 2026-09-30, because a job
  // that does not match one is `skipped` — a grey tick with no reason.
  // It is now a step that PRINTS what it saw and gates the rest on its
  // own output, so a preview says so in one line instead of being
  // invisible, and a changed environment string is visible rather than
  // silently stopping the bot forever.
  check("...only a PRODUCTION one, never a preview",
    /production\|prod\) is_prod=true/.test(wfCode) &&
      /steps\.which\.outputs\.is_production == 'true'/.test(wfCode),
    "every preview deployment would spend credits");
  check("...and the environment it saw is printed, so a skip is never silent",
    /echo "- environment:/.test(wfCode) && /the bot runs here:/.test(wfCode),
    "a deployment that does not match leaves no trace of why");
  // CASE-INSENSITIVE, because the exact string is Vercel's to choose.
  check("...matched without depending on its capitalisation",
    /tr '\[:upper:\]' '\[:lower:\]'/.test(wfCode),
    "a rename from Production to production would stop the bot silently");
  check("...and the billable checks are capped",
    /BOT_COST_LIMIT: "\d+"/.test(wfCode),
    "nothing bounds how many paid generations one run can make");

  // AND IT IS AIMED AT THE DEPLOYMENT THAT FIRED THE EVENT, not at a URL
  // typed into this file — which is how a bot ends up reporting on a
  // deployment from last month.
  check("the target is the event's own environment_url",
    /BOT_BASE_URL: \$\{\{ github\.event\.deployment_status\.environment_url \}\}/.test(wfCode),
    "the bot is pointed at a hard-coded address");

  // A MISSING SECRET IS RED, NOT GREEN. Skipping the job when the
  // credentials are absent produces a tick on a deployment nobody tried.
  // SCOPED TO THE STEP, because `exit 1` appears elsewhere in this
  // workflow and an unscoped search for it was satisfied by a line in
  // another job. Its own mutation run found that: deleting the exit from
  // the credentials step left this green.
  {
    const step = wfCode.slice(
      wfCode.indexOf("- name: the credentials exist"),
      wfCode.indexOf("- name: try every Make feature")
    );
    check("a missing credential fails the job rather than skipping it",
      /if \[ -z "\$\{\{ secrets\.BOT_EMAIL \}\}" \]/.test(step) && /exit 1/.test(step),
      "the job goes green when it cannot sign in");
  }

  // THE REPORT SURVIVES A FAILURE, which is the run whose report is
  // wanted.
  check("the report is uploaded even when the run fails",
    /if: always\(\)[\s\S]{0,200}upload-artifact/.test(wfCode),
    "broken.md is thrown away exactly when it matters");
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

console.log("== 3b. a red run tells somebody ==");
{
  // THE COST OF NOBODY FINDING OUT, measured on this repository: thirty
  // push runs, thirteen failures, the same step failing in every one, for
  // twenty commits before anybody read the history. GitHub emails the
  // pusher, which on a branch pushed by automation is nobody.
  const alertBlock = wf.slice(wf.indexOf("  alert:"));
  check("there is a job that runs when CI goes red", /^\s{2}alert:/m.test(wf),
    "a CI nobody looks at is the same as a CI that does not exist");
  check("...gated on failure(), so it does not fire on green", /if: failure\(\)/.test(alertBlock));
  // EVERY JOB, DERIVED — because the first version of this check named
  // the two jobs the alert happened to list, and the workflow had three.
  // The nightly `prodtests` job, the only one that runs the full browser
  // suite, was outside the alert's `needs`, so a red nightly would have
  // failed in silence — and this gate PINNED that hole in place by
  // asserting the exact incomplete list. A gate that spells out the
  // answer it is checking cannot notice when the answer is wrong.
  // FROM INSIDE `jobs:` ONLY. `on:` has two-space children of its own
  // (push, schedule, workflow_dispatch), and the first version of this
  // counted them as jobs — reporting "3/7" and naming `push` as a job
  // that can fail unwatched. A wrong denominator is a wrong finding.
  const jobsBlock = wf.slice(wf.search(/^jobs:$/m));
  const jobNames = [...jobsBlock.matchAll(/^ {2}([a-z][\w-]*):$/gm)].map((m) => m[1]);
  check(`the workflow's jobs were parsed (${jobNames.join(", ")})`, jobNames.length >= 3, jobNames.join(","));
  const needsLine = alertBlock.match(/needs:\s*\[([^\]]*)\]/);
  const alertNeeds = needsLine ? needsLine[1].split(",").map((x) => x.trim()).filter(Boolean) : [];
  const unwatched = jobNames.filter((j) => j !== "alert" && !alertNeeds.includes(j));
  check(
    `...and it waits for every job it reports on (${alertNeeds.length}/${jobNames.length - 1})`,
    needsLine !== null && unwatched.length === 0,
    unwatched.length
      ? `${unwatched.join(", ")} can fail without opening an issue`
      : "a job with no `needs` runs before the thing it is meant to report has finished"
  );
  check("...it opens an issue, which survives a closed tab",
    /issues\.create\(/.test(alertBlock) && /issues: write/.test(wf));
  check("...and de-duplicates rather than filing one per push",
    /listForRepo/.test(alertBlock) && /createComment/.test(alertBlock),
    "an issue per failing push turns the tracker into a log nobody reads");
  check("...linking the run, the commit and the branch",
    /actions\/runs\/\$\{context\.runId\}/.test(alertBlock) && /context\.sha/.test(alertBlock));
}

console.log("== 3c. an expression the workflow pastes into JavaScript is a literal, not a template ==");
// ---------------------------------------------------------------------
// ONE PAIR OF BACKTICKS killed this workflow's unmerged-branches job on
// every run for as long as the report contained a code span:
//
//   const body = `${{ toJSON(steps.look.outputs.report) }}`.replace(...)
//   SyntaxError: Unexpected identifier 'node'
//
// toJSON() emits a JSON string, quotes and all, and JSON string syntax
// is a subset of JavaScript's — so the substitution already IS the
// literal. Wrapping it in a template meant the first backtick inside the
// markdown ended the string, and the word after it ("node", from
// "`node scripts/unmerged-branches.mjs`") became a syntax error.
//
// The job still ran, still built the report, and still failed — a
// failure in the thing that exists to report failures.
{
  // THE FLOOR FIRST, and the emptiness check DERIVED from it. A
  // workflow that stopped using toJSON at all would satisfy "none is
  // wrapped" by having none — the vacuity shape gate-vacuity.test.mjs
  // holds at zero, and it caught this block's first draft, where the
  // two collections were scanned independently and the floor was on the
  // wrong one.
  const uses = [...wfCode.matchAll(/\$\{\{\s*toJSON\([^)]*\)\s*\}\}/g)];
  check(`there is a toJSON() substitution to check (${uses.length})`, uses.length >= 1,
    "nothing in the workflow pastes a value into a script any more");
  const wrapped = uses.filter((m) => wfCode[m.index - 1] === "`");
  check(`no toJSON() substitution is wrapped in backticks (${wrapped.length})`,
    wrapped.length === 0,
    wrapped.map((m) => m[0]).join("\n        "));
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
