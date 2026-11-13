/*
 * «ΛΕΙΤΟΥΡΓΙΑ»: SHADOW / SUPERVISED / AUTO, ΑΝΑ ΑΥΤΟΜΑΤΟΠΟΙΗΣΗ
 * (Automations Κομμάτι 2a, οδηγία 55, 2026-11-08 — the owner, after
 * Κομμάτι 1's "εγκρίνω": «χτίσε το να δουλεύει και να είναι αυτόματο»).
 *
 * Κομμάτι 2b (2026-11-08, same day) adds the one thing Κομμάτι 2a left
 * out: a selector on the screen, Section 11 below. Still no canvas, no
 * 11 fields, no teams, no Approval Center — those remain Κομμάτια 3-10.
 *
 * What this holds, against the code rather than its comments:
 *
 *   1. THE PURE RULES: effectiveDry and withSupervisedApprovals, run for
 *      real (boxes.ts, loadable — unlike runner.ts, which only ever
 *      checked against its source text in automations.test.mjs).
 *   2. EVERY CALL SITE uses the SAME effectiveDry, never its own copy —
 *      the shape this codebase has already been burned by twice
 *      (ALLOWED_IFRAME_EMBEDS/CSP, cinematicSitesEnabled).
 *   3. mode NEVER IN FLOW_COLUMNS, same reason as minutes_saved — a
 *      column the migration has not pasted yet must not empty every
 *      automation's screen.
 *   4. FAILS TOWARDS "auto": a missing column or a read error is "auto"
 *      everywhere mode is read, never "shadow" or "supervised" by
 *      accident.
 *   5. THE WRITE ROUTE: gated behind "agents-automations-pro", refuses
 *      an unknown value, answers "not_ready" on a column that is not
 *      there yet.
 *
 * Run: node scripts/tests/automation-modes.test.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}
const code = (p) => stripComments(readFileSync(p, "utf8"));
const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json"));

const boxes = await loadTs("src/lib/automations/boxes.ts");

// ---------------------------------------------------------------------
console.log("== 1. FLOW_MODES / isFlowMode ==");
check("exactly the three named values", JSON.stringify(boxes.FLOW_MODES) === JSON.stringify(["auto", "shadow", "supervised"]));
check("DEFAULT_FLOW_MODE is auto — today's behaviour", boxes.DEFAULT_FLOW_MODE === "auto");
check("auto/shadow/supervised are flow modes", ["auto", "shadow", "supervised"].every((m) => boxes.isFlowMode(m)));
check("anything else is not", !boxes.isFlowMode("Auto") && !boxes.isFlowMode("") && !boxes.isFlowMode(null) && !boxes.isFlowMode(undefined) && !boxes.isFlowMode(1) && !boxes.isFlowMode("off"));

// ---------------------------------------------------------------------
console.log("\n== 2. effectiveDry — the ONE rule, run for real ==");
const START_BYS = ["time", "event", "manual", "dry"];
for (const startedBy of START_BYS) {
  check(`startedBy "${startedBy}", mode auto → dry only if "dry"`, boxes.effectiveDry("auto", startedBy) === (startedBy === "dry"));
}
check('shadow + "time" (the cron) is dry', boxes.effectiveDry("shadow", "time") === true);
check('shadow + "event" (a queued file) is dry', boxes.effectiveDry("shadow", "event") === true);
check('shadow + "manual" (the owner pressed the button) is NOT dry — they are right there, deciding', boxes.effectiveDry("shadow", "manual") === false);
check('shadow + "dry" (the Δοκιμή button) stays dry — {dry:true} always wins', boxes.effectiveDry("shadow", "dry") === true);
check('supervised never forces dry on its own — it gates with an approval box instead', ["time", "event", "manual"].every((s) => boxes.effectiveDry("supervised", s) === false));

// ---------------------------------------------------------------------
console.log("\n== 3. withSupervisedApprovals — deterministic, never stored ==");
const start = { id: "b1", kind: "start", when: "file_uploaded" };
const read = { id: "b2", kind: "read", source: "uploaded_file" };
const ai = { id: "b3", kind: "ai", instruction: "summarise it" };
const action = { id: "b4", kind: "action", do: "save_to_library" };
const approval = { id: "b5", kind: "approval" };
const action2 = { id: "b6", kind: "action", do: "send_telegram" };

{
  const out = boxes.withSupervisedApprovals([start, read, ai, action]);
  check("inserts one approval, right before the action box that had none", out.length === 5 && out[3].kind === "approval" && out[4].id === "b4");
  check("the inserted id is derived from the action's own id — never collides", out[3].id === "b4-auto-gate");
}
{
  // action (b4) already has its own approval (b5) right before it;
  // action2 (b6) has only action (b4) before it — no approval there yet.
  const out = boxes.withSupervisedApprovals([start, read, approval, action, action2]);
  const actionIdx = out.findIndex((b) => b.id === "b4");
  const action2Idx = out.findIndex((b) => b.id === "b6");
  check("a box ALREADY gated by its own approval gets no second one", out[actionIdx - 1]?.kind === "approval" && out[actionIdx - 1]?.id === "b5");
  check("...but the action with none right before it still gets one", out[action2Idx - 1]?.kind === "approval" && out[action2Idx - 1]?.id !== "b5");
  check("exactly one new gate was inserted (length grew by one, not two)", out.length === 6);
}
{
  const out = boxes.withSupervisedApprovals([start, read, ai]);
  check("no action box at all → nothing inserted, array unchanged", out.length === 3 && out.every((b, i) => b === [start, read, ai][i]));
}
{
  const once = boxes.withSupervisedApprovals([start, action]);
  const twice = boxes.withSupervisedApprovals(boxes.withSupervisedApprovals([start, action]));
  check("idempotent on a row that already has its gates (resume rebuilds the SAME array)", JSON.stringify(once) === JSON.stringify(boxes.withSupervisedApprovals(once)));
  check("applying it twice in a row from scratch still lands on the one-gate shape (sanity, not a real call pattern)", twice.filter((b) => b.kind === "approval").length === 1);
}
check("MAX_BOXES (8) bounds what is STORED, not what supervised walks through", boxes.withSupervisedApprovals([start, read, action, { id: "b7", kind: "action", do: "notify" }, { id: "b8", kind: "action", do: "send_email" }]).length > boxes.MAX_BOXES - 1);

// ---------------------------------------------------------------------
console.log("\n== 4. the runner applies the transform from ctx.flow.mode, and bounds the resume ==");
const runnerSrc = code("src/lib/automations/runner.ts");
check("imports withSupervisedApprovals and DEFAULT_FLOW_MODE from boxes.ts, not a private copy",
  /import \{[^}]*withSupervisedApprovals[^}]*DEFAULT_FLOW_MODE[^}]*\} from "@\/lib\/automations\/boxes"/.test(runnerSrc) ||
  /import \{[^}]*DEFAULT_FLOW_MODE[^}]*withSupervisedApprovals[^}]*\} from "@\/lib\/automations\/boxes"/.test(runnerSrc));
check("FlowRow carries an optional mode", /mode\?:\s*FlowMode/.test(runnerSrc));
check("the transform runs only for \"supervised\"", /mode === "supervised" \? withSupervisedApprovals\(flow\.boxes\) : flow\.boxes/.test(runnerSrc));
check("a resume past the rebuilt length fails the run instead of reading boxes[i] out of bounds",
  /ctx\.resume && ctx\.resume\.at > boxes\.length/.test(runnerSrc) && /resume_mismatch/.test(runnerSrc));

// ---------------------------------------------------------------------
console.log("\n== 5. EVERY call site uses effectiveDry — none computes dry its own way ==");
const startRunSrc = code("src/lib/automations/start-run.ts");
check("start-run.ts imports effectiveDry from boxes.ts", /import \{ effectiveDry, DEFAULT_FLOW_MODE \} from "@\/lib\/automations\/boxes"/.test(startRunSrc));
check("startRun's dry is effectiveDry(...), not startedBy === \"dry\" alone", /dry: effectiveDry\(params\.flow\.mode \?\? DEFAULT_FLOW_MODE, params\.startedBy\)/.test(startRunSrc));
check("no second, hand-rolled dry rule left in start-run.ts", !/dry:\s*params\.startedBy === "dry"\s*,/.test(startRunSrc));

const eventRunsSrc = code("src/lib/automations/event-runs.ts");
check("event-runs.ts imports effectiveDry too", /effectiveDry/.test(eventRunsSrc));
check('a queued file\'s run is dry via effectiveDry(mode, "event"), not a hardcoded dry:false', /dry: effectiveDry\(mode \?\? DEFAULT_FLOW_MODE, "event"\)/.test(eventRunsSrc));
check("...and fetches that automation's OWN mode first, via modeFor", /modeFor\(admin, flow\.id as string, run\.user_id\)/.test(eventRunsSrc));

// ---------------------------------------------------------------------
console.log("\n== 6. mode is never in FLOW_COLUMNS, and fails towards \"auto\" everywhere it is read ==");
const flowAccessSrc = code("src/lib/automations/flow-access.ts");
check("FLOW_COLUMNS does not name mode — a missing column must never empty every automation's screen",
  !/FLOW_COLUMNS = "[^"]*\bmode\b[^"]*"/.test(flowAccessSrc));
check("modeFor exists, and answers DEFAULT_FLOW_MODE on a column-missing error", /export async function modeFor\(/.test(flowAccessSrc) && /return DEFAULT_FLOW_MODE/.test(flowAccessSrc));
check("modesByFlowIds exists, for the cron's one tick instead of one query per due flow", /export async function modesByFlowIds\(/.test(flowAccessSrc));
check("isColumnMissing moved here (not duplicated) so modeFor/modesByFlowIds can use it without a cycle through page-data.ts",
  /export function isColumnMissing\(/.test(flowAccessSrc));

const pageDataSrc = code("src/lib/automations/page-data.ts");
check("page-data.ts re-exports isColumnMissing instead of redefining it", /import \{[^}]*isColumnMissing[^}]*\} from "@\/lib\/automations\/flow-access"/.test(pageDataSrc) && /export \{ isColumnMissing \}/.test(pageDataSrc));

// ---------------------------------------------------------------------
console.log("\n== 7. the cron asks for every due flow's mode ONCE per tick, not once per flow ==");
const cronSrc = code("src/app/api/cron/automation-flows/route.ts");
check("imports modesByFlowIds", /modesByFlowIds/.test(cronSrc));
check("one call, over every due flow across every person, before the per-flow loop", /const modes = await modesByFlowIds\(admin, \[\.\.\.perUser\.values\(\)\]\.flat\(\)\.map\(\(f\) => f\.id\)\);/.test(cronSrc));
check("startRun is given THIS flow's mode from that map", /mode: modes\.get\(flow\.id\)/.test(cronSrc));

// ---------------------------------------------------------------------
console.log("\n== 8. the manual run route and the approve route each fetch the flow's own mode ==");
const runRouteSrc = code("src/app/api/automations/flows/[id]/run/route.ts");
check("run route: fetches mode before starting", /modeFor\(createAdminClient\(\), id, user\.id\)/.test(runRouteSrc));
check("run route: passes it into the flow object startRun receives", /boxes: verdict\.boxes, cost_limit: flow\.cost_limit, time_zone: flow\.time_zone, mode \}/.test(runRouteSrc));

const approveRouteSrc = code("src/app/api/automations/runs/[runId]/approve/route.ts");
check("approve route: fetches mode before resuming", /modeFor\(admin, flow\.id, user\.id\)/.test(approveRouteSrc));
check("approve route: passes it into the flow object go() receives", /time_zone: flow\.time_zone, mode \}/.test(approveRouteSrc));

// ---------------------------------------------------------------------
console.log("\n== 9. the write route: gated, validated, column-missing-safe ==");
const patchRouteSrc = code("src/app/api/automations/flows/[id]/route.ts");
check('gated behind "agents-automations-pro", the same switch Κομμάτι 1 shipped behind', /isFeatureOn\("agents-automations-pro", user\)/.test(patchRouteSrc));
check("refuses anything that is not a real FlowMode", /isFlowMode\(body\.mode\)/.test(patchRouteSrc) && /refuse\("bad_mode", 400\)/.test(patchRouteSrc));
check('a column not there yet answers "not_ready", same as minutes_saved',
  // Anchored on the "mode" stage, not a bare occurrence: the pre-existing
  // minutes_saved write has an identical not_ready line of its own in
  // this same file, so a check that only asked "is this text in
  // patchRouteSrc anywhere?" would stay green even with THIS one gone —
  // the mirror-image of the bug fixed in automations.test.mjs.
  /if \(isColumnMissing\(error\)\) return refuse\("not_ready", 409\);\s*\n\s*logApiError\("\/api\/automations\/flows\/\[id\]", error, \{ stage: "mode" \}\);/.test(patchRouteSrc));
check("setting mode alone (no boxes, no cost_limit, no name) is not refused as \"nothing_to_change\"", /minutesSaved === undefined && mode === undefined/.test(patchRouteSrc));

// ---------------------------------------------------------------------
console.log("\n== 10. the migration: additive, fails towards auto, says how to undo ==");
const migration = readFileSync("supabase/migrations/20261123000000_automation_mode.sql", "utf8");
check("adds the column idempotently", /add column if not exists mode text not null default 'auto'/.test(migration));
check("constrains it to exactly the three values", /check \(mode in \('auto', 'shadow', 'supervised'\)\)/.test(migration));
check("says how to undo", /How to undo:/.test(migration) && /drop column if\s*\n?\s*-*\s*exists mode/.test(migration.replace(/\n--\s*/g, "\n")));

