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
import { createRequire } from "node:module";
import { resolve } from "node:path";

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
// ONE JOB'S BLOCK, COMMENTS STRIPPED. Hoisted here because sections 3b,
// 5 and 6 all ask "what does this job actually say", and a second copy
// of the parser is a second thing to get subtly different.
const yamlCode = (text) => text.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
const jobBlock = (name) => {
  const at = wf.indexOf(`\n  ${name}:`);
  if (at < 0) return "";
  const next = wf.slice(at + 1).search(/\n  [a-z][a-z-]*:\n/);
  return yamlCode(next < 0 ? wf.slice(at) : wf.slice(at, at + 1 + next));
};
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
    // AND IT NAMES THE PLACE THEY KEEP BEING PUT INSTEAD. The
    // credentials were set in Vercel three times running, which hands
    // them to the deployment — the one process that has no use for
    // them. A message that says "not set" and not "not set HERE" is
    // what made that round trip cost three days.
    check("...and says why Vercel is not the place",
      /Vercel is not the place/.test(step),
      "the message does not name the mistake that has been made three times");
  }

  // THE REPORT SURVIVES A FAILURE, which is the run whose report is
  // wanted.
  check("the report is uploaded even when the run fails",
    /if: always\(\)[\s\S]{0,200}upload-artifact/.test(wfCode),
    "broken.md is thrown away exactly when it matters");
}

