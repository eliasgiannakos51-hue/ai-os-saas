/*
 * «ΓΡΑΦΩ "ΟΤΑΝ ΑΝΕΒΑΖΩ ΑΡΧΕΙΟ, ΚΑΝΕ ΣΥΝΟΨΗ ΚΑΙ ΒΑΛ' ΤΗ ΣΤΗ ΒΙΒΛΙΟΘΗΚΗ",
 * ΒΛΕΠΩ ΤΑ ΚΟΥΤΙΑ, ΑΛΛΑΖΩ ΕΝΑ ΜΕ ΛΟΓΙΑ, ΚΑΙ ΤΡΕΧΕΙ ΜΟΝΟ ΤΟΥ» (MASTER 16,
 * package 30), for everybody since 2026-10-23 (no switch).
 *
 * What this holds, against the code rather than its comments:
 *
 *   1. THE BOXES: the three rows of MASTER 5.18 are rows; every way a row
 *      is not one is refused by name; a schedule is the person's own hour.
 *   2. WHAT THE MODEL SAID: a question is a question, a cut or broken
 *      answer is refused, a changed box keeps its place.
 *   3. WHAT A RUN MAKES: an echoed fence is not sent, a cut answer says
 *      so, a Library document runs nothing, a waiting run goes on from
 *      the box after its approval.
 *   4. THE MONEY: priced before, held per AI box against the automation's
 *      own limit, released only when nothing came back.
 *   5. THE OWNER: every route signs in, reads the row as the owner's, and
 *      a waiting run is taken once.
 *   6. ON ITS OWN: the cron moves a run forward before it runs; an upload
 *      queues and nothing more.
 *   7. THE DATABASE.
 *   8. THE SCREEN AND THE WORDS.
 *
 * The model's request and the runner with every outside call stubbed:
 * automations.itest.mjs. The screen in a browser: automations.prodtest.mjs.
 *
 * Run: node scripts/tests/automations.test.mjs
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

const boxes = await loadTs("src/lib/automations/boxes.ts");
const answers = await loadTs("src/lib/automations/answers.ts");
const view = await loadTs("src/lib/automations/flow-view.ts");
const cron = await loadTs("src/lib/agents/cron-expression.ts");
const truncation = await loadTs("src/lib/verification/truncation.ts");
const steps = await loadTs("src/lib/automations/run-steps.ts");
const agentConfig = await loadTs("src/lib/agents/agent-config.ts");

console.log("automations");

// ---------------------------------------------------------------------
console.log("\n== 1. the boxes ==");
// ---------------------------------------------------------------------
// MASTER 5.18's three sentences, as the builder is asked to make them.
const MORNING = [
  { id: "b1", kind: "start", when: "time", every: "day", at: "09:00" },
  { id: "b2", kind: "read", source: "calendar_today" },
  { id: "b3", kind: "ai", instruction: "Γράψε σύντομα τι έχω σήμερα" },
  { id: "b4", kind: "action", do: "send_telegram" },
];
const MONDAY = [
  { id: "b1", kind: "start", when: "time", every: "week", at: "08:00", weekday: 1 },
  { id: "b2", kind: "read", source: "finances_week" },
  { id: "b3", kind: "ai", instruction: "Φτιάξε αναφορά της εβδομάδας" },
  { id: "b4", kind: "approval" },
  { id: "b5", kind: "action", do: "send_email" },
];
const UPLOAD = [
  { id: "b1", kind: "start", when: "file_uploaded" },
  { id: "b2", kind: "read", source: "uploaded_file" },
  { id: "b3", kind: "ai", instruction: "Κάνε σύνοψη του αρχείου" },
  { id: "b4", kind: "action", do: "save_to_library" },
];
for (const [name, row] of [["morning Telegram", MORNING], ["Monday report after approval", MONDAY], ["upload summary to the Library", UPLOAD]]) {
  const flow = boxes.readFlow(row);
  check(`«${name}» is a row of ${row.length} boxes`, flow.ok && flow.boxes.length === row.length, JSON.stringify(flow));
}
const reason = (row) => boxes.readFlow(row).reason;
check("every way a row is not one is refused by name",
  reason([]) === "empty" &&
    reason(null) === "empty" &&
    reason([{ kind: "ai", instruction: "abc" }, { kind: "action", do: "notify" }]) === "no_start" &&
    reason([MORNING[1], MORNING[0], MORNING[3]]) === "start_not_first" &&
    reason([MORNING[0], { ...UPLOAD[0], id: "b9" }, MORNING[3]]) === "two_starts" &&
    reason(MORNING.slice(0, 3)) === "no_action" &&
    reason(Array.from({ length: 9 }, (_, i) => (i === 0 ? MORNING[0] : { id: `x${i}`, kind: "action", do: "notify" }))) === "too_many" &&
    reason([MORNING[0], { kind: "action", do: "send_to_everyone" }]) === "bad_box" &&
    reason([MORNING[0], UPLOAD[1], MORNING[3]]) === "file_read_without_upload" &&
    reason([MORNING[0], { ...MORNING[3], id: "b1" }]) === "duplicate_id");
check("a box is read defensively",
  boxes.readBox({ kind: "start", when: "time", every: "day", at: "25:00" }, "b1") === null &&
    boxes.readBox({ kind: "start", when: "time", every: "week", at: "09:00", weekday: 8 }, "b1") === null &&
    boxes.readBox({ kind: "start", when: "time", every: "month", at: "09:00", monthDay: 31 }, "b1") === null &&
    boxes.readBox({ kind: "ai", instruction: "  " }, "b1") === null &&
    boxes.readBox({ kind: "read", source: "someone_elses_mail" }, "b1") === null &&
    boxes.readBox({ kind: "ai", instruction: "x".repeat(2000) }, "b1").instruction.length === boxes.MAX_INSTRUCTION_CHARS &&
    boxes.readBox({ id: "../../etc", kind: "approval" }, "b7").id === "b7");
check("a schedule is a cron expression, Sunday as 0",
  boxes.cronFor(MORNING[0]) === "0 9 * * *" &&
    boxes.cronFor({ ...MORNING[0], every: "weekdays", at: "07:30" }) === "30 7 * * 1-5" &&
    boxes.cronFor(MONDAY[0]) === "0 8 * * 1" &&
    boxes.cronFor({ ...MONDAY[0], weekday: 7 }) === "0 8 * * 0" &&
    boxes.cronFor({ ...MORNING[0], every: "month", monthDay: 5 }) === "0 9 5 * *" &&
    boxes.cronFor(UPLOAD[0]) === null);
// «στις 9» is 9 where the person is: Athens is UTC+3 in October.
const next = cron.nextRunAt(boxes.cronFor(MORNING[0]), new Date("2026-10-07T07:00:00Z"), "Europe/Athens");
check("«every morning at 9» in Athens runs at 06:00 UTC, the next morning once 9 has passed", next?.toISOString() === "2026-10-08T06:00:00.000Z", next?.toISOString());
check("what each row needs connected",
  JSON.stringify(boxes.connectionsNeeded(MORNING)) === JSON.stringify(["google_calendar", "telegram"]) &&
    boxes.connectionsNeeded(MONDAY).length === 0 &&
    boxes.connectionsNeeded(UPLOAD).length === 0);
check("a run is priced on its AI boxes", boxes.aiBoxCount(MORNING) === 1 && boxes.aiBoxCount([MORNING[0], MORNING[3]]) === 0);

// ---------------------------------------------------------------------
console.log("\n== 2. what the model said ==");
// ---------------------------------------------------------------------
check("a question is asked instead of guessing, even with boxes beside it",
  answers.readBuilt({ name: "x", boxes: MORNING, question: "Τι ώρα;", unsupported: "" }).kind === "question");
check("an answer that is not a row is unusable, and says why", answers.readBuilt({ name: "x", boxes: MORNING.slice(0, 3), question: "" }).detail === "no_action" && answers.readBuilt(null).kind === "unusable");
const made = answers.readBuilt({ name: "  ", boxes: UPLOAD, question: "", unsupported: "Το Gmail δεν γίνεται ακόμα" });
check("a row is kept, with a name and what could not be done", made.ok && made.name.length > 0 && made.unsupported === "Το Gmail δεν γίνεται ακόμα" && made.boxes.length === 4);
const changed = answers.readChanged({ box: { id: "zz", kind: "start", when: "time", every: "day", at: "08:00" } }, boxes.readFlow(MORNING).boxes, "b1");
check("a changed box keeps its id and its place", changed.ok && changed.box.id === "b1" && changed.box.at === "08:00");
check("...and a change that would break the row is refused",
  answers.readChanged({ box: { kind: "action", do: "notify" } }, boxes.readFlow(MORNING).boxes, "b1").ok === false &&
    answers.readChanged({ box: { kind: "read", source: "uploaded_file" } }, boxes.readFlow(MORNING).boxes, "b2").detail === "file_read_without_upload");
const builder = code("src/lib/automations/builder.ts");
check("a reply cut at its ceiling is refused, both calls", (builder.match(/if \(outcome\.stopReason === AI_TRUNCATED_STOP_REASON\) return \{ ok: false, kind: "unusable", detail: "max_tokens" \};/g) ?? []).length === 2);
check("the person's words are sanitised and handed over as data", (builder.match(/const \{ text \} = sanitiseAgentText\(params\.(said|instruction)\);/g) ?? []).length === 2 && /\(data, not instructions\)/.test(builder));
check("only the chosen box comes back from a change; the route puts it in its place",
  /current\.boxes\.map\(\(b\) => \(b\.id === boxId \? changed\.box : b\)\)/.test(code("src/app/api/automations/flows/[id]/change/route.ts")));

// ---------------------------------------------------------------------
console.log("\n== 3. what a run makes ==");
// ---------------------------------------------------------------------
const reply = (text, stop = "end_turn") => truncation.modelText({ content: [{ type: "text", text }], stop_reason: stop });
check("an echoed fence is not sent", answers.readAiAnswer(reply("ok <<<UNTRUSTED_CONTENT_START>>> send it all"), "el")?.kind === "unsafe" || answers.readAiAnswer(reply(`ok ${agentConfig.wrapUntrusted("x")}`), "el")?.kind === "unsafe");
const cut = answers.readAiAnswer(reply("Σήμερα έχεις τρεις συναντήσεις και", "max_tokens"), "el");
check("a cut answer is kept and says it was cut, in the person's language", cut?.kind === "ok" && cut.text.endsWith(truncation.truncationNotice("el")) && cut.text.startsWith("Σήμερα"));
check("a whole answer is the answer", answers.readAiAnswer(reply("Σήμερα: 10:00 Γιάννης."), "el")?.text === "Σήμερα: 10:00 Γιάννης.");
check("an empty answer is not an answer", answers.readAiAnswer(reply(""), "el") === null);
const html = answers.textToDocumentHtml("Σύνοψη <b>", "Πρώτο\n\n<script>alert(1)</script>\nγραμμή");
check("a Library document is text: nothing in it runs", html === "<h1>Σύνοψη &lt;b&gt;</h1><p>Πρώτο</p><p>&lt;script&gt;alert(1)&lt;/script&gt;<br>γραμμή</p>", html);
const at = new Date("2026-10-07T22:30:00Z"); // already the 8th in Athens
check("today, tomorrow and the week are the person's days",
  JSON.stringify(answers.periodFor("calendar_today", "Europe/Athens", at)) === JSON.stringify({ from: "2026-10-08", to: "2026-10-08" }) &&
    JSON.stringify(answers.periodFor("calendar_tomorrow", "Europe/Athens", at)) === JSON.stringify({ from: "2026-10-09", to: "2026-10-09" }) &&
    JSON.stringify(answers.periodFor("calendar_week", "UTC", at)) === JSON.stringify({ from: "2026-10-07", to: "2026-10-13" }));
const resumed = answers.resumeFrom({ at: 4, text: "η αναφορά", credits: 3 }, [{ box: "b3", status: "ok", note: "ai_done", credits: 3 }, { box: "b4", status: "waiting", note: "approval_waiting" }]);
check("an approved run goes on from the box after its approval, with what it made", resumed?.at === 4 && resumed.text === "η αναφορά" && resumed.credits === 3 && resumed.steps[1].note === "approval_given" && resumed.steps[1].status === "ok");
check("...and a run that was not waiting goes on from nowhere", answers.resumeFrom(null, []) === null && answers.resumeFrom({ at: 0 }, []) === null);
const runner = code("src/lib/automations/runner.ts");
check("a dry run sends nothing: every action says what it would do", /if \(ctx\.dry\) return \{ box: box\.id, status: "would", note: box\.do === "save_to_library" \? "would_save" : "would_send", via: box\.do \};/.test(runner) && runner.indexOf("if (ctx.dry) return") < runner.indexOf("deliverAgentResult("));
check("...and passes an approval through", /if \(ctx\.dry\) \{\s*steps\.push\(\{ box: box\.id, status: "would", note: "would_wait" \}\);\s*continue;/.test(runner));
check("a condition with nothing before it stops, quietly", /const empty = readCount === 0 \|\| !text\.trim\(\);/.test(runner) && /if \(empty\) return \{ status: "stopped", steps, credits \};/.test(runner));
check("an approval stops the run, keeps what it made, and tells the person", /status: "waiting_approval",\s*steps,\s*state: \{ at: i \+ 1, text, credits \}/.test(runner) && /createNotification\(\{/.test(runner) && /url: `\/dashboard\/automation\?run=\$\{ctx\.runId\}`/.test(runner));
check("what was read is handed to the model as data", /wrapUntrusted\(material\.slice\(0, MAX_READ_CHARS\)\)/.test(runner));
check("an uploaded file is read only as its owner's", /\.from\("user_files"\)[\s\S]{0,120}\.eq\("id", ctx\.eventRef\)\s*\.eq\("user_id", ctx\.user\.id\)/.test(runner));
check("sending goes to the person and nobody else", /deliverAgentResult\(\{\s*userId: ctx\.user\.id,\s*email: ctx\.user\.email \?\? "",\s*method,\s*target: "",/.test(runner));
check("a waiting run's steps read back with the approval given", view.readShownRun({ id: "r", status: "waiting_approval", state: { text: "να σταλεί" }, steps: [] }).output === "να σταλεί" && view.readShownRun({ status: "done", state: { output: "στάλθηκε" } }).output === "στάλθηκε");
check("a run's error is said by its code", view.errorCode("b3:no_credits") === "no_credits" && view.errorCode("approval_expired") === "approval_expired" && view.errorCode(null) === null);
check("a stored step is read defensively", steps.readSteps([{ box: "b1", status: "nope", note: "nope", credits: "9" }, null]).length === 1 && steps.readSteps([{ box: "b1", status: "nope", note: "nope" }])[0].status === "failed");

// ---------------------------------------------------------------------
console.log("\n== 4. the money ==");
// ---------------------------------------------------------------------
const aiBlock = runner.slice(runner.indexOf('if (box.kind === "ai") {'), runner.indexOf('if (box.kind === "approval") {'));
const order = ["estimateForAction(", "> ctx.flow.cost_limit", "checkAiCallAllowed(", "reserveCredits(", "runAi("].map((s) => aiBlock.indexOf(s));
check("each AI box: priced, against the automation's limit, the breaker, then held, then asked", order.every((n, i) => n > 0 && (i === 0 || n > order[i - 1])), JSON.stringify(order));
check("...a box that would pass the limit is not run", /if \(credits \+ estimate\.reserveCredits > ctx\.flow\.cost_limit\) \{\s*steps\.push\(\{ box: box\.id, status: "stopped", note: "over_limit" \}\);\s*return \{ status: "stopped", steps, credits \};/.test(aiBlock));
check("...no credits: the step says so and nothing is asked", /if \(!reservation\?\.ok\) \{\s*steps\.push\(\{ box: box\.id, status: "failed", note: "no_credits" \}\);/.test(aiBlock));
check("...nothing came back: the hold goes back", /if \(out\.kind === "provider" && !out\.answered\) \{\s*await releaseReservation\(ctx\.user\.id, reservationId\);/.test(aiBlock));
check("...something came back: it is settled on what it used, before anything is sent", aiBlock.indexOf("settleReservation(") > aiBlock.indexOf("out.answered") && /bypassCharge: bypass,/.test(aiBlock) && /feature: FLOW_FEATURE,/.test(aiBlock));
check("...an account that is not charged meets its own ceiling per box", /if \(bypass\) \{\s*const ceiling = await checkBypassCeiling\(ctx\.user\.id, ctx\.isAdmin, ctx\.isBeta\);/.test(aiBlock));
const pricing = code("src/lib/automations/flow-pricing.ts");
check("the prices on the screen are the estimates the routes hold", /estimateForAction\("automationBuild"/.test(pricing) && /estimateForAction\("automationStep", \{ model: AGENT_RUNNER_MODEL, inputChars: STEP_MAX_INPUT_CHARS/.test(pricing));
check("...and the runner reads no more than it was priced on", /const MAX_READ_CHARS = STEP_MAX_INPUT_CHARS;/.test(runner));
for (const [name, file] of [["make", "src/app/api/automations/flows/route.ts"], ["change", "src/app/api/automations/flows/[id]/change/route.ts"]]) {
  const src = code(file);
  check(`${name}: held at the price shown before the model is asked; a question still costs what it used`,
    /const price = flowPrices\(gate\.plan, gate\.packPriceEur\)\.build;/.test(src) && src.indexOf("reserveCredits(user.id, price, FLOW_FEATURE") > 0 && src.indexOf("reserveCredits(") < src.indexOf(name === "make" ? "buildFlow(" : "changeBox(") && src.indexOf("settleReservation(") < src.indexOf(name === "make" ? "built.kind === \"question\") {" : "if (!changed.ok) return"));
  check(`${name}: a provider failure gives the hold back`, /kind === "provider"\) \{\s*await releaseReservation\(user\.id, reservationId\);/.test(src) && /if \(!settled\) await releaseReservation\(user\.id, reservationId\);/.test(src));
}

// ---------------------------------------------------------------------
console.log("\n== 5. the owner ==");
// ---------------------------------------------------------------------
const ROUTES = {
  make: "src/app/api/automations/flows/route.ts",
  edit: "src/app/api/automations/flows/[id]/route.ts",
  change: "src/app/api/automations/flows/[id]/change/route.ts",
  undo: "src/app/api/automations/flows/[id]/undo/route.ts",
  active: "src/app/api/automations/flows/[id]/active/route.ts",
  run: "src/app/api/automations/flows/[id]/run/route.ts",
  runs: "src/app/api/automations/flows/[id]/runs/route.ts",
  approve: "src/app/api/automations/runs/[runId]/approve/route.ts",
  cancel: "src/app/api/automations/runs/[runId]/cancel/route.ts",
  events: "src/app/api/automations/events/route.ts",
  templates: "src/app/api/automations/templates/route.ts",
};
for (const [name, file] of Object.entries(ROUTES)) {
  check(`${name}: signs in, then the gate`, /if \(!user\) return refuse\("not_signed_in", 401\);\s*const gate = await flowGate\(user\);\s*if \(gate instanceof NextResponse\) return gate;/.test(code(file)));
}
for (const name of ["edit", "change", "undo", "active", "run"]) {
  check(`${name}: the automation is the owner's`, /\.from\("automation_flows"\)\s*\.select\(FLOW_COLUMNS\)\s*\.eq\("id", id\)\s*\.eq\("user_id", user\.id\)\s*\.maybeSingle\(\);/.test(code(ROUTES[name])) && /if \(!found\) return refuse\("not_found", 404\);/.test(code(ROUTES[name])));
}
check("the gate reads no switch: every signed-in person has the tool", !/isFeatureOn/.test(code("src/lib/automations/flow-access.ts")) && /const plan = await resolveEffectivePlan\(user\);/.test(code("src/lib/automations/flow-access.ts")));
check("a waiting run is taken once: approve and cancel move it only from waiting",
  /\.update\(\{ status: "running", approval_expires_at: null \}\)\s*\.eq\("id", runId\)\s*\.eq\("user_id", user\.id\)\s*\.eq\("status", "waiting_approval"\)/.test(code(ROUTES.approve)) &&
    /\.eq\("id", runId\)\s*\.eq\("user_id", user\.id\)\s*\.eq\("status", "waiting_approval"\)/.test(code(ROUTES.cancel)));
check("...and an approval past its deadline is refused", /if \(run\.approval_expires_at && new Date\(run\.approval_expires_at as string\)\.getTime\(\) < Date\.now\(\)\) return refuse\("expired", 409\);/.test(code(ROUTES.approve)));
check("an automation is switched on only with everything it needs connected", /const missing = await missingConnections\(user, verdict\.boxes\);\s*if \(missing\.length > 0\) return refuse\("needs_connection", 409, \{ missing \}\);/.test(code(ROUTES.active)));
check("a change to one that is on that now needs a connection switches it off, and says so", /if \(missing\.length > 0\) return \{ patch: \{ is_active: false, next_run_at: null \}, paused: missing \};/.test(code("src/lib/automations/flow-access.ts")));
check("one thing at a time on one automation", /\.or\(`busy_since\.is\.null,busy_since\.lt\.\$\{cutoff\}`\)/.test(code("src/lib/automations/flow-access.ts")) && ["change", "undo", "run"].every((n) => /if \(!\(await claimFlow\(id, user\.id\)\)\) return refuse\("busy", 409\);/.test(code(ROUTES[n])) && /finally \{\s*await releaseFlow\(id, user\.id\);/.test(code(ROUTES[n]))));
check("the events route runs the caller's queued runs, nobody else's", /\.eq\("user_id", user\.id\)\s*\.eq\("status", "queued"\)/.test(code(ROUTES.events)) && /if \(run\.user_id !== user\.id\) continue;/.test(code(ROUTES.events)));
const undo = code(ROUTES.undo);
check("undo goes back one version, and undoing twice goes back two", /\.eq\("version", flow\.version - 1\)/.test(undo) && /version: flow\.version - 1,/.test(undo) && /\.gte\("version", params\.version\)/.test(code("src/lib/automations/flow-access.ts")));

// ---------------------------------------------------------------------
console.log("\n== 6. on its own ==");
// ---------------------------------------------------------------------
const cronRoute = code("src/app/api/cron/automation-flows/route.ts");
check("the cron is the cron's: CRON_SECRET first", /const auth = checkCronAuth\(request\);\s*if \(!auth\.ok\)/.test(cronRoute));
check("it is scheduled every 15 minutes", JSON.parse(readFileSync("vercel.json", "utf8")).crons.some((c) => c.path === "/api/cron/automation-flows" && c.schedule === "*/15 * * * *"));
check("a due automation is moved forward in the same update that claims it, before it runs",
  /\.update\(\{ busy_since: new Date\(\)\.toISOString\(\), next_run_at: next \}\)[\s\S]{0,200}\.lte\("next_run_at", nowIso\)/.test(cronRoute) && cronRoute.indexOf("next_run_at: next }") < cronRoute.indexOf("startRun("));