// ---------------------------------------------------------------------
console.log("\n== 11. the selector (Κομμάτι 2b): read, wired, drawn, saved ==");
const pageData = code("src/lib/automations/page-data.ts");
check("loadModes reads mode in a query of its own, never in FLOW_COLUMNS, same precedent as loadMinutesSaved",
  !/FLOW_COLUMNS = "[^"]*\bmode\b/.test(code("src/lib/automations/flow-access.ts")) &&
    /\.from\("automation_flows"\)\.select\("id, mode"\)\.eq\("user_id", userId\)\.limit\(MAX_FLOWS\);/.test(pageData));
check("…answers null for the whole map on any error, including a column not there yet",
  /export async function loadModes[\s\S]{0,400}?if \(error\) \{\s*if \(!isColumnMissing\(error\)\) logApiError\([^)]*\);\s*return null;\s*\}/.test(pageData));
check("…and a row with no mode yet (or a bad value) falls to DEFAULT_FLOW_MODE, never undefined",
  /isFlowMode\(row\.mode\) \? row\.mode : DEFAULT_FLOW_MODE/.test(pageData));
check("loadAutomationPage takes modeOn, defaulting closed, and only then reads it",
  /modeOn = false\s*\n\)/.test(pageData) && /modeOn \? loadModes\(supabase, user\.id\) : Promise\.resolve\(null\)/.test(pageData) && /modes,/.test(pageData));

