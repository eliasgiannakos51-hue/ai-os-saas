#!/usr/bin/env node
/*
 * CAN automation-modes.test.mjs SEE "shadow" LETTING A REAL ACTION
 * THROUGH, "supervised" SKIPPING ITS GATE, TWO CALL SITES DISAGREEING ON
 * WHAT DRY MEANS, OR mode SNEAKING INTO FLOW_COLUMNS AND EMPTYING EVERY
 * AUTOMATION'S SCREEN THE DAY BEFORE THE MIGRATION IS PASTED?
 *
 * Run: node scripts/tests/automation-modes.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/automation-modes.test.mjs";
const BOXES = "src/lib/automations/boxes.ts";
const RUNNER = "src/lib/automations/runner.ts";
const START_RUN = "src/lib/automations/start-run.ts";
const EVENT_RUNS = "src/lib/automations/event-runs.ts";
const FLOW_ACCESS = "src/lib/automations/flow-access.ts";
const CRON = "src/app/api/cron/automation-flows/route.ts";
const EDIT_ROUTE = "src/app/api/automations/flows/[id]/route.ts";
const MIGRATION = "supabase/migrations/20261123000000_automation_mode.sql";

const MUTANTS = [
  {
    name: "shadow stops forcing dry on a manual run too — the owner's own 'Δοκιμή'/'Εκτέλεση τώρα' distinction is lost",
    file: BOXES,
    from: 'return mode === "shadow" && startedBy !== "manual";',
    to: 'return mode === "shadow";',
    expect: 'shadow + "manual" (the owner pressed the button) is NOT dry',
  },
  {
    name: "shadow stops forcing dry on the CRON at all — a shadow automation runs for real, unattended",
    file: BOXES,
    from: 'return mode === "shadow" && startedBy !== "manual";',
    to: 'return false;',
    expect: 'shadow + "time" (the cron) is dry',
  },
  {
    name: "withSupervisedApprovals stops checking what came before an action — gates EVERY action, even already-gated ones",
    file: BOXES,
    from: 'if (box.kind === "action" && out[out.length - 1]?.kind !== "approval") {',
    to: 'if (box.kind === "action") {',
    expect: "a box ALREADY gated by its own approval gets no second one",
  },
  {
    name: "withSupervisedApprovals stops inserting anything — supervised mode becomes a no-op",
    file: BOXES,
    from: "out.push({ id: `${box.id}-auto-gate`, kind: \"approval\" });",
    to: "",
    expect: "inserts one approval, right before the action box that had none",
  },
  {
    name: "runFlow applies the supervised transform regardless of mode — auto automations get an uninvited approval gate",
    file: RUNNER,
    from: 'const boxes: Box[] = mode === "supervised" ? withSupervisedApprovals(flow.boxes) : flow.boxes;',
    to: "const boxes: Box[] = withSupervisedApprovals(flow.boxes);",
    expect: "the transform runs only for \"supervised\"",
  },
  {
    name: "runFlow drops the resume-bounds guard — a stale index after a mode change reads boxes[i] out of bounds",
    file: RUNNER,
    from: 'if (ctx.resume && ctx.resume.at > boxes.length) {\n    return { status: "failed", steps: [...ctx.resume.steps], credits: ctx.resume.credits, error: "flow:resume_mismatch" };\n  }',
    to: "",
    expect: "a resume past the rebuilt length fails the run",
  },
  {
    name: "startRun goes back to computing dry its own way, instead of effectiveDry — shadow stops applying to the cron's calls into startRun",
    file: START_RUN,
    from: "dry: effectiveDry(params.flow.mode ?? DEFAULT_FLOW_MODE, params.startedBy),",
    to: 'dry: params.startedBy === "dry",',
    expect: "startRun's dry is effectiveDry",
  },
  {
    name: "event-runs.ts goes back to a hardcoded dry:false — a shadow automation's queued-file run is never a rehearsal",
    file: EVENT_RUNS,
    from: 'dry: effectiveDry(mode ?? DEFAULT_FLOW_MODE, "event"),',
    to: "dry: false,",
    expect: "a queued file's run is dry via effectiveDry",
  },
  {
    name: "modeFor stops answering DEFAULT_FLOW_MODE on a column-missing error — it answers undefined-is-falsy instead, which a careless caller could read as supervised",
    file: FLOW_ACCESS,
    from: "    if (!isColumnMissing(error)) logApiError(\"automations:mode\", error, { stage: \"mode_for\", flowId });\n    return DEFAULT_FLOW_MODE;",
    to: '    if (!isColumnMissing(error)) logApiError("automations:mode", error, { stage: "mode_for", flowId });\n    return undefined;',
    expect: "modeFor exists, and answers DEFAULT_FLOW_MODE on a column-missing error",
  },
  {
    name: "mode sneaks into FLOW_COLUMNS — a database without the migration pasted yet would empty every automation's screen",
    file: FLOW_ACCESS,
    from: 'export const FLOW_COLUMNS = "id, name, said, boxes, version, is_active, time_zone, next_run_at, last_run_at, cost_limit, busy_since, created_at";',
    to: 'export const FLOW_COLUMNS = "id, name, said, boxes, version, is_active, time_zone, next_run_at, last_run_at, cost_limit, busy_since, created_at, mode";',
    expect: "FLOW_COLUMNS does not name mode",
  },
  {
    name: "the cron goes back to no mode at all — every automation on this tick runs as \"auto\" no matter what its owner set",
    file: CRON,
    from: "mode: modes.get(flow.id)",
    to: "mode: undefined",
    expect: "startRun is given THIS flow's mode from that map",
  },
  {
    name: "the PATCH route stops gating mode behind agents-automations-pro — anyone could set it before Κομμάτι 1 ships to them",
    file: EDIT_ROUTE,
    from: 'if (!(await isFeatureOn("agents-automations-pro", user))) return refuse("not_enabled", 403);\n    if (!isFlowMode(body.mode)) return refuse("bad_mode", 400);',
    to: "if (!isFlowMode(body.mode)) return refuse(\"bad_mode\", 400);",
    expect: "agents-automations-pro",
  },
  {
    name: "the PATCH route stops validating mode — any string reaches the database, and the check constraint is the only thing left standing between it and a 500",
    file: EDIT_ROUTE,
    from: "if (!isFlowMode(body.mode)) return refuse(\"bad_mode\", 400);\n    mode = body.mode;",
    to: "mode = body.mode;",
    expect: "refuses anything that is not a real FlowMode",
  },
  {
    // Anchored on the "mode" stage so it cannot match the identical
    // not_ready line the minutes_saved write already had above it in
    // this same file — automations.mutation.mjs disambiguates its own
    // copy of this mutant the same way, for the same reason.
    name: "setting the mode on a database without the column yet reaches logApiError/500 instead of answering \"not_ready\"",
    file: EDIT_ROUTE,
    from: 'if (isColumnMissing(error)) return refuse("not_ready", 409);\n      logApiError("/api/automations/flows/[id]", error, { stage: "mode" });',
    to: 'logApiError("/api/automations/flows/[id]", error, { stage: "mode" });',
    expect: "a column not there yet answers",
  },
  {
    name: "the migration drops its own check constraint — a bad value written any other way is no longer caught at the database",
    file: MIGRATION,
    from: "add constraint automation_flows_mode_check check (mode in ('auto', 'shadow', 'supervised'));",
    to: "add constraint automation_flows_mode_check check (true);",
    expect: "constrains it to exactly the three values",
  },
];

runMutations({ name: "automation-modes", gate: GATE, targets: [BOXES, RUNNER, START_RUN, EVENT_RUNS, FLOW_ACCESS, CRON, EDIT_ROUTE, MIGRATION], mutants: MUTANTS });