console.log("== 1d. a suite that needs a database is not asked to run before there is one ==");
// ---------------------------------------------------------------------
// ai-memory.mutation.mjs drives an INTEGRATION suite that starts an
// ephemeral cluster with initdb. Postgres used to be installed in the
// step BELOW the mutation run, so that gate was red on the unmutated
// tree, the whole suite printed "BASELINE IS RED" and killed nothing —
// on main, for as long as the step order was that way, while the build
// stayed green because the mutation suites are not part of the gates.
//
// Checked as ORDER, which is the property. A step that exists in the
// wrong place is not the same as a step that is missing, and only one
// of those two is what happened.
{
  const pg = wfCode.indexOf("sudo apt-get install -y -qq postgresql");
  const mutations = wfCode.indexOf("run: npm run test:mutation");
  const dbtests = wfCode.indexOf("npm run test:db");
  check("postgres is installed somewhere", pg !== -1, "no step installs it");
  check("...before the mutation suites run", pg !== -1 && mutations !== -1 && pg < mutations,
    `postgres at ${pg}, mutations at ${mutations} — a mutation suite whose gate needs a database cannot run`);
  check("...and before the database suites, which is where it started",
    pg !== -1 && dbtests !== -1 && pg < dbtests, `postgres at ${pg}, db suites at ${dbtests}`);
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
  // THE REPORTERS ARE DERIVED, NOT NAMED. There are two of them now —
  // the alert and the all-clear — and neither watches the other, which
  // is right: they are the watching, not the work. Spelling them out
  // here is the same mistake this check's own comment above describes,
  // so a job counts as a reporter when it CALLS the reporting module.
  const reporters = jobNames.filter((j) => /ci-red-issue\.cjs/.test(jobBlock(j)));
  check(`the reporting jobs were found by what they call (${reporters.join(", ") || "none"})`,
    reporters.length >= 1, "no job calls the module, so every job below reads as unwatched");
  const unwatched = jobNames.filter((j) => !reporters.includes(j) && !alertNeeds.includes(j));
  check(
    `...and it waits for every job it reports on (${alertNeeds.length}/${jobNames.length - 1})`,
    needsLine !== null && unwatched.length === 0,
    unwatched.length
      ? `${unwatched.join(", ")} can fail without opening an issue`
      : "a job with no `needs` runs before the thing it is meant to report has finished"
  );
  // THESE THREE READ THE MODULE, because that is where the behaviour
  // moved on 2026-10-16. They are the cheap structural half; section 6
  // RUNS the same module and asks what it does, which is the half that
  // would have caught `per_page: 10`.
  const alertModule = existsSync(".github/scripts/ci-red-issue.cjs")
    ? readFileSync(".github/scripts/ci-red-issue.cjs", "utf8")
    : "";
  check("...it opens an issue, which survives a closed tab",
    /issues\.create\(/.test(alertModule) && /issues: write/.test(wf));
  check("...and de-duplicates rather than filing one per push",
    /listForRepo/.test(alertModule) && /createComment/.test(alertModule),
    "an issue per failing push turns the tracker into a log nobody reads");
  check("...linking the run, the commit and the branch",
    /actions\/runs\/\$\{context\.runId\}/.test(alertModule) && /context\.sha/.test(alertModule));
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

console.log("== 5. one answer per push, and no branch cancels another's ==");
{
  // WHAT WENT WRONG, watched happening on 2026-10-16. The concurrency
  // group was `verify-${{ github.ref }}`. For a push that is the
  // branch; for a pull_request it is refs/pull/N/merge; for a
  // deployment_status — which Vercel emits several times per preview
  // deployment, on every branch — it is NEITHER, and the ref GitHub
  // hands the workflow is the same one whatever branch deployed. So the
  // vision branch's preview cancelled the sidebar branch's checks, and
  // that pull request showed a cancelled job with nothing in its own
  // diff to explain it.
  //
  // The same event list also ran the hour-long `verify` job three times
  // on identical bytes: once for the push, once for the pull_request,
  // and once more for each deployment report.
  const group = /concurrency:[\s\S]{0,1200}?group:\s*(.+)/.exec(wf)?.[1] ?? "";
  check("the concurrency group distinguishes the event",
    /github\.event_name/.test(group), group.trim());
  check("...and still distinguishes the branch",
    /github\.ref|head\.ref/.test(group), group.trim());

  // THE TWO HEAVY JOBS DO NOT RUN ON A DEPLOYMENT REPORT. Ranged over
  // the jobs rather than written as two names: a third heavy job added
  // later would be caught by the same line.
  const HEAVY = ["verify", "prodtest-smoke"];
  // COMMENTS STRIPPED FIRST, and this line is here because the mutation
  // suite caught its absence on the first run. The job carries a comment
  // saying WHY it skips a deployment report, so a block that still held
  // the comment matched `deployment_status` with the `if:` deleted —
  // the gate would have gone on passing while the hour-long job ran
  // three times again. CLAUDE.md: "if I deleted every comment in the
  // target, would this still pass?"
  const stillRunning = HEAVY.filter((n) => !/deployment_status/.test(jobBlock(n)));
  check(`the heavy jobs skip a deployment report (${HEAVY.length} checked)`,
    HEAVY.length >= 2 && stillRunning.length === 0,
    stillRunning.join(", ") || "one of them has no deployment_status guard");
  // AND THE JOB THAT EVENT EXISTS FOR STILL RUNS ON IT, which is the
  // half that stops the guard above from being a way to disable CI.
  check("...while the bot job still runs on one",
    /deployment_status/.test(jobBlock("bot-on-deploy")),
    "the event would then be received by nothing at all");
}

console.log("== 6. the alarm resets, and it can see past the first page ==");
{
  // THIS SECTION RUNS THE CODE. Sections 1-5 read the workflow, which is
  // the only thing available for a `run:` line; the alert's logic is now
  // a module, so the question "does it open a duplicate when thirty are
  // already open" can be ASKED rather than inferred from a regex. That
  // is the exact question the old `per_page: 10` got wrong, and no
  // amount of reading the YAML would have answered it.
  const require_ = createRequire(import.meta.url);
  const MODULE = ".github/scripts/ci-red-issue.cjs";
  check("the alert's logic is a module both paths can share", existsSync(MODULE),
    "two copies in two `script:` blocks agree only while somebody remembers");
  const mod = require_(resolve(MODULE));

  // A FAKE CLIENT THAT TRUNCATES THE WAY THE REAL ONE DOES, which is
  // the whole point of it. `issues.listForRepo` returns ONE page and
  // says nothing about there being more; `paginate` walks them and
  // returns every row. The old code called the endpoint directly, so
  // the fake has to behave differently for the two or a module with the
  // defect would still pass. Asserting `per_page: 100` alone would be a
  // check on a literal; this is a check on what happens.
  function client(issues) {
    const calls = { paged: [], oneShot: [], created: [], commented: [], updated: [] };
    const listForRepo = async (params) => {
      calls.oneShot.push(params);
      return { data: issues.slice(0, Number(params.per_page) || 30) };
    };
    const github = {
      paginate: async (fn, params) => {
        calls.paged.push(params);
        if (fn !== listForRepo) throw new Error("paginate was handed something other than the endpoint");
        return issues;
      },
      rest: { issues: {
        listForRepo,
        create: async (a) => { calls.created.push(a); },
        createComment: async (a) => { calls.commented.push(a); },
        update: async (a) => { calls.updated.push(a); },
      } },
    };
    return { github, calls };
  }
  const ctx = (over = {}) => ({
    repo: { owner: "o", repo: "r" },
    ref: "refs/heads/main",
    sha: "0123456789abcdef",
    runId: 1,
    serverUrl: "https://github.com",
    workflow: "verify",
    payload: {},
    ...over,
  });

  // THE DEFECT, REPRODUCED AS A TEST. Thirty open ci-red issues with the
  // matching one LAST: under `per_page: 10` it was invisible and a
  // duplicate was opened. Measured on the real tracker 2026-10-16 —
  // #280 and #302 are both "CI red on main", #270 and #301 are both
  // "CI red on ".
  {
    const many = Array.from({ length: 29 }, (_, i) => ({ number: i + 1, title: `CI red on branch-${i}` }));
    many.push({ number: 99, title: "CI red on main" });
    const { github, calls } = client(many);
    const out = await mod.run({ github, context: ctx(), mode: "red" });
    check(`with 30 open issues the matching one is still found (opened ${out.opened}, commented ${out.commented})`,
      out.opened === 0 && out.commented === 1 && calls.created.length === 0,
      "this is the per_page: 10 defect — a duplicate was opened instead");
    check("...and it commented on that issue, not another",
      calls.commented.length === 1 && calls.commented[0].issue_number === 99,
      JSON.stringify(calls.commented.map((c) => c.issue_number)));
    check(`...by paging, not by reading one page and assuming that is all (paged ${calls.paged.length}, one-shot ${calls.oneShot.length})`,
      calls.paged.length === 1 && calls.oneShot.length === 0,
      "this is the shape of the defect: listForRepo returns a page and no hint there are more");
    const capped = calls.paged.filter((p) => Number(p.per_page) < 100);
    check(`...asking for whole pages while it is at it (${calls.paged.map((p) => p.per_page).join(", ")})`,
      capped.length === 0,
      "a page smaller than 100 makes paginate do more requests for the same answer");
  }

  // NOTHING OPEN YET -> one issue, labelled so the next run finds it.
  {
    const { github, calls } = client([]);
    const out = await mod.run({ github, context: ctx(), mode: "red" });
    check(`with nothing open it opens exactly one (${out.opened})`,
      out.opened === 1 && calls.created.length === 1 && calls.commented.length === 0);
    check("...labelled ci-red, or the next run cannot find it",
      (calls.created[0]?.labels ?? []).includes("ci-red"),
      JSON.stringify(calls.created[0]?.labels));
  }

  // GREEN CLOSES EVERY MATCH, not the first. That is what clears the
  // duplicates the ten-row window already made, without anybody tidying
  // up by hand.
  {
    const { github, calls } = client([
      { number: 7, title: "CI red on main" },
      { number: 8, title: "CI red on main" },
      { number: 9, title: "CI red on other" },
    ]);
    const out = await mod.run({ github, context: ctx(), mode: "green" });
    // THE RECORDED CALLS, NOT THE RETURNED NUMBER. A count the module
    // computes from the list it MEANT to close survives a loop that
    // closes one of them; the fake's record does not.
    check(`green closes every open issue for the ref (closed ${out.closed}, calls ${calls.updated.length})`,
      out.closed === 2 && calls.updated.length === 2,
      JSON.stringify(calls.updated.map((u) => u.issue_number)));
    check("...both of them, and not the one for another branch",
      calls.updated.map((u) => u.issue_number).join(",") === "7,8"
        && calls.updated.every((u) => u.state === "closed"),
      JSON.stringify(calls.updated));
  }

  // NO EVENT PRODUCES A NAMELESS ISSUE. «CI red on » is two of the
  // thirty-three, and the cause is that context.ref is only a branch on
  // a push. Ranged over the event shapes this workflow actually
  // receives rather than written for the one that broke.
  {
    const shapes = [
      ["push", ctx()],
      ["pull_request", ctx({ ref: "refs/pull/294/merge", payload: { pull_request: { head: { ref: "a-branch" } } } })],
      ["deployment_status", ctx({ ref: "" })],
      ["nothing at all", ctx({ ref: "", sha: "" })],
    ];
    const nameless = shapes.filter(([, c]) => /^CI red on\s*$/.test(mod.titleFor(c)));
    check(`no event shape produces a nameless issue (${shapes.length} shapes)`,
      shapes.length >= 4 && nameless.length === 0,
      nameless.map(([n]) => n).join(", "));
    check("...and a pull request is named after its own branch, not refs/pull/N/merge",
      mod.titleFor(shapes[1][1]) === "CI red on a-branch", mod.titleFor(shapes[1][1]));
  }

  // THE TWO JOBS, AND THAT THEY WATCH THE SAME THINGS. The alert's
  // `needs` list carries its own comment — "EVERY job above, not the two
  // I happened to remember" — and the all-clear is worth nothing if it
  // watches fewer: CI would go "green" while a job the alert counts is
  // still red. Derived from the file, not written out here.
  const needsOf = (name) => (/needs:\s*\[([^\]]*)\]/.exec(jobBlock(name))?.[1] ?? "")
    .split(",").map((n) => n.trim()).filter(Boolean).sort().join(",");
  check("there is an all-clear job at all", /\n  all-clear:/.test(wf),
    "with only a red path, the tracker only ever grows");
  check(`the all-clear watches exactly what the alert watches (${needsOf("alert") || "none"})`,
    needsOf("alert").length > 0 && needsOf("all-clear") === needsOf("alert"),
    `alert: ${needsOf("alert")}\n        all-clear: ${needsOf("all-clear")}`);
  check("the alert runs on failure and the all-clear on success",
    /if:\s*failure\(\)/.test(jobBlock("alert")) && /if:\s*success\(\)/.test(jobBlock("all-clear")),
    "one of them would fire on the wrong colour");
  // BOTH CALL THE MODULE, in the two modes, so neither can quietly grow
  // its own copy of the logic again.
  const modes = (name) => [...jobBlock(name).matchAll(/mode:\s*'(\w+)'/g)].map((m) => m[1]).join(",");
  check(`the alert calls the module in red mode (${modes("alert") || "none"})`,
    /ci-red-issue\.cjs/.test(jobBlock("alert")) && modes("alert") === "red");
  check(`the all-clear calls the same module in green mode (${modes("all-clear") || "none"})`,
    /ci-red-issue\.cjs/.test(jobBlock("all-clear")) && modes("all-clear") === "green");
  // A require() needs the file on disk; github-script alone does not
  // check the repository out.
  for (const name of ["alert", "all-clear"]) {
    check(`${name} checks the repository out before requiring the module`,
      /actions\/checkout@/.test(jobBlock(name)),
      "require('./.github/scripts/...') resolves against an empty workspace otherwise");
  }
}

console.log("== 7. the heavy suites are gated to pre-merge and nightly; the fast checks run on every push ==");
// ---------------------------------------------------------------------
// Βήμα 2 (CI for a private repository, owner, 2026-10-05): "fast checks
// ... on every push" and "the big stuff ... moves to pre-merge and
// nightly only — no check is lost, only rescheduled". Added 2026-10-21,
// after a measurement by hand found the SAME hour-long job running on
// identical bytes for `push` and for `pull_request` on one commit — this
// section is what stops that redesign from drifting back to "everything,
// every time" (reintroducing the cost) or to "heavy steps dropped for
// good" (reintroducing the exact gap section 2 above already guards, one
// job over).
{
  const HEAVY_STEPS = [
    "postgres, for the suites that need one",
    "mutation suites",
    "the mutation suites put the tree back",
    "database suites",
    "chromium, for the integration suite that needs one",
    "integration suites",
  ];
  const FAST_STEPS = ["secret scan", "dependency audit"];
  const verifyBlock = jobBlock("verify");
  check(`the verify job was read (${verifyBlock.length} chars)`, verifyBlock.length > 500,
    "an empty block makes every check below vacuous");

  // ONE STEP AT A TIME, because a single regex over the whole job block
  // would let one gated step's `if:` satisfy the check for a step with
  // none of its own — the exact way a block-wide search misses a hole.
  const stepBlock = (label) => {
    const marker = `- name: ${label}`;
    const at = verifyBlock.indexOf(marker);
    if (at < 0) return "";
    const next = verifyBlock.slice(at + marker.length).search(/\n {6}- /);
    return next < 0 ? verifyBlock.slice(at) : verifyBlock.slice(at, at + marker.length + next);
  };
  const HEAVY_IF = /if:\s*>-\s*\n\s*github\.event_name == 'pull_request' \|\| github\.ref == 'refs\/heads\/main' \|\|\s*\n\s*github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/;
  for (const label of HEAVY_STEPS) {
    const block = stepBlock(label);
    check(`  "${label}" exists in the verify job`, block.length > 0, "no step with that name was found");
    check(`  ...and is gated to pull_request / push-to-main / schedule / workflow_dispatch`,
      HEAVY_IF.test(block), block || "(step not found)");
  }
  for (const label of FAST_STEPS) {
    const block = stepBlock(label.includes("secret scan") ? "secret scan (this push's diff)" : label);
    check(`  "${label}" exists in the verify job`, block.length > 0, "no step with that name was found");
    check(`  ...and runs UNCONDITIONALLY (no step-level if:)`, !/\n\s+if:/.test(block), block);
  }

  // THE JOB THAT TELLS THE OWNER THE QUOTA IS CLOSE. Nightly-only, same
  // shape as unmerged-branches, and it must feed the same alert/all-clear
  // pair as every other job — section 3b above already enforces THAT
  // half by deriving the job list rather than naming it, so this only
  // adds the part specific to this job: that it exists and is not run on
  // every push (which would spend the minutes it exists to watch).
  const quotaBlock = jobBlock("quota-alert");
  check("a nightly job checks Actions usage against the quota", quotaBlock.length > 0,
    "no quota-alert job was found");
  check("...scoped to schedule / workflow_dispatch, not every push",
    /if:\s*github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/.test(quotaBlock),
    "running this on every push would spend the minutes it is meant to watch");
  check("...reading the secret by the name scripts/ci/quota-alert.mjs expects",
    /ACTIONS_BILLING_PAT/.test(quotaBlock), "the job and the script must agree on the secret's name");
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