const dashPage = code("src/app/dashboard/[module]/page.tsx");
check("the dashboard page reads the mode with the SAME switch it reads the selector's own write behind — one flag, not two that could disagree",
  /loadAutomationPage\(user, searchParams\.run, searchParams\.flow, searchParams\.projectId, timeSavedOn, simplePro\)/.test(dashPage) &&
    /initialModes=\{data\.modes\}/.test(dashPage));

const shellSrc = code("src/components/automations/automation-shell.tsx");
check("the shell keeps the modes map in state, seeded from the server read", /const \[modes, setModes\] = useState<Record<string, FlowMode> \| null>\(initialModes\);/.test(shellSrc));
check("saveMode PATCHes { mode }, and reads the mode the route echoes back — not a guess that the write landed",
  /async function saveMode\(flow: ShownFlow, mode: FlowMode\) \{\s*const data = await call\(`\/api\/automations\/flows\/\$\{flow\.id\}`, "PATCH", \{ mode \}, "save"\);/.test(shellSrc) &&
    /setModes\(\(prev\) => \(prev \? \{ \.\.\.prev, \[flow\.id\]: \(data\.mode as FlowMode \| undefined\) \?\? mode \} : prev\)\);/.test(shellSrc));
check("the selector is drawn only when the modes map could be read at all — a reader who cannot write mode is never shown one that cannot save it",
  /\{modes && \(\s*<ModeForm/.test(shellSrc) && /mode=\{modes\[shown\.id\] \?\? "auto"\}/.test(shellSrc) && /onSave=\{\(mode\) => void saveMode\(shown, mode\)\}/.test(shellSrc));

const flowBoxesSrc = code("src/components/automations/flow-boxes.tsx");
const modeForm = flowBoxesSrc.slice(flowBoxesSrc.indexOf("export function ModeForm"));
check("ModeForm draws exactly the three FLOW_MODES, in the order boxes.ts declares them", /FLOW_MODES\.map\(\(m\) => \(/.test(modeForm));
check("…each press calls onSave with the OTHER mode, never re-saving the one already chosen", /onClick=\{\(\) => m !== mode && onSave\(m\)\}/.test(modeForm));
check("…and every press is disabled while a request from this screen is already in flight", /disabled=\{saving\}/.test(modeForm));

for (const file of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.automations?.mode ?? {};
  check(`${file}: carries all eight mode.* keys, none empty`,
    ["label", "auto", "autoHelp", "shadow", "shadowHelp", "supervised", "supervisedHelp", "save"].every((k) => typeof m[k] === "string" && m[k].length > 0));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
