// DELETING AND EDITING A MISSION — and the coupling that makes it risky.
//
// Mission Control had no delete at all: not a hidden button, not an API
// without a UI — no endpoint, so a mission created by mistake stayed for
// the life of the account.
//
// The reason it is not a one-line DELETE: a mission's steps live in ONE
// jsonb array (ai_missions.plan_steps), so a step's identity IS its
// position, and `scheduled_agent_runs.step_index` is an integer pointing
// into that array. The daily cron runs `steps[run.step_index]`. Remove or
// move a step without touching the runs and tomorrow's run silently
// executes a DIFFERENT step, spending real credits on work nobody asked
// for. None of that is visible to the compiler.
//
// Run: node scripts/tests/mission-editing.test.mjs
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
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const edits = strip(readFileSync("src/lib/mission-step-edits.ts", "utf8"));
const missionRoute = strip(readFileSync("src/app/api/mission/[id]/route.ts", "utf8"));
const stepsRoute = strip(readFileSync("src/app/api/mission/[id]/steps/route.ts", "utf8"));
const detail = strip(readFileSync("src/components/mission/mission-detail.tsx", "utf8"));
const card = strip(readFileSync("src/components/mission/mission-card.tsx", "utf8"));
const controls = strip(readFileSync("src/components/mission/step-controls.tsx", "utf8"));
const hook = strip(readFileSync("src/components/mission/use-mission-delete.ts", "utf8"));

console.log("== 1. a mission can be deleted, server-side, by its owner ==");
check("there is a DELETE endpoint", /export async function DELETE/.test(missionRoute));
check("it authenticates first", /auth\.getUser\(\)/.test(missionRoute));
check(
  "the read is scoped to the caller",
  /\.from\("ai_missions"\)[\s\S]{0,200}?\.eq\("id", missionId\)[\s\S]{0,80}?\.eq\("user_id", user\.id\)/.test(missionRoute)
);
check(
  "and so is the delete — not left to RLS alone",
  /\.delete\(\)[\s\S]{0,120}?\.eq\("id", missionId\)[\s\S]{0,80}?\.eq\("user_id", user\.id\)/.test(missionRoute)
);
check("a mission that is not the caller's is a 404, not a silent success", /Mission not found\./.test(missionRoute));
check("the answer says what was removed", /steps: steps\.length/.test(missionRoute) && /scheduledRuns/.test(missionRoute));

