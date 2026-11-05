#!/usr/bin/env node
/*
 * CAN automations.test.mjs SEE AN AUTOMATION THAT RUNS WRONG, COSTS WRONG,
 * OR RUNS FOR THE WRONG PERSON?
 *
 * A row that starts twice or reads a file nobody uploaded; Sunday as day
 * 7; a question ignored; a fence sent on; a cut answer sent as finished;
 * a Library document that runs; a dry run that sends; a box run past its
 * limit or charged when nothing came back; a run approved twice; the
 * cron that runs a run again on every tick; an upload that runs the model
 * itself; the database that lets the browser write.
 *
 * Run: node scripts/tests/automations.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/automations.test.mjs";
const BOXES = "src/lib/automations/boxes.ts";
const ANSWERS = "src/lib/automations/answers.ts";
const RUNNER = "src/lib/automations/runner.ts";
const ACCESS = "src/lib/automations/flow-access.ts";
const APPROVE = "src/app/api/automations/runs/[runId]/approve/route.ts";
const CRON = "src/app/api/cron/automation-flows/route.ts";
const INGEST = "src/lib/files/ingest.ts";
const MIGRATION = "supabase/migrations/20261021000000_automation_flows.sql";
const SHELL = "src/components/shell/tool-shell.tsx";
const AUTO_SHELL = "src/components/automations/automation-shell.tsx";
const FLOW_BOXES = "src/components/automations/flow-boxes.tsx";
const PAGE = "src/app/dashboard/[module]/page.tsx";
const PROGRESS = "src/lib/automations/run-progress.ts";
const TEMPLATES = "src/lib/automations/templates.ts";
const TEMPLATE_ROUTE = "src/app/api/automations/templates/route.ts";
const GALLERY = "src/components/automations/template-gallery.tsx";
const TIME_SAVED = "src/lib/automations/time-saved.ts";
const PAGE_DATA = "src/lib/automations/page-data.ts";
const EDIT = "src/app/api/automations/flows/[id]/route.ts";
const MINUTES_SQL = "supabase/migrations/20261114000000_automation_minutes_saved.sql";
const CSS = "src/app/globals.css";

const MUTANTS = [
  {
    name: "a row may start twice",
    file: BOXES,
    from: '  if (starts.length > 1) return { ok: false, reason: "two_starts" };\n',
    to: "",
    expect: "every way a row is not one is refused by name",
  },
  {
    name: "a file is read by an automation no file started",
    file: BOXES,
    from: '  if (start.when !== "file_uploaded" && boxes.some((b) => b.kind === "read" && b.source === "uploaded_file")) {',
    to: '  if (false && start.when !== "file_uploaded" && boxes.some((b) => b.kind === "read" && b.source === "uploaded_file")) {',
    expect: "every way a row is not one is refused by name",
  },
  {
    name: "Sunday is day 7, which cron does not have",
    file: BOXES,
    from: "      return `${minute} ${hour} * * ${(start.weekday ?? 1) % 7}`;",
    to: "      return `${minute} ${hour} * * ${start.weekday ?? 1}`;",
    expect: "a schedule is a cron expression, Sunday as 0",
  },
  {
    name: "the model's question is ignored and its guess kept",
    file: ANSWERS,
    from: '  if (question) return { ok: false, kind: "question", question: question.slice(0, 300) };\n',
    to: "",
    expect: "a question is asked instead of guessing",
  },
  {
    name: "our own fence, echoed back, is sent on",
    file: ANSWERS,
    from: '  if (!checked.ok) return checked.reason === "leaked_instructions" ? { kind: "unsafe" } : null;',
    to: "  if (!checked.ok) return null;",
    expect: "an echoed fence is not sent",
  },
  {
    name: "a cut answer is sent as if finished",
    file: ANSWERS,
    from: "answer.truncated ? `${checked.output}\\n\\n— ${truncationNotice(locale)}` : checked.output",
    to: "checked.output",
    expect: "a cut answer is kept and says it was cut",
  },
  {
    name: "a Library document carries what was read as markup",
    file: ANSWERS,
    from: '<p>${escapeHtml(b).replace(/\\n/g, "<br>")}</p>',
    to: '<p>${b.replace(/\\n/g, "<br>")}</p>',
    expect: "a Library document is text: nothing in it runs",
  },
  {
    name: "an approved run goes on still marked waiting",
    file: ANSWERS,
    from: '(st.status === "waiting" ? { ...st, status: "ok", note: "approval_given" } : st)',
    to: "st",
    expect: "an approved run goes on from the box after its approval",
  },
  {
    name: "a dry run really sends",
    file: RUNNER,
    from: '  if (ctx.dry) return { box: box.id, status: "would", note: box.do === "save_to_library" ? "would_save" : "would_send", via: box.do };\n',
    to: "",
    expect: "a dry run sends nothing",
  },
  {
    name: "an AI box runs past the automation's own limit",
    file: RUNNER,
    from: "      if (credits + estimate.reserveCredits > ctx.flow.cost_limit) {",
    to: "      if (false && credits + estimate.reserveCredits > ctx.flow.cost_limit) {",
    expect: "a box that would pass the limit is not run",
  },
  {
    name: "a box that got no answer keeps its hold",
    file: RUNNER,
    from: '      if (out.kind === "provider" && !out.answered) {\n        await releaseReservation(ctx.user.id, reservationId);\n',
    to: '      if (out.kind === "provider" && !out.answered) {\n',
    expect: "nothing came back: the hold goes back",
  },
  {
    name: "what was read reaches the model as instructions",
    file: RUNNER,
    from: "wrapUntrusted(material.slice(0, MAX_READ_CHARS))",
    to: "material.slice(0, MAX_READ_CHARS)",
    expect: "what was read is handed to the model as data",
  },
  {
    name: "any person's uploaded file can be read",
    file: RUNNER,
    from: '    .eq("id", ctx.eventRef)\n    .eq("user_id", ctx.user.id)\n',
    to: '    .eq("id", ctx.eventRef)\n',
    expect: "an uploaded file is read only as its owner's",
  },
  {
    name: "a change that needs a connection leaves the automation on",
    file: ACCESS,
    from: "  if (missing.length > 0) return { patch: { is_active: false, next_run_at: null }, paused: missing };\n",
    to: "",
    expect: "a change to one that is on that now needs a connection switches it off",
  },
  {
    name: "two approvals send the report twice",
    file: APPROVE,
    from: '      .eq("user_id", user.id)\n      .eq("status", "waiting_approval")\n      .select("id");',
    to: '      .eq("user_id", user.id)\n      .select("id");',
    expect: "a waiting run is taken once",
  },
  {
    name: "the cron runs a due automation without moving it forward",
    file: CRON,
    from: "          .update({ busy_since: new Date().toISOString(), next_run_at: next })",
    to: "          .update({ busy_since: new Date().toISOString() })",
    expect: "a due automation is moved forward in the same update that claims it",
  },
  {
    name: "the cron runs a flow it cannot read",
    file: CRON,
    from: "          if (!verdict.ok || !user) {",
    to: "          if (!user) {",
    expect: "not run for a flow it cannot read or a person who is gone",
  },
  {
    name: "a file that could not be read starts automations",
    file: INGEST,
    from: '  const automations = status === "ready" ? await queueFileRuns(user, String(row.id)) : 0;',
    to: "  const automations = await queueFileRuns(user, String(row.id));",
    expect: "an upload that was read queues its automations",
  },
  {
    name: "the browser may write its own runs",
    file: MIGRATION,
    from: "revoke insert, update, delete on public.automation_runs from authenticated;",
    to: "grant insert, update on public.automation_runs to authenticated;",
    expect: "automation_runs: row level security, the owner reads, nobody writes from the browser",
  },
  {
    name: "on a phone the tab bar covers the bottom of the work area again",
    file: SHELL,
    from: "bg-workspace pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 ",
    to: "bg-workspace ",
    expect: "on a phone the work area keeps room for the tab bar under it",
  },
  {
    name: "the room left is less than the tab bar",
    file: SHELL,
    from: "pb-[calc(4rem+env(safe-area-inset-bottom))]",
    to: "pb-[calc(3rem+env(safe-area-inset-bottom))]",
    expect: "on a phone the work area keeps room for the tab bar under it",
  },
  // «Simple | Pro» (directive 55, Κομμάτι 1). The defects worth catching
  // here are the ones that take something away: a reader who loses the
  // configurator, a level that drops a step, a switch Automations drew
  // for itself, a word cut in half.
  {
    name: "a reader without the switch gets Simple, and loses the boxes they had",
    file: AUTO_SHELL,
    from: 'const level: ShellMode = simplePro ? mode : "pro";',
    to: "const level: ShellMode = mode;",
    expect: "no switch for a reader without it, and Pro is what they get",
  },
  {
    name: "Simple quietly drops a step",
    file: FLOW_BOXES,
    from: "      {boxes.map((box, i) => {\n          const missing",
    to: '      {boxes.filter((b) => b.kind !== "condition").map((box, i) => {\n          const missing',
    expect: "Simple shows EVERY step: it maps the array whole, with no filter and no cap",
  },
  {
    name: "the two levels stop reading the same boxes",
    file: AUTO_SHELL,
    from: "<FlowSteps boxes={shown.boxes} connected={connected} />",
    to: "<FlowSteps boxes={shown.boxes.slice(1)} connected={connected} />",
    expect: "Simple and Pro are drawn from the same boxes, not two stores",
  },
  {
    name: "the shared bar stops drawing the switch, so a tool must make its own",
    file: SHELL,
    from: "{work.mode && <ShellModeSwitch value={work.mode.value} onChange={work.mode.onChange} />}\n",
    to: "",
    expect: "the switch is declared and drawn by the shared shell",
  },
  {
    name: "a level's name may be cut in half",
    file: SHELL,
    from: 'className={`min-h-[44px] whitespace-nowrap rounded-full px-3',
    to: 'className={`min-h-[44px] truncate rounded-full px-3',
    expect: "both words are on screen at once, and neither is ever shortened",
  },
  {
    name: "the page stops reading the switch, so an unfinished level ships to everyone",
    file: PAGE,
    from: 'isFeatureOn("agents-automations-pro", user),',
    to: "Promise.resolve(true),",
    expect: "the page reads the switch, which fails towards staff",
  },
  {
    name: "leaving Pro keeps the chosen box, so its editor reopens under nothing",
    file: AUTO_SHELL,
    from: '    if (next === "simple") setChosen(null);\n',
    to: "",
    expect: "leaving Pro clears the chosen box, so its editor cannot reopen under nothing",
  },
  // 2026-11-05, after the owner's automation videos. «Όταν → Αν → Κάνε»:
  // a step said as the wrong part, or not said at all.
  {
    name: "an approval is said as «Κάνε», not «Αν»",
    file: BOXES,
    from: '  approval: "if",\n',
    to: '  approval: "do",\n',
    expect: "the start is «Όταν»; the condition and the approval are «Αν»",
  },
  {
    name: "Simple stops saying which part each step is",
    file: FLOW_BOXES,
    from: "                {part[partOf(box)]}\n",
    to: "                {i + 1}\n",
    expect: "Simple draws each step's part, from the box's own kind, before its sentence",
  },
  // The live canvas: a position invented, a run brought back, a moving
  // line nobody can switch off, a failure blamed on nothing.
  {
    name: "the canvas lights a line that the run has not reached",
    file: PROGRESS,
    from: '    if (from === "done" && to === "active") return "active";',
    to: '    if (to === "active" || to === "idle") return "active";',
    expect: "a run that has done two boxes is IN the third",
  },
  {
    name: "a finished run keeps its lines lit",
    file: PROGRESS,
    from: "  if (!isLive(run)) return idle;\n",
    to: "",
    expect: "lights nothing: idle is calm",
  },
  {
    name: "a failed run marks nothing",
    file: PROGRESS,
    from: '    const step = [...run.steps].reverse().find((s) => s.status === "failed" && boxes.some((b) => b.id === s.box));',
    to: "    const step = undefined as RunStep | undefined;",
    expect: "a run that failed marks the box it failed at",
  },
  {
    name: "the canvas follows last week's run, by clock, while its own press is in flight",
    file: PROGRESS,
    from: "    return newest.find((r) => !known.has(r.id)) ?? null;",
    to: "    return newest[0] ?? null;",
    expect: "while its own press is in flight it follows the run that was NOT there before",
  },
  {
    name: "the runner never says where it is, so the canvas can only guess",
    file: RUNNER,
    from: "    if (steps.length > 0) await reportProgress(ctx, steps);\n",
    to: "",
    expect: "the runner writes what it has done before each box it starts",
  },
  {
    name: "a progress write brings a closed run back to life",
    file: RUNNER,
    from: '    .eq("user_id", ctx.user.id)\n    .eq("status", "running");',
    to: '    .eq("user_id", ctx.user.id);',
    expect: "only onto the person's own row while it is still running",
  },
  {
    name: "the canvas polls for everybody, switch or no switch",
    file: AUTO_SHELL,
    from: '  const alive = simplePro && level === "pro";',
    to: "  const alive = true;",
    expect: "the canvas is alive only behind the switch, and only in Pro",
  },
  {
    name: "the dots keep moving for somebody who asked for less motion",
    file: CSS,
    from: 'html[data-motion="reduce"] .flow-dot {\n  display: none;\n}',
    to: 'html[data-motion="reduce"] .flow-dot {\n  opacity: 1;\n}',
    expect: "reduced motion, asked for either way",
  },
  {
    name: "a working line is drawn in the globe's signal colour",
    file: CSS,
    from: '.flow-line[data-state="active"] {\n  background-color: rgb(var(--foreground) / 0.45);',
    to: '.flow-line[data-state="active"] {\n  background-color: rgb(var(--signal) / 0.45);',
    expect: "the lines are the palette's own",
  },
  // Templates: a wrong row, a half-made one, an unbounded or unswitched route.
  {
    name: "the daily summary runs at 09:30, not the owner's 08:30",
    file: TEMPLATES,
    from: '      { id: "b1", kind: "start", when: "time", every: "day", at: "08:30" },',
    to: '      { id: "b1", kind: "start", when: "time", every: "day", at: "09:30" },',
    expect: "(a) every day at 08:30",
  },
  {
    name: "a «Σύντομα» template becomes something to press",
    file: TEMPLATES,
    from: 'export const TEMPLATE_IDS = ["finance_daily", "finance_weekly"] as const;',
    to: 'export const TEMPLATE_IDS = ["finance_daily", "finance_weekly", "instagram_to_telegram"] as const;',
    expect: "two ready: the finance assistant's daily summary and weekly analysis",
  },
  {
    name: "a «Σύντομα» card grows a button",
    file: GALLERY,
    from: '                  <p data-testid="flow-template-why" className="break-words text-xs text-muted">',
    to: '                  <button type="button" onClick={() => undefined}>x</button>\n                  <p data-testid="flow-template-why" className="break-words text-xs text-muted">',
    expect: "a «Σύντομα» card has nothing to press",
  },
  {
    name: "the templates route stops reading its switch",
    file: TEMPLATE_ROUTE,
    from: '  if (!(await isFeatureOn("automation-templates", user))) return refuse("not_enabled", 403);\n',
    to: "",
    expect: "templates: signs in, then the gate, then its own switch",
  },
  {
    name: "the templates route makes rows without a limit",
    file: TEMPLATE_ROUTE,
    from: '  if (!limited.allowed) return refuse("rate_limited", 429);\n',
    to: "",
    expect: "bounded as a free insert is",
  },
  {
    name: "a template is made already switched on",
    file: TEMPLATE_ROUTE,
    from: "boxes, version: 1, is_active: false, time_zone: timeZone })",
    to: "boxes, version: 1, is_active: true, time_zone: timeZone })",
    expect: "made off, version 1",
  },
  // Time saved: a number invented, a trial counted, a screen emptied by a migration not yet run.
  {
    name: "an automation with no minutes is given ten",
    file: TIME_SAVED,
    from: "  const minutes = readMinutes(minutesPerRun);",
    to: "  const minutes = readMinutes(minutesPerRun) ?? 10;",
    expect: "no minutes, no number",
  },
  {
    name: "a trial is counted as time saved",
    file: TIME_SAVED,
    from: 'export const COUNTED_STARTS = ["time", "event", "manual"] as const;',
    to: 'export const COUNTED_STARTS = ["time", "event", "manual", "dry"] as const;',
    expect: "a trial saves nobody anything",
  },
  {
    name: "seventy-five minutes is said as one hour",
    file: TIME_SAVED,
    from: "  const hours = total < 600 ? Math.round(total / 30) / 2 : Math.round(total / 60);",
    to: "  const hours = Math.round(total / 60);",
    expect: "from an hour, in hours to the half hour",
  },
  {
    name: "the screen reads the new column with every automation, so a database without it shows none",
    file: ACCESS,
    from: 'export const FLOW_COLUMNS = "id, name, said, boxes, version, is_active, time_zone, next_run_at, last_run_at, cost_limit, busy_since, created_at";',
    to: 'export const FLOW_COLUMNS = "id, name, said, boxes, version, is_active, time_zone, next_run_at, last_run_at, cost_limit, busy_since, created_at, minutes_saved";',
    expect: "THE APP WORKS BEFORE THE MIGRATION",
  },
  {
    name: "a missing column is logged as a failure instead of read as «not yet»",
    file: PAGE_DATA,
    from: '  return error?.code === "42703" || error?.code === "PGRST204";',
    to: '  return error?.code === "PGRST204";',
    expect: "a missing column is Postgres's 42703 on a read",
  },
  {
    name: "a database without the column refuses the limit sent beside the minutes",
    file: EDIT,
    from: '      if (isColumnMissing(error)) return refuse("not_ready", 409);\n',
    to: "",
    expect: "a database without the column answers «not ready»",
  },
  {
    name: "the database lets a run replace more than a working day",
    file: MINUTES_SQL,
    from: "check (minutes_saved is null or minutes_saved between 1 and 480)",
    to: "check (minutes_saved is null or minutes_saved between 1 and 1440)",
    expect: "the column is nullable, and bounded where the code bounds it",
  },
];

runMutations({
  name: "automations",
  gate: GATE,
  targets: [BOXES, ANSWERS, RUNNER, ACCESS, APPROVE, CRON, INGEST, MIGRATION, SHELL, AUTO_SHELL, FLOW_BOXES, PAGE, PROGRESS, TEMPLATES, TEMPLATE_ROUTE, GALLERY, TIME_SAVED, PAGE_DATA, EDIT, MINUTES_SQL, CSS],
  mutants: MUTANTS,
});
