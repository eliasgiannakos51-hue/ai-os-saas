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
    name: "the cron runs automations for a person whose switch was closed",
    file: CRON,
    from: '          if (!verdict.ok || !user || !(await isFeatureOn("automations", user))) {',
    to: "          if (!verdict.ok || !user) {",
    expect: "not run for a person whose switch was closed",
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
];

runMutations({
  name: "automations",
  gate: GATE,
  targets: [BOXES, ANSWERS, RUNNER, ACCESS, APPROVE, CRON, INGEST, MIGRATION, SHELL],
  mutants: MUTANTS,
});
