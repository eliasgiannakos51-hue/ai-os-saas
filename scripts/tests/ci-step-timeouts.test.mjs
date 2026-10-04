// EVERY CI STEP HAS A TIME LIMIT OF ITS OWN.
//
// The owner's rule ("ΤΡΟΠΟΣ ΛΕΙΤΟΥΡΓΙΑΣ" §9 in docs/CONTEXT.md): no check
// step without a time limit — whatever hangs must fail WITH A NAME, not hang
// the job. Until 2026-10-04 .github/workflows/verify.yml had limits per JOB
// only: a stuck step burned the whole 100 minutes and the run said
// "cancelled" rather than which step it was. The smoke hang of 2026-10-03
// read exactly like that.
//
// The limits were set from the step durations of the last green run
// (5ec83070, measured 2026-10-04): the mutation suites took 3340 s and get
// 75 minutes, the gates 280 s and get 20, and so on — roughly two to three
// times what was measured. This gate holds the RULE, not those numbers:
// every step of every job has `timeout-minutes`, every job has one, and no
// step's limit reaches its job's (a step limit at or above the job limit
// would never be the one that fires, which is the old behaviour again).
//
// Read without a YAML library on purpose: the one in node_modules is a
// dependency of a dependency, and a gate that breaks when eslint changes
// its own dependencies would be measuring eslint.
//
// Run: node scripts/tests/ci-step-timeouts.test.mjs
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const WORKFLOW = ".github/workflows/verify.yml";
const lines = readFileSync(WORKFLOW, "utf8").split("\n");

// jobs: → two-space job ids → four-space job keys → `steps:` → `- ` items.
const jobs = [];
let inJobs = false;
let job = null;
let inSteps = false;
let step = null;
for (const line of lines) {
  if (/^jobs:\s*$/.test(line)) {
    inJobs = true;
    continue;
  }
  if (!inJobs) continue;
  if (/^\S/.test(line)) break;
  const jobId = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
  if (jobId) {
    job = { id: jobId[1], timeout: null, steps: [] };
    jobs.push(job);
    inSteps = false;
    step = null;
    continue;
  }
  if (!job) continue;
  const jobKey = line.match(/^    ([a-z-]+):\s*(.*)$/);
  if (jobKey) {
    inSteps = jobKey[1] === "steps";
    if (jobKey[1] === "timeout-minutes") job.timeout = Number(jobKey[2]);
    step = null;
    continue;
  }
  if (!inSteps) continue;
  const item = line.match(/^      - (.*)$/);
  if (item) {
    step = { label: item[1].replace(/^(name|uses|run):\s*/, "").trim(), timeout: null };
    job.steps.push(step);
    const inline = item[1].match(/^timeout-minutes:\s*(\d+)/);
    if (inline) step.timeout = Number(inline[1]);
    continue;
  }
  const stepKey = line.match(/^        timeout-minutes:\s*(\d+)\s*$/);
  if (stepKey && step) step.timeout = Number(stepKey[1]);
}

console.log("== 1. the reader found the workflow ==");
const stepCount = jobs.reduce((n, j) => n + j.steps.length, 0);
// Measured 2026-10-04: 6 jobs, 36 steps. A reader that found none would
// make every check below vacuous, so the floor is asserted, not printed.
check(`jobs found (${jobs.length})`, jobs.length >= 6, jobs.map((j) => j.id).join(", "));
check(`steps found (${stepCount})`, stepCount >= 36);
check("the main job is among them", jobs.some((j) => j.id === "verify" && j.steps.some((s) => s.label === "mutation suites")));

console.log("\n== 2. every job and every step has a limit ==");
for (const j of jobs) {
  check(`${j.id}: the job has timeout-minutes`, Number.isFinite(j.timeout) && j.timeout > 0, `found ${j.timeout}`);
  const without = j.steps.filter((s) => !(Number.isFinite(s.timeout) && s.timeout > 0));
  check(`${j.id}: every step has timeout-minutes`, without.length === 0, without.map((s) => s.label).join(" | "));
  const tooLong = j.steps.filter((s) => Number.isFinite(s.timeout) && Number.isFinite(j.timeout) && s.timeout >= j.timeout);
  check(
    `${j.id}: no step's limit reaches the job's (${j.timeout} min)`,
    tooLong.length === 0,
    tooLong.map((s) => `${s.label}: ${s.timeout}`).join(" | ")
  );
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