console.log("\n== 2. the confirmation names the mission and what it costs ==");
check("one shared confirm+delete, used by both entry points", /export function useMissionDelete/.test(hook));
check("it names the mission", /deleteConfirmMission", \{ goal: mission\.goal \}/.test(hook));
check("and says what is lost", /deleteConfirmLoses", \{[\s\S]{0,120}?steps: steps\.length/.test(hook));
check("counting the completed ones", /completed,/.test(hook));
check("and the scheduled runs", /scheduled: scheduledRuns/.test(hook));
check("the card offers it", /key: "delete"/.test(card) && /useMissionDelete/.test(card));
check("as a destructive menu item", /destructive: true/.test(card));
check("the detail screen offers it too", /<MissionDeleteButton/.test(detail));
checkList(
  "every locale has the confirmation sentence",
  LOCALES.filter((l) => {
    const m = messages[l].dashboard.mission;
    return typeof m.deleteConfirmMission !== "string" || !m.deleteConfirmMission.includes("{goal}");
  })
);
checkList(
  "and the what-is-lost sentence, with all three numbers",
  LOCALES.filter((l) => {
    const s = messages[l].dashboard.mission.deleteConfirmLoses ?? "";
    return !s.includes("{steps}") || !s.includes("{completed}") || !s.includes("{scheduled}");
  })
);

console.log("\n== 3. THE COUPLING: a step index is a pointer, and it is maintained ==");
// The cron really does index into the array — quoted from the file, so
// this check fails if that ever stops being true and the fix-up below
// becomes pointless ceremony.
const cron = readFileSync("src/app/api/cron/scheduled-runs/route.ts", "utf8");
check("the cron executes steps[run.step_index]", /const step = steps\[run\.step_index\]/.test(cron));
check("delete removes runs that pointed AT the step", /\.delete\(\)[\s\S]{0,240}?\.eq\("step_index", index\)/.test(edits));
check("and shifts every later run down one", /step_index: run\.step_index - 1/.test(edits));
check("restore puts the later runs back up one", /step_index: run\.step_index \+ 1/.test(edits));
check("and re-creates the removed runs", /\.from\("scheduled_agent_runs"\)\.insert\(/.test(edits));
check("a move swaps the two positions' runs", /const PARK = -1/.test(edits));
check("editing the text updates the run's copy of it", /\.update\(\{ step_text: text \}\)/.test(edits));
// Only PENDING runs move. An executed run is history.
const pendingGuards = (edits.match(/\.eq\("status", "pending"\)/g) ?? []).length;
check(`only pending runs are touched (${pendingGuards} guards)`, pendingGuards >= 6);
// The runs are fixed BEFORE the array shrinks, so a crash in between
// leaves runs pointing at a step that still exists.
const runsFixAt = edits.indexOf('.eq("step_index", index)');
const arrayShrinkAt = edits.indexOf("steps.splice(index, 1)");
check("runs are fixed before the array shrinks", runsFixAt > 0 && arrayShrinkAt > runsFixAt);

console.log("\n== 4. every step mutation is owned server-side ==");
check("one route for all four actions", /case "delete"/.test(stepsRoute) && /case "restore"/.test(stepsRoute) && /case "edit"/.test(stepsRoute) && /case "move"/.test(stepsRoute));
check("ownership is checked before the index is used", stepsRoute.indexOf('.eq("user_id", user.id)') < stepsRoute.indexOf("const index = Number(body.index)"));
check("an unknown action is refused", /Unknown action\./.test(stepsRoute));
check("a negative or non-integer index is refused", /Number\.isInteger\(index\) \|\| index < 0/.test(stepsRoute));
check("empty step text is refused", /A step needs some text\./.test(stepsRoute));
check("and over-long text is refused with the limit named", /MAX_STEP_TEXT\} characters/.test(stepsRoute));
// A restore may only put back the caller's OWN work.
check(
  "restore takes user_id and mission_id from the server, never the body",
  /user_id: userId,\s*mission_id: missionId,/.test(edits)
);
// The optimistic-version guard the rest of Mission Control uses.
check("the writes go through the versioned writer", /updateMissionPlanSteps\(/.test(edits));
check("and a lost race is a 409, not a silent overwrite", /conflict: true/.test(stepsRoute) && /409/.test(stepsRoute));

console.log("\n== 5. the controls exist, and delete offers an undo ==");
for (const id of ["step-delete", "step-edit", "step-move-up", "step-move-down", "step-undo-button"]) {
  check(`${id} is rendered`, new RegExp(`data-testid="${id}"`).test(controls));
}
check("delete has NO confirmation (it is a small action)", !/window\.confirm/.test(controls));
check("but it is undoable for a few seconds", /UNDO_WINDOW_MS = (\d+)/.test(controls) && Number(/UNDO_WINDOW_MS = (\d+)/.exec(controls)[1]) >= 5000);
check("the undo restores the runs too, not just the step", /runs: pending\.runs/.test(detail));
check("the strip stands where the step was", /undo\.index === index/.test(detail));
check("a step deleted from the end still shows one", /undo\.index >= steps\.length/.test(detail));
check("completed steps are not editable — that is history", /step\.status !== "completed" && \(\s*<StepControls/.test(detail));
checkList(
  "every control has a label in all ten locales",
  LOCALES.flatMap((l) =>
    ["deleteStep", "editStep", "moveStepUp", "moveStepDown", "stepDeleted", "undoWithSeconds", "saveStep"]
      .filter((k) => typeof messages[l].dashboard.mission[k] !== "string")
      .map((k) => `${l}.${k}`)
  )
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
