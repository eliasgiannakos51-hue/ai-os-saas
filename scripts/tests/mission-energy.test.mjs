// Energy-based step suggestion.
//
// The energy check-in has existed since AI Life Context shipped, but
// nothing read it except a sentence in a prompt. This turns it into a
// decision, and the thing that can quietly go wrong is not a crash — it
// is a confident suggestion built from nothing, or a hard task offered to
// someone who just said they are running on empty.
//
// Run: node scripts/tests/mission-energy.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const m = await loadTs("src/lib/mission-energy.ts");
const { suggestStepsForEnergy, effortsForEnergy, stepEffort, isStepEffort } = m;

const step = (text, effort, status = "pending") => ({ text, effort, status });
const PLAN = [
  step("File the receipts", "light"),
  step("Draft the Q3 pricing decision", "deep"),
  step("Update the roadmap doc", "medium"),
  step("Rewrite the positioning statement", "deep"),
];

console.log("== 1. no check-in means NO suggestion, not a guess ==");
check("null energy -> null", suggestStepsForEnergy(PLAN, null) === null);
check("undefined energy -> null", suggestStepsForEnergy(PLAN, undefined) === null);
check("NaN energy -> null", suggestStepsForEnergy(PLAN, NaN) === null);
check("no open steps -> null", suggestStepsForEnergy([step("done", "light", "completed")], 5) === null);

console.log("\n== 2. low energy never surfaces deep work ==");
for (const level of [1, 2]) {
  const s = suggestStepsForEnergy(PLAN, level);
  check(`energy ${level}: suggests a light step`, stepEffort(s.top) === "light", `got ${stepEffort(s.top)}`);
  check(
    `energy ${level}: deep steps are held back, not merely ranked lower`,
    s.heldBack.length === 2 && s.heldBack.every((x) => x.effort === "deep")
  );
  check(`energy ${level}: nothing suggestible is deep`, s.ranked.slice(0, 2).every((x) => x.effort !== "deep"));
}

console.log("\n== 3. high energy leads with the demanding work ==");
for (const level of [4, 5]) {
  const s = suggestStepsForEnergy(PLAN, level);
  check(`energy ${level}: suggests a deep step`, stepEffort(s.top) === "deep", `got ${stepEffort(s.top)}`);
  check(`energy ${level}: nothing is held back — they can do anything`, s.heldBack.length === 0);
}

console.log("\n== 4. middling energy takes the middle ==");
const mid = suggestStepsForEnergy(PLAN, 3);
check("energy 3: suggests a medium step", stepEffort(mid.top) === "medium", `got ${stepEffort(mid.top)}`);
check("energy 3: deep work is allowed but ranked last", mid.heldBack.length === 0 && stepEffort(mid.ranked.at(-1)) === "deep");

console.log("\n== 5. the plan's own order survives within a band ==");
// Energy is a tie-breaker, not a re-plan: two deep steps stay in the
// order the Planner sequenced them.
const deepOrder = suggestStepsForEnergy(PLAN, 5).ranked.filter((s) => s.effort === "deep").map((s) => s.text);
check("two deep steps keep their planned order", deepOrder[0].startsWith("Draft") && deepOrder[1].startsWith("Rewrite"));

console.log("\n== 6. a step with no effort is treated as medium, not guessed ==");
check("missing effort -> medium", stepEffort({ text: "x", status: "pending" }) === "medium");
check("garbage effort -> medium", stepEffort({ text: "x", status: "pending", effort: "extreme" }) === "medium");
check("isStepEffort rejects junk", !isStepEffort("extreme") && !isStepEffort(null) && isStepEffort("deep"));
const legacy = suggestStepsForEnergy([step("Old step", undefined)], 1);
check("a pre-feature mission still produces a suggestion", legacy?.top?.text === "Old step");

console.log("\n== 7. out-of-range energy is clamped, never crashes ==");
check("0 clamps to the low band", effortsForEnergy(0).preferred === "light");
check("99 clamps to the high band", effortsForEnergy(99).preferred === "deep");
check("2.6 rounds to 3", effortsForEnergy(2.6).preferred === "medium");

console.log("\n== 8. it is actually wired into what the user sees ==");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const detail = strip(readFileSync("src/components/mission/mission-detail.tsx", "utf8"));
check("the mission detail renders the suggestion", /<EnergySuggestion/.test(detail));
check("...and receives the level as a prop", /energyLevel/.test(detail));
const list = strip(readFileSync("src/components/mission/mission-list.tsx", "utf8"));
check("the list passes it through", /energyLevel=\{energyLevel\}/.test(list));
const page = strip(readFileSync("src/app/dashboard/mission/page.tsx", "utf8"));
check("the page loads the real check-in server-side", /loadLatestEnergyCheckIn\(supabase, user\.id\)/.test(page));
check("...and hands it to the list", /energyLevel=\{energyCheckIn\?\.energyLevel \?\? null\}/.test(page));
// The Planner has to actually produce the field, or every step is medium
// forever and the whole feature is decorative.
const planner = readFileSync("src/lib/mission-agents.ts", "utf8");
check("the Planner tool asks for an effort per step", /effort: \{[\s\S]{0,200}?enum: \[\.\.\.STEP_EFFORTS\]/.test(planner));
check("the Planner prompt explains effort is independent of duration", /ΑΝΕΞΑΡΤΗΤΑ από τη διάρκεια/.test(planner));
check("the parser validates it instead of trusting the model", /STEP_EFFORTS as readonly string\[\]\)\.includes\(source\.effort\)/.test(planner));
// The two modules each declare the effort list — the planner because it
// PRODUCES the field, this one because it CONSUMES it. That avoids a
// backwards dependency but creates a drift risk, so the lists are
// compared directly here rather than trusted to stay in step.
const plannerList = planner.match(/export const STEP_EFFORTS = \[([^\]]+)\] as const;/)?.[1];
const energyList = readFileSync("src/lib/mission-energy.ts", "utf8").match(/export const STEP_EFFORTS: StepEffort\[\] = \[([^\]]+)\];/)?.[1];
const norm = (x) => (x ?? "").replace(/\s|"/g, "");
check(
  "the planner's effort list and this module's are identical",
  plannerList !== undefined && norm(plannerList) === norm(energyList),
  `planner=[${plannerList}] energy=[${energyList}]`
);
check("...and the tool schema is built from that same list", /enum: \[\.\.\.STEP_EFFORTS\]/.test(planner));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
