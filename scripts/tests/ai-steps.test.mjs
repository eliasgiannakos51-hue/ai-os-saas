// A SPINNER IS NOT AN ANSWER.
//
// Five kinds of work run in the background, and every one of them writes
// its REAL step to ai_jobs.step_label as it passes it — not a timer, not a
// percentage that creeps, a row that changes when something actually
// finishes (lib/jobs/run-job.ts). The data was there from the start.
//
// Four of the five threw it away at the last moment:
//
//   mission_plan  captured stepLabel into React state and rendered it
//                 nowhere; the button said "Planning…" for all three steps
//   agent_build   showed one static "Designing…" for four real steps, and
//                 never read the job row's stepLabel at all
//   agent_run     showed no words anywhere — a pulsing dot on a badge, for
//                 three steps that can take minutes
//   create        already had a named step list of its own, so it is the
//                 one that was fine
//
// Only file_ask displayed it, and it did so through a three-entry map
// declared inside the component — which is exactly why the other four went
// without one. A map inside a component is not somewhere the next feature
// looks.
//
// WHAT THIS FILE HOLDS. Every step every worker can report has a label, in
// all ten locales, in plain language; the map is one shared module rather
// than per-component; and no consumer renders the raw token. The last one
// matters most: "drafting" and "synthesising" are worker vocabulary, fine
// in a database column and wrong on a screen — and English, on a page the
// user chose to read in Greek.
//
// Run: node scripts/tests/ai-steps.test.mjs
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
function checkList(name, actual) {
  check(name, actual.length === 0, actual.slice(0, 8).join("\n        "));
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
function lookup(obj, dotted) {
  return dotted.split(".").reduce((node, part) => (node == null ? undefined : node[part]), obj);
}

const { loadTs } = await import("./load-ts.mjs");
const { JOB_KINDS, JOB_STEPS } = await loadTs("src/lib/jobs/job-types.ts");
const { stepLabelKey, allStepLabelKeys } = await loadTs("src/lib/jobs/step-labels.ts");

console.log("== 1. every step a worker can report has words ==");
// Derived from JOB_STEPS, never from a list typed out a second time: a
// sixth kind, or a fourth step on an existing kind, has to fail here
// rather than ship as a blank line under a spinner.
const KEYS = allStepLabelKeys();
const expected = JOB_KINDS.reduce((n, k) => n + JOB_STEPS[k].length, 0);
check(`the key list is derived from JOB_STEPS (${KEYS.length} === ${expected})`, KEYS.length === expected);
check(`all five kinds are covered (${JOB_KINDS.length})`, JOB_KINDS.length === 5);
for (const locale of LOCALES) {
  const missing = KEYS.filter((k) => typeof lookup(messages[locale], k) !== "string");
  checkList(`${locale}: every step has a label (${KEYS.length} keys)`, missing);
}
// The queued state needs one too. A job that has not been claimed has no
// step, and showing the FIRST step before it has begun would be the fake
// progress the step counter exists to prevent.
for (const locale of LOCALES) {
  check(`${locale}: the queued state has its own line`, typeof messages[locale].aiSteps?.starting === "string");
}

console.log("\n== 2. the code is a key, never a label ==");
check("a known step resolves to its key", stepLabelKey("agent_build", "drafting") === "aiSteps.agent_build.drafting");
// Both of these would otherwise reach the user as a raw token: a step this
// kind does not declare, and the null a job carries before its first step.
check("an unknown step resolves to nothing", stepLabelKey("agent_build", "sculpting") === null);
check("and so does a step belonging to another kind", stepLabelKey("agent_build", "delivering") === null);
check("a job with no step yet resolves to nothing", stepLabelKey("agent_build", null) === null);
check("an unknown kind resolves to nothing", stepLabelKey("teleporting", "drafting") === null);

console.log("\n== 3. plain language, not worker vocabulary ==");
// The tokens themselves, which must NOT appear as English prose in the
// labels: seeing "drafting" on screen means a raw token leaked through.
const TOKENS = [...new Set(JOB_KINDS.flatMap((k) => JOB_STEPS[k]))];
const rawLeaks = [];
for (const key of KEYS) {
  const value = messages.en[key.split(".")[1]]?.[key.split(".")[2]];
  const token = key.split(".")[2];
  if (typeof value === "string" && value.trim().toLowerCase() === token) rawLeaks.push(key);
}
checkList("no label is just its own code", rawLeaks);
// Jargon a person waiting has no use for. Every one of these was in the
// codebase as a step name or a status; none may reach a screen.
const JARGON = /\b(payload|token|endpoint|serial|deserial|API|SDK|prompt|LLM|inference|schema|migration|worker|queue|claim|lock|RPC|upsert|null|undefined)\b/i;
const jargonHits = [];
for (const locale of LOCALES) {
  for (const key of KEYS.concat(["aiSteps.starting"])) {
    const value = lookup(messages[locale], key);
    if (typeof value === "string" && JARGON.test(value)) jargonHits.push(`${locale}: ${key} = ${value}`);
  }
}
checkList("no label uses technical vocabulary", jargonHits);
// A label that says nothing is the spinner again with extra steps.
const vague = [];
for (const locale of LOCALES) {
  for (const key of KEYS) {
    const value = lookup(messages[locale], key);
    if (typeof value !== "string") continue;
    if (value.replace(/[.…\s]/g, "").length < 4) vague.push(`${locale}: ${key} = ${value}`);
  }
}
checkList("no label is too short to mean anything", vague);
// And each kind says something DIFFERENT at each step, or the line is
// decoration: it would not change when the work moved.
for (const locale of LOCALES) {
  const flat = [];
  for (const kind of JOB_KINDS) {
    const labels = JOB_STEPS[kind].map((s) => lookup(messages[locale], `aiSteps.${kind}.${s}`));
    if (new Set(labels).size !== labels.length) flat.push(`${locale}: ${kind}`);
  }
  checkList(`${locale}: every kind's steps read differently from each other`, flat);
}

console.log("\n== 4. one map, not one per component ==");
// The regression this prevents by name: file_ask's map lived inside
// files-workspace.tsx, which is why four other kinds shipped without one.
const files = readFileSync("src/components/files/files-workspace.tsx", "utf8");
check("files-workspace no longer keeps its own step map", !/ASK_STEP_KEY/.test(files));
check("it reads the shared one", /stepLabelKey\("file_ask"/.test(files));
for (const locale of LOCALES) {
  check(
    `${locale}: the duplicated per-file step keys are gone`,
    messages[locale].dashboard.files.stepReading === undefined
  );
}

console.log("\n== 5. the four silent surfaces now speak ==");
// Asserted per file, because "we added a component" is not the same claim
// as "the four places that were silent use it".
const CONSUMERS = [
  ["mission_plan", "src/components/mission/mission-form.tsx", "the plan button said Planning… for all three steps"],
  ["agent_build", "src/components/agents/agents-workspace.tsx", "the design button said Designing… for all four"],
];
for (const [kind, file, was] of CONSUMERS) {
  const src = readFileSync(file, "utf8");
  check(`${kind}: ${file.split("/").pop()} renders progress — ${was}`, /<AiJobProgress/.test(src), file);
}
// agent_run is in the same file as agent_build, and had the weaker
// symptom (no words at all), so it is checked separately rather than
// being covered by its neighbour's assertion.
const agents = readFileSync("src/components/agents/agents-workspace.tsx", "utf8");
check("agent_run: the run job is rendered too, not only the build job", /job=\{runJob\}/.test(agents));
check(
  "mission_plan: the label is no longer captured and dropped",
  !/setStepLabel/.test(readFileSync("src/components/mission/mission-form.tsx", "utf8"))
);
// create already had a named step list of its own — recorded here so a
// later reader does not "fix" a thing that was never broken.
const create = readFileSync("src/components/create/create-studio.tsx", "utf8");
check("create: already had named steps, and still does", /progress\.\$\{step\.labelKey\}/.test(create));

console.log("\n== 6. the component tells the truth about nothing happening ==");
const progress = readFileSync("src/components/ui/ai-job-progress.tsx", "utf8");
// The rule ThinkingIndicator's own comment states: it may only render
// while a request is genuinely open. A finished or failed job must render
// nothing at all rather than a reassuring line.
check(
  "it renders nothing unless a job is queued or running",
  /if \(!job \|\| \(job\.status !== "queued" && job\.status !== "running"\)\) return null;/.test(progress)
);
check("a job with no step yet says it is starting", /aiSteps\.starting/.test(progress));
check("the counter is hidden until the first step lands", /job\.step > 0/.test(progress));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