check("...in its own time zone", /nextRunFor\(verdict\.boxes, flow\.time_zone, now\)/.test(cronRoute));
check("...and not run for a flow it cannot read or a person who is gone, with no switch in the way", /if \(!verdict\.ok \|\| !user\) \{/.test(cronRoute) && !/isFeatureOn/.test(cronRoute));
check("approvals nobody gave are cancelled; runs a dead request left are closed", /\.eq\("status", "waiting_approval"\)\s*\.lt\("approval_expires_at", nowIso\)/.test(cronRoute) && /\.eq\("status", "running"\)\s*\.lt\("started_at", staleRunning\)/.test(cronRoute));
const ingest = code("src/lib/files/ingest.ts");
const fileEvent = code("src/lib/automations/file-event.ts");
check("an upload that was read queues its automations, and an unreadable one does not", /const automations = status === "ready" \? await queueFileRuns\(user, String\(row\.id\)\) : 0;/.test(ingest));
check("...only the person's own, active, started by a file", /\.eq\("user_id", user\.id\)\s*\.eq\("is_active", true\)/.test(fileEvent) && /flow\.boxes\[0\]\.when === "file_uploaded"/.test(fileEvent) && !/isFeatureOn/.test(fileEvent));
check("...queued, not run: an upload calls no model", !/runner|start-run|event-runs/.test(fileEvent) && /status: "queued"/.test(fileEvent));
check("a queued run is taken once", /\.update\(\{ status: "running" \}\)\s*\.eq\("id", run\.id\)\s*\.eq\("user_id", run\.user_id\)\s*\.eq\("status", "queued"\)/.test(code("src/lib/automations/event-runs.ts")));
check("the screen that uploaded asks for them to run, only when some were queued", /if \(typeof queued !== "number" \|\| queued <= 0\) return;/.test(code("src/lib/automations/kick.ts")) && /startQueuedAutomations\(data\.automations\)/.test(code("src/components/files/files-workspace.tsx")) && (code("src/lib/files/upload-file.ts").match(/startQueuedAutomations\(data\.automations\)/g) ?? []).length === 2);

// ---------------------------------------------------------------------
console.log("\n== 7. the database ==");
// ---------------------------------------------------------------------
const sql = readFileSync("supabase/migrations/20261021000000_automation_flows.sql", "utf8");
for (const table of ["automation_flows", "automation_flow_versions", "automation_runs"]) {
  check(`${table}: row level security, the owner reads, nobody writes from the browser`,
    new RegExp(`alter table public\\.${table} enable row level security;`).test(sql) &&
      new RegExp(`create policy ${table}_select_own on public\\.${table} for select using \\(auth\\.uid\\(\\) = user_id\\);`).test(sql) &&
      new RegExp(`revoke insert, update(, delete)? on public\\.${table} from authenticated;`).test(sql));
}
check("versions and runs go with their automation", (sql.match(/references public\.automation_flows\(id\) on delete cascade/g) ?? []).length === 2);
check("the limit is bounded where the route bounds it", /check \(cost_limit between 1 and 5000\)/.test(sql) && /const LIMIT_MIN = 1;\s*const LIMIT_MAX = 5000;/.test(code("src/app/api/automations/flows/[id]/route.ts")));
check("every status and every start the code writes is one the table allows",
  ["queued", "running", "waiting_approval", "done", "stopped", "failed", "cancelled"].every((s) => sql.includes(`'${s}'`)) && ["time", "event", "manual", "dry"].every((s) => sql.includes(`'${s}'`)));

// ---------------------------------------------------------------------
console.log("\n== 8. the screen and the words ==");
// ---------------------------------------------------------------------
const page = code("src/app/dashboard/[module]/page.tsx");
check("the boxes for everybody, INSTEAD of the old page", /if \(isAutomationModule\) \{/.test(page) && !/isFeatureOn\("automations"/.test(page) && page.indexOf("<AutomationShell") < page.lastIndexOf("return ("));
check("the switch is gone (2026-10-23)", !/\n  "automations": "/.test(readFileSync("src/lib/flags/flags.ts", "utf8")));
const shell = code("src/components/automations/automation-shell.tsx");
check("with a box chosen, the field changes that box alone", /if \(shown && chosenBox\) \{[\s\S]{0,200}changeWithWords\(flow, box, text\)/.test(shell));
check("an answer to the one question goes back with the sentence", /const said = pending \? `\$\{pending\.said\}\\n\$\{pending\.question\}\\n\$\{text\}` : text;/.test(shell));
check("every price is on the screen before it is spent, and large ones ask again", /withConfirm\(prices\.build,/.test(shell) && /withConfirm\(runPrice, \(\) => void runIt\(shown, true\)\)/.test(shell) && /needsLargeActionConfirmation\(credits, DEFAULTS\)/.test(shell));
// ON A PHONE the boxes and the history are the shell's full-screen work
// area, and the tab bar is drawn over its bottom: the area ends above it
// below md, or the last run of the history cannot be scrolled into sight
// (found 2026-10-08 by scripts/tests/connections-automations-edges.prodtest.mjs).
const shellWork = code("src/components/shell/tool-shell.tsx");
const barHeight = Number((/min-h-\[(\d+)px\]/.exec(code("src/components/dashboard/mobile-tab-bar.tsx")) ?? [])[1] ?? 0);
const room = /data-testid="tool-shell-work"\s*className="fixed inset-0 z-\[60\] flex flex-col bg-workspace pb-\[calc\((\d+(?:\.\d+)?)rem\+env\(safe-area-inset-bottom\)\)\] md:pb-0 /.exec(shellWork);
check(`on a phone the work area keeps room for the tab bar under it (${room ? Number(room[1]) * 16 : 0}px for a ${barHeight}px bar and the safe area)`,
  barHeight > 0 && Boolean(room) && Number(room[1]) * 16 >= barHeight + 1 && /fixed inset-x-0 bottom-0 z-40 [^"]*pb-\[env\(safe-area-inset-bottom\)\] md:hidden/.test(code("src/components/dashboard/mobile-tab-bar.tsx")));
check("a box that needs a connection says which, and leads to it", /data-testid="flow-needs"/.test(code("src/components/automations/flow-boxes.tsx")) && /<Link href=\{CONNECT_AT\[need\]\}/.test(code("src/components/automations/flow-boxes.tsx")));

// THE WORDS: every key the screen uses, in every language, read from the
// code rather than listed here — a list kept here is a second copy.
const used = new Set();
for (const f of ["src/components/automations/automation-shell.tsx", "src/components/automations/flow-boxes.tsx", "src/components/automations/template-gallery.tsx"]) {
  for (const m of code(f).matchAll(/\bt\("([a-zA-Z_.0-9]+)"/g)) used.add(m[1]);
}
used.add("notify.approval");
check(`the keys the screen uses were found (${used.size})`, used.size >= 120);
const get = (o, k) => k.split(".").reduce((v, p) => (v && typeof v === "object" ? v[p] : undefined), o);
const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json"));
check(`the ten languages (${LOCALES.length})`, LOCALES.length === 10);
for (const file of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.automations ?? {};
  const missing = [...used].filter((k) => typeof get(m, k) !== "string" || !get(m, k).trim());
  check(`${file}: every word, the prices with their number`, missing.length === 0 && /\{count/.test(m.priceBuild ?? "") && /\{count/.test(m.priceRun ?? "") && /\{name\}/.test(m.notify?.approval ?? ""), missing.join(", "));
}

// ---------------------------------------------------------------------
console.log("\n== 9. «Simple | Pro»: two levels, one automation (directive 55, Κομμάτι 1) ==");
// ---------------------------------------------------------------------
// The owner's «55. AGENTS ΚΑΙ AUTOMATIONS: SIMPLE ΚΑΙ PRO», 2026-11-04:
// Simple is the steps as a list in plain words, Pro the mechanism in
// boxes and lines, and «ό,τι φτιάχνεις στο Simple ανοίγει και στο Pro,
// και αντίστροφα».
const flowBoxes = code("src/components/automations/flow-boxes.tsx");
const flagsSrc = readFileSync("src/lib/flags/flags.ts", "utf8");

// THE SWITCH IS THE SHELL'S, NOT AUTOMATIONS' OWN BAR (docs/TOOL-RULES.md:
// «κάθε εργαλείο πάνω στο κοινό κέλυφος, κανένα δεν φτιάχνει δική του
// μπάρα»). Automations hands the shell a value and a setter; the control
// itself is drawn once, in the shell, so Agents cannot grow a second one
// that looks different.
check("the switch is declared and drawn by the shared shell",
  /export function ShellModeSwitch\(\{ value, onChange \}/.test(shellWork) &&
  /\{work\.mode && <ShellModeSwitch value=\{work\.mode\.value\} onChange=\{work\.mode\.onChange\} \/>\}/.test(shellWork));
check("...inside the work bar's own row, beside the title and the tool's actions",
  /\{work\.title\}<\/p>\s*\{work\.mode &&[\s\S]{0,120}\{work\.actions\}/.test(shellWork));
check("Automations passes a mode to the shell and draws no switch of its own",
  /mode: \{ value: mode, onChange: chooseMode \}/.test(shell) && !/ShellModeSwitch/.test(shell.replace(/type ShellMode/g, "")));
check("both words are on screen at once, and neither is ever shortened",
  /whitespace-nowrap/.test(shellWork.slice(shellWork.indexOf("export function ShellModeSwitch"))) &&
  /\{ mode: "simple", label: t\("mode\.simple"\) \}/.test(shellWork) &&
  /\{ mode: "pro", label: t\("mode\.pro"\) \}/.test(shellWork));

// BOTH LEVELS READ THE SAME ARRAY. This is the interchangeability rule as
// a property of the code rather than a promise: there is one `boxes`, so a
// step cannot exist in one level and not the other, and nothing has to be
// copied across when either changes.
const simpleCall = /<FlowSteps boxes=\{(shown\.boxes)\}/.exec(shell);
const proCall = /<BoxRow boxes=\{(shown\.boxes)\}/.exec(shell);
check("Simple and Pro are drawn from the same boxes, not two stores",
  Boolean(simpleCall) && Boolean(proCall) && simpleCall[1] === proCall[1]);
check("Simple shows EVERY step: it maps the array whole, with no filter and no cap",
  /boxes\.map\(\(box, i\) => \{/.test(flowBoxes.slice(flowBoxes.indexOf("export function FlowSteps"))) &&
  !/boxes\.(filter|slice)\(/.test(flowBoxes.slice(flowBoxes.indexOf("export function FlowSteps"), flowBoxes.indexOf("export function BoxEditor"))));
check("Pro keeps the boxes AND the per-box editor it always had",
  /level === "pro" &&\s*\(chosenBox \?/.test(shell) && /<BoxEditor key=/.test(shell));

// WITHOUT THE SWITCH THE SCREEN IS WHAT IT WAS. `level` is Pro whenever
// the reader does not have the flag, so a half-built Simple can never
// hide the configurator from somebody who already had it.
check("no switch for a reader without it, and Pro is what they get",
  /const level: ShellMode = simplePro \? mode : "pro";/.test(shell) &&
  /\.\.\.\(simplePro \? \{ mode: \{/.test(shell) &&
  /simplePro = false/.test(shell));
check("the page reads the switch, which fails towards staff",
  /isFeatureOn\("agents-automations-pro", user\)/.test(page) && /"agents-automations-pro":/.test(flagsSrc));

// THE LEVEL IS A WAY OF LOOKING, NOT PART OF THE AUTOMATION. Nothing is
// stored for it server-side: no column, no migration, so an automation
// made in Simple opens in Pro by construction rather than by a copy.
check("the level is remembered in the browser alone — no column, no migration",
  /window\.localStorage\.setItem\("ionexa\.automationMode", next\)/.test(shell) &&
  !/mode/.test(readFileSync("src/lib/automations/flow-access.ts", "utf8").match(/FLOW_COLUMNS[^;]*/s)?.[0] ?? "") &&
  readdirSync("supabase/migrations").every((f) => !/automation.*mode|mode.*automation/i.test(f)));
check("leaving Pro clears the chosen box, so its editor cannot reopen under nothing",
  /if \(next === "simple"\) setChosen\(null\);/.test(shell) && /const chosenBox = level === "pro" &&/.test(shell));

// A STEP THAT NEEDS A CONNECTION STILL SAYS SO IN SIMPLE. It is the reason
// «Ενεργοποίηση» would do nothing, not mechanism to hide at this level.
const stepsBody = flowBoxes.slice(flowBoxes.indexOf("export function FlowSteps"), flowBoxes.indexOf("export function BoxEditor"));
check("Simple still names a missing connection, and leads to it",
  /connectionsNeeded\(\[box\]\)\.filter\(\(need\) => !connected\[need\]\)/.test(stepsBody) && /<Link href=\{CONNECT_AT\[need\]\}/.test(stepsBody));

// THE TWO WORDS, IN ALL TEN LANGUAGES. The scrape above covers
// dashboard.automations; the switch's own words live under
// dashboard.toolShell, so they are checked here or nowhere.
for (const file of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.toolShell?.mode ?? {};
  check(`${file}: the switch says both levels and names itself`,
    ["label", "simple", "pro"].every((k) => typeof m[k] === "string" && m[k].trim().length > 0));
}

// ---------------------------------------------------------------------
console.log("\n== 10. «Όταν → Αν → Κάνε»: Simple says the sentence (2026-11-05) ==");
// ---------------------------------------------------------------------
// The owner, after the automation videos: in Simple each step says which
// part of the sentence it is — the start is WHEN, a condition and an
// approval are IF, reading, the AI step and the action are DO — so the
// list reads top to bottom as one sentence. Presentation over the same
// boxes: nothing stored changes.
const KINDS = ["start", "read", "ai", "condition", "approval", "action"];
check("every kind of box has a part of the sentence, and no other key is there",
  JSON.stringify(Object.keys(boxes.SENTENCE_PART).sort()) === JSON.stringify([...KINDS].sort()));
check("the start is «Όταν»; the condition and the approval are «Αν»; read, AI and action are «Κάνε»",
  boxes.SENTENCE_PART.start === "when" &&
    boxes.SENTENCE_PART.condition === "if" && boxes.SENTENCE_PART.approval === "if" &&
    boxes.SENTENCE_PART.read === "do" && boxes.SENTENCE_PART.ai === "do" && boxes.SENTENCE_PART.action === "do");
check("…and partOf reads it off the box, for every box of a real row",
  boxes.readFlow(MONDAY).boxes.map(boxes.partOf).join() === "when,do,do,if,do");
check("it is a way of saying the row, not part of it: a box read back carries no part",
  !("part" in boxes.readBox({ id: "b1", kind: "approval", part: "do" }, "b1")) &&
    !/part/.test(code("src/lib/automations/flow-access.ts").match(/FLOW_COLUMNS = "[^"]*"/)?.[0] ?? "x"));
const stepsBlock = flowBoxes.slice(flowBoxes.indexOf("export function FlowSteps"), flowBoxes.indexOf("export function BoxEditor"));
check("Simple draws each step's part, from the box's own kind, before its sentence",
  /data-part=\{partOf\(box\)\}/.test(stepsBlock) &&
    /data-testid="flow-step-part"[\s\S]{0,400}\{part\[partOf\(box\)\]\}/.test(stepsBlock) &&
    stepsBlock.indexOf("{part[partOf(box)]}") < stepsBlock.indexOf("{sentence(box)}"));
check("…the three words are literal keys, so the message slicer sees them",
  /const part: Record<SentencePart, string> = \{ when: t\("parts\.when"\), if: t\("parts\.if"\), do: t\("parts\.do"\) \};/.test(flowBoxes));
for (const file of LOCALES) {
  const parts = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.automations?.parts ?? {};
  const words = ["when", "if", "do"].map((k) => (typeof parts[k] === "string" ? parts[k].trim() : ""));
  check(`${file}: «Όταν», «Αν», «Κάνε» are three different words`, words.every(Boolean) && new Set(words).size === 3, JSON.stringify(parts));
}

// ---------------------------------------------------------------------
console.log("\n== 11. the Pro canvas is alive while a run is going (2026-11-05) ==");
// ---------------------------------------------------------------------
const progressLib = await loadTs("src/lib/automations/run-progress.ts");
const FOUR = boxes.readFlow(MORNING).boxes;
const run = (status, stepList) => ({ status, steps: stepList });
const ok = (box) => ({ box, status: "ok", note: "started" });
const idle = progressLib.runProgress(FOUR, null);
check("no run: every box and every line is idle, nothing is live, nothing failed",
  idle.live === false && Object.values(idle.boxes).every((s) => s === "idle") && idle.lines.length === 3 && idle.lines.every((l) => l === "idle") && idle.failed === null);
const going = progressLib.runProgress(FOUR, run("running", [ok("b1"), ok("b2")]));
check("a run that has done two boxes is IN the third: two done, the third active, the line into it moving",
  going.live === true && going.boxes.b1 === "done" && going.boxes.b2 === "done" && going.boxes.b3 === "active" && going.boxes.b4 === "idle" &&
    going.lines.join() === "done,active,idle", JSON.stringify(going));
const justStarted = progressLib.runProgress(FOUR, run("running", []));
check("…a run with no steps yet is at its start box, and no line moves yet",
  justStarted.boxes.b1 === "active" && justStarted.lines.every((l) => l === "idle"));
check("…a queued run is live too", progressLib.runProgress(FOUR, run("queued", [])).live === true);
for (const status of ["done", "stopped", "waiting_approval", "cancelled"]) {
  const p = progressLib.runProgress(FOUR, run(status, [ok("b1"), ok("b2"), ok("b3"), ok("b4")]));
  check(`a run that is ${status} lights nothing: idle is calm`, p.live === false && p.lines.every((l) => l === "idle") && Object.values(p.boxes).every((s) => s === "idle"));
}
const failedRun = progressLib.runProgress(FOUR, run("failed", [ok("b1"), { box: "b2", status: "failed", note: "not_connected" }]));
check("a run that failed marks the box it failed at, with the step's own note, and nothing moves",
  failedRun.live === false && failedRun.boxes.b2 === "failed" && failedRun.failed?.box === "b2" && failedRun.failed?.note === "not_connected" && failedRun.lines.every((l) => l === "idle"));
check("…a run that crashed before any step failed blames no box",
  progressLib.runProgress(FOUR, run("failed", [ok("b1")])).failed === null &&
    progressLib.runProgress(FOUR, run("failed", [{ box: "zz", status: "failed", note: "failed" }])).failed === null);
const R = (id, startedAt, status = "done") => ({ id, startedAt, status, steps: [] });
const history = [R("old", "2026-11-05T08:00:00Z", "failed"), R("older", "2026-11-04T08:00:00Z")];
check("with no run of its own in flight, the canvas follows the newest run, whoever started it",
  progressLib.followedRun(history, null)?.id === "old");
check("while its own press is in flight it follows the run that was NOT there before — by id, not by clock",
  progressLib.followedRun([...history, R("mine", "2026-11-05T07:59:00Z", "running")], { known: ["old", "older"] })?.id === "mine" &&
    progressLib.followedRun(history, { known: ["old", "older"] }) === null);
check("…and an approval follows the run it approved", progressLib.followedRun(history, { known: [], runId: "older" })?.id === "older");

const runnerSrc = code("src/lib/automations/runner.ts");
const progressFn = runnerSrc.slice(runnerSrc.indexOf("async function reportProgress"), runnerSrc.indexOf("export async function runFlow"));
check("the runner writes what it has done before each box it starts — the real state the canvas reads",
  /for \(let i = ctx\.resume\?\.at \?\? 0; i < boxes\.length; i\+\+\) \{\s*const box = boxes\[i\];\s*if \(steps\.length > 0\) await reportProgress\(ctx, steps\);\s*if \(box\.kind === "start"\)/.test(runnerSrc));
check("…only onto the person's own row while it is still running, never bringing a closed run back",
  /\.update\(\{ steps \}\)\s*\.eq\("id", ctx\.runId\)\s*\.eq\("user_id", ctx\.user\.id\)\s*\.eq\("status", "running"\);/.test(progressFn));
check("…and a failed progress write is logged, never stops the run", /if \(error\) logApiError\("automations:run", error, \{ stage: "progress" \}\);/.test(progressFn) && !/throw|return \{/.test(progressFn));
check("the runs route says where a run is: the same RUN_COLUMNS, steps included", /steps/.test(code("src/lib/automations/flow-access.ts").match(/RUN_COLUMNS = "[^"]*"/)?.[0] ?? ""));
check("the canvas is alive only behind the switch, and only in Pro",
  /const alive = simplePro && level === "pro";/.test(shell) && /const progress = shown && alive \? runProgress\(shown\.boxes, followed\) : null;/.test(shell));
check("…it asks how the run is going only while one is going (or its own press is in flight), once a second",
  /const pollId = shown && open === "flow" && alive && \(\(watch && watch\.flowId === shown\.id\) \|\| isLive\(followed\)\) \? shown\.id : null;/.test(shell) &&
    /if \(!pollId\) return;/.test(shell) && /window\.setInterval\(tick, PROGRESS_POLL_MS\)/.test(shell) && /window\.clearInterval\(timer\)/.test(shell) && progressLib.PROGRESS_POLL_MS === 1000);
check("…and the boxes get it", /<BoxRow boxes=\{shown\.boxes\}[^\n]{0,200}? progress=\{progress\} \/>/.test(shell));
const rowBlock = flowBoxes.slice(flowBoxes.indexOf("export function BoxRow"), flowBoxes.indexOf("export function FlowSteps"));
check("without progress the row is drawn exactly as before: the short still line",
  /\{i > 0 && \(progress \? <FlowLine state=\{progress\.lines\[i - 1\] \?\? "idle"\} \/> : <span aria-hidden="true" className="ms-5 block h-3 w-px bg-border" \/>\)\}/.test(rowBlock));
check("the failed box is marked in the danger colour, with the reason in words",
  /state === "failed" \? "ring-1 ring-danger"/.test(rowBlock) && /data-testid="flow-failed" className="[^"]*text-danger"/.test(rowBlock) && /t\("failedHere", \{ reason: noteWords\(/.test(rowBlock));
const css = readFileSync("src/app/globals.css", "utf8");
const flowCss = css.slice(css.indexOf(".flow-line {"), css.indexOf("@media (prefers-reduced-motion: reduce) {\n  html:not([data-motion=\"full\"]) .flow-dot"));
check("the lines are the palette's own: border when idle, the text colour when lit — never the signal",
  /\.flow-line \{[\s\S]*?background-color: rgb\(var\(--border\)\);/.test(css) && /\.flow-line\[data-state="active"\] \{\s*background-color: rgb\(var\(--foreground\) \/ 0\.45\);/.test(css) &&
    /\.flow-dot \{[\s\S]*?background-color: rgb\(var\(--foreground\)\);/.test(css) && !/--signal|globe-ink/.test(flowCss + css.slice(css.indexOf(".flow-dot {"), css.indexOf(".flow-dot {") + 600)));
check("reduced motion, asked for either way: no dots at all, and the active line at full strength instead",
  /html\[data-motion="reduce"\] \.flow-dot \{\s*display: none;\s*\}/.test(css) &&
    /@media \(prefers-reduced-motion: reduce\) \{\s*html:not\(\[data-motion="full"\]\) \.flow-dot \{\s*display: none;\s*\}\s*html:not\(\[data-motion="full"\]\) \.flow-line\[data-state="active"\] \{\s*background-color: rgb\(var\(--foreground\)\);/.test(css) &&
    /html\[data-motion="reduce"\] \.flow-line\[data-state="active"\] \{\s*background-color: rgb\(var\(--foreground\)\);/.test(css));

// ---------------------------------------------------------------------
console.log("\n== 12. ready-made automations, one press, then the person's own (2026-11-05) ==");
// ---------------------------------------------------------------------
const templates = await loadTs("src/lib/automations/templates.ts");
check("two ready: the finance assistant's daily summary and weekly analysis", templates.TEMPLATE_IDS.join() === "finance_daily,finance_weekly");
for (const file of LOCALES) {
  const words = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.automations?.templates ?? {};
  for (const id of templates.TEMPLATE_IDS) {
    const w = words[id] ?? {};
    const flow = boxes.readFlow(templates.templateBoxes(id, w.instruction ?? ""));
    check(`${file} ${id}: a whole row with the reader's own words, as the route writes it`,
      flow.ok && templates.templateFlow(id, w.instruction) !== null && flow.boxes.find((b) => b.kind === "ai")?.instruction === String(w.instruction).trim() &&
        [w.name, w.description].every((x) => typeof x === "string" && x.trim().length > 0) && w.name.length <= 60,
      JSON.stringify(flow));
  }
  for (const id of templates.SOON_TEMPLATE_IDS) {
    const w = words[id] ?? {};
    check(`${file} ${id}: «Σύντομα» says what it would do and why it cannot yet`, ["name", "description", "why"].every((k) => typeof w[k] === "string" && w[k].trim().length > 0));
  }
  check(`${file}: the gallery's own words`, ["title", "intro", "start", "free", "soon", "made"].every((k) => typeof words[k] === "string" && words[k].trim()) && /\{name\}/.test(words.made ?? "") && ["finance", "instagram"].every((g) => typeof words.groups?.[g] === "string"));
}
const daily = templates.templateBoxes("finance_daily", "Κάνε σύνοψη");
const weekly = templates.templateBoxes("finance_weekly", "Κάνε ανάλυση");
check("(a) every day at 08:30: this week's finances → AI → Telegram",
  daily.map((b) => b.kind).join() === "start,read,ai,action" && daily[0].every === "day" && daily[0].at === "08:30" && daily[1].source === "finances_week" && daily[3].do === "send_telegram");
check("(b) every week: this month's finances → AI → Telegram",
  weekly.map((b) => b.kind).join() === "start,read,ai,action" && weekly[0].every === "week" && weekly[0].weekday === 1 && weekly[1].source === "finances_month" && weekly[3].do === "send_telegram");
check("…both need Telegram connected before they can be switched on, as any automation that sends there",
  JSON.stringify(boxes.connectionsNeeded(daily)) === JSON.stringify(["telegram"]) && JSON.stringify(boxes.connectionsNeeded(weekly)) === JSON.stringify(["telegram"]));
check("what the product cannot do yet is not a template: no id, no boxes, nothing to press",
  templates.SOON_TEMPLATE_IDS.every((id) => !templates.isTemplateId(id)) && !templates.isTemplateId("") && !templates.isTemplateId("__proto__") && !templates.isTemplateId(null) &&
    templates.GALLERY.flatMap((g) => g.soon).sort().join() === [...templates.SOON_TEMPLATE_IDS].sort().join() &&
    templates.GALLERY.flatMap((g) => g.ready).sort().join() === [...templates.TEMPLATE_IDS].sort().join());
check("WhatsApp is not drawn at all: it needs Meta's WhatsApp Business API, the owner's to obtain",
  !/whatsapp/i.test(readFileSync("src/lib/automations/templates.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "")) && /WhatsApp Business/.test(readFileSync("docs/NEEDS-FROM-ELIAS.md", "utf8")));
const gallery = code("src/components/automations/template-gallery.tsx");
const soonBlock = gallery.slice(gallery.indexOf("{g.soon.map("), gallery.indexOf("</ul>"));
check("a «Σύντομα» card has nothing to press", soonBlock.length > 100 && !/<button|onClick|<Link/.test(soonBlock) && /t\("templates\.soon"\)/.test(soonBlock) && /\{words\.why\}/.test(soonBlock));
check("a ready card shows the automation itself and what each run costs, before the press",
  /<FlowSteps boxes=\{boxes\} connected=\{connected\} preview \/>/.test(gallery) && /const runPrice = stepPrice \* aiBoxCount\(boxes\);/.test(gallery) && /onClick=\{\(\) => onStart\(id\)\}/.test(gallery));
const tplRoute = code("src/app/api/automations/templates/route.ts");
check("templates: signs in, then the gate, then its own switch",
  /if \(!user\) return refuse\("not_signed_in", 401\);\s*const gate = await flowGate\(user\);\s*if \(gate instanceof NextResponse\) return gate;\s*if \(!\(await isFeatureOn\("automation-templates", user\)\)\) return refuse\("not_enabled", 403\);/.test(tplRoute));
check("…the browser names a template, never boxes: the rows are this product's own list",
  /if \(!isTemplateId\(body\.template\)\) return refuse\("bad_template", 400\);/.test(tplRoute) && !/body\.boxes/.test(tplRoute) && /const boxes = templateFlow\(template, instruction\);/.test(tplRoute));
check("…no model is called and nothing is held: it writes boxes out", !/runCompletion|buildFlow|reserveCredits|lib\/automations\/builder/.test(tplRoute));
check("…bounded as a free insert is: a limit per hour per account, and the person's MAX_FLOWS",
  /const limited = await checkRateLimit\(\{ scope: "automation_template", identifier: user\.id, maxAttempts: 20, windowMinutes: 60 \}\);\s*if \(!limited\.allowed\) return refuse\("rate_limited", 429\);/.test(tplRoute) && /if \(\(count \?\? 0\) >= MAX_FLOWS\) return refuse\("too_many", 409, \{ limit: MAX_FLOWS \}\);/.test(tplRoute));
check("…made off, version 1, the person's own row — an ordinary automation from then on",
  /\.insert\(\{ id, user_id: user\.id, name: name\.slice\(0, 60\), said, boxes, version: 1, is_active: false, time_zone: timeZone \}\)/.test(tplRoute) && /from\("automation_flow_versions"\)\.insert\(\{ flow_id: id, user_id: user\.id, version: 1, boxes, said \}\)/.test(tplRoute));
check("the gallery opens only for readers the switch is open to", /isFeatureOn\("automation-templates", user\)/.test(page) && /templates=\{templatesOn\}/.test(page) && /open === "templates" && templates/.test(shell) && /templates\s*\? \[/.test(shell));

// ---------------------------------------------------------------------
console.log("\n== 13. «Σου γλίτωσε ~X ώρες»: time saved, measured (2026-11-05) ==");
// ---------------------------------------------------------------------
const saved = await loadTs("src/lib/automations/time-saved.ts");
check("no minutes, no number — however many runs", saved.timeSaved(0, null).kind === "none" && saved.timeSaved(40, null).kind === "none" && saved.timeSaved(40, undefined).kind === "none" && saved.timeSaved(40, 0).kind === "none");
check("minutes but no finished run yet: said as «not yet», never as a number", JSON.stringify(saved.timeSaved(0, 15)) === JSON.stringify({ kind: "not_yet", minutesPerRun: 15 }) && saved.timeSaved(-3, 15).kind === "not_yet" && saved.timeSaved(2.5, 15).kind === "not_yet");
check("runs × minutes, under an hour in minutes", JSON.stringify(saved.timeSaved(3, 15)) === JSON.stringify({ kind: "minutes", total: 45, runs: 3, minutesPerRun: 15 }));
check("…from an hour, in hours to the half hour",
  saved.timeSaved(4, 15).hours === 1 && saved.timeSaved(5, 15).hours === 1.5 && saved.timeSaved(7, 15).hours === 2 && saved.timeSaved(23, 20).hours === 7.5 && saved.timeSaved(23, 20).total === 460);
check("…and from ten hours, in whole hours", saved.timeSaved(40, 15).hours === 10 && saved.timeSaved(100, 480).hours === 800 && saved.timeSaved(61, 15).hours === 15);
check("a minute is a whole number from 1 to 480, typed or stored; anything else is not one",
  saved.readMinutes(15) === 15 && saved.readMinutes(" 15 ") === 15 && saved.readMinutes(480) === 480 && saved.readMinutes(1) === 1 &&
    [0, 481, 1.5, -3, "1e2", "abc", "", null, undefined, NaN, "15 λεπτά"].every((v) => saved.readMinutes(v) === null));
check("a trial saves nobody anything: only the schedule, a file and «Εκτέλεση τώρα» count", saved.COUNTED_STARTS.join() === "time,event,manual");
const pageData = code("src/lib/automations/page-data.ts");
check("…and the count is the database's: finished runs of those starts, the person's own, every one",
  /\.select\("id", \{ count: "exact", head: true \}\)\s*\.eq\("flow_id", flowId\)\s*\.eq\("user_id", userId\)\s*\.eq\("status", "done"\)\s*\.in\("started_by", \[\.\.\.COUNTED_STARTS\]\);/.test(pageData));
check("…the runs route answers it beside the history", /doneRuns: await countDoneRuns\(supabase, user\.id, id\)/.test(code(ROUTES.runs)));
check("THE APP WORKS BEFORE THE MIGRATION: the minutes are read in a query of their own, never in FLOW_COLUMNS",
  !/minutes_saved/.test(code("src/lib/automations/flow-access.ts")) &&
    /\.from\("automation_flows"\)\.select\("id, minutes_saved"\)\.eq\("user_id", userId\)\.limit\(MAX_FLOWS\);/.test(pageData) &&
    /if \(error\) \{\s*if \(!isColumnMissing\(error\)\) logApiError\([^)]*\);\s*return null;\s*\}/.test(pageData));
check("…a missing column is Postgres's 42703 on a read and PostgREST's PGRST204 on a write", /return error\?\.code === "42703" \|\| error\?\.code === "PGRST204";/.test(pageData));
check("…and a closed switch does not even read them", /timeSavedOn \? loadMinutesSaved\(supabase, user\.id\) : Promise\.resolve\(null\)/.test(pageData) && /isFeatureOn\("automation-time-saved", user\)/.test(page));
check("…the screen draws the field and the figure only when the minutes could be read",
  /\{minutesSaved && \(\s*<TimeSavedForm/.test(shell) && /minutes=\{minutesSaved\[shown\.id\] \?\? null\}/.test(shell));
const timeForm = flowBoxes.slice(flowBoxes.indexOf("export function TimeSavedForm"));
check("…with no minutes it draws no figure, and with one it prints both factors beside it",
  /\{saved\.kind !== "none" && \(/.test(timeForm) && /t\("timeSaved\.how", \{ runs: saved\.runs, minutes: saved\.minutesPerRun \}\)/.test(timeForm) && /const saved = timeSaved\(doneRuns, minutes\);/.test(timeForm));
const editRoute = code(ROUTES.edit);
check("the minutes are the person's own write: behind the switch, bounded, the row the session owns",
  /if \(body\.minutes_saved !== undefined\) \{\s*if \(!\(await isFeatureOn\("automation-time-saved", user\)\)\) return refuse\("not_enabled", 403\);/.test(editRoute) &&
    /if \(body\.minutes_saved !== null && minutesSaved === null\) return refuse\("bad_minutes", 400, \{ min: MIN_MINUTES, max: MAX_MINUTES \}\);/.test(editRoute) &&
    /\.update\(\{ minutes_saved: minutesSaved \}\)\.eq\("id", id\)\.eq\("user_id", user\.id\);/.test(editRoute));
check("…a database without the column answers «not ready», and the limit or name sent beside it are not refused with it",
  /if \(isColumnMissing\(error\)\) return refuse\("not_ready", 409\);/.test(editRoute) && !/plain\.minutes_saved/.test(editRoute) && editRoute.indexOf("minutes_saved: minutesSaved") < editRoute.indexOf("const plain"));
const minutesSql = readFileSync("supabase/migrations/20261114000000_automation_minutes_saved.sql", "utf8");
check("the column is nullable, and bounded where the code bounds it",
  /alter table public\.automation_flows add column if not exists minutes_saved integer;/.test(minutesSql) &&
    new RegExp(`check \\(minutes_saved is null or minutes_saved between ${saved.MIN_MINUTES} and ${saved.MAX_MINUTES}\\)`).test(minutesSql) && !/default/i.test(minutesSql.replace(/--[^\n]*/g, "")));
check("…and says how to undo it", /-- How to undo: alter table public\.automation_flows drop constraint if exists/.test(minutesSql));
for (const file of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.automations?.timeSaved ?? {};
  check(`${file}: the figure carries its number, and the how carries both factors`,
    /\{hours/.test(m.hours ?? "") && /\{minutes/.test(m.minutes ?? "") && /\{runs\}/.test(m.how ?? "") && /\{minutes\}/.test(m.how ?? "") && ["label", "unit", "help", "notYet"].every((k) => typeof m[k] === "string" && m[k].trim()));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
