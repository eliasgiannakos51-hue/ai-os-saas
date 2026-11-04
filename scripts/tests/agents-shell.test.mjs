// AGENTS IN THE COMMON SHELL — the owner's directive 25, ΚΟΜΜΑΤΙ 1:
// «Η οθόνη στο κοινό κέλυφος». Five things, in his own words:
//
//   Αρχική       the list of my agents and the field «Τι να κάνει ο νέος…»
//   Οθόνη βοηθού the plan and the progress in boxes, one per step, with
//                Done / Working / Waiting
//   Πάνελ δεξιά  name, email, tools and connections allowed, credit limit
//                per job and per month, schedule, approval rules
//   Μπάρα        status, «Run now», one white button
//   Καρτέλα      Inbox, with what it received and what awaits approval
//
// WHAT THIS FILE IS FOR, beyond those five. Four of the panel's six rows
// have no data anywhere in the product yet, and the failure mode for a
// screen like that is not an empty box — it is a plausible one. So every
// honest gap is checked as a SENTENCE THAT EXISTS, in all ten languages,
// and the two rows that do have data are checked against the thing that
// produces them rather than against a number typed into the component.
//
// And one more, because this piece moved a 1664-line file: nothing the
// old screen could do may have quietly stopped working. §7 ranges over
// every route the old workspace called.
//
// Read with comments stripped where the claim is about code: none of this
// renders without a browser, and scripts/tests/agents-shell.prodtest.mjs
// is where the screen is pressed.
//
// Run: node scripts/tests/agents-shell.test.mjs
import { readFileSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";

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

const SHELL = "src/components/agents/agents-shell.tsx";
const PAGE = "src/app/dashboard/agents/page.tsx";
const raw = readFileSync(SHELL, "utf8");
const src = stripComments(raw);
const page = stripComments(readFileSync(PAGE, "utf8"));
const LOCALES = ["el", "en", "de", "es", "fr", "it", "pt", "ar", "ja", "zh"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
const agentsMessages = (locale) => messages[locale].dashboard.agents;

// IS THIS A SENTENCE, OR A STUB? — and the answer cannot be a character
// count, which is a Latin-alphabet assumption. Measured 2026-10-31 over
// the seven honest-gap sentences in this file: every Latin locale lands
// between 86% and 138% of the English, Arabic between 76% and 91%,
// Japanese between 47% and 65%, and Chinese between 33% and 43% — one
// Chinese character carries what four or five English ones do. So the
// English is held to an absolute floor, and every other language to a
// share of it, with the lowest observed ratio (33%) rounded down to 30%.
// A stub in any language still fails; a correctly terse translation does
// not.
const MIN_ENGLISH_CHARS = 40;
const MIN_SHARE_OF_ENGLISH = 0.3;
function notASentence(key) {
  const english = agentsMessages("en").shell?.[key];
  if (typeof english !== "string" || english.trim().length < MIN_ENGLISH_CHARS) return ["en"];
  return LOCALES.filter((l) => {
    const value = agentsMessages(l).shell?.[key];
    return typeof value !== "string" || value.trim().length < english.trim().length * MIN_SHARE_OF_ENGLISH;
  });
}


console.log("== 1. the screen is the common shell, and the field is its only one ==");
check("it renders ToolShell, and the page draws it in the full-height wrapper",
  /<ToolShell\b/.test(src) &&
    /<AgentsShell\b/.test(page) &&
    /<div className="h-\[calc\(100dvh-8rem\)\] md:h-\[calc\(100vh-4rem\)\]">/.test(page));
check("...and the page keeps no old body behind it",
  !/-workspace"/.test(page.replace(/import type [^;]*;/g, "")) && !/<ListLayout|<EntityCard/.test(page));
// THE LITERAL RULE tool-shell.test.mjs holds every tool in the shell to,
// restated here because this screen is the one that had three fields:
// a search box, the create textarea and the edit form.
check("there is nothing to type into but the shell's own field",
  !/<textarea\b|<input\b(?![^>]*type="(?:checkbox|radio|file)")/.test(src));
check("the field's placeholder says which of the two things it writes",
  /placeholder=\{\s*selected\s*\?\s*fieldTarget === "task"\s*\?\s*t\("shell\.placeholderTask"\)\s*:\s*t\("shell\.placeholderDescription"\)\s*:\s*t\("requestPlaceholder"\)\s*\}/.test(src));
check("the landing is the registry's own two keys plus the shared examples",
  /heading: t\("empty\.title"\)/.test(src) && /why: t\("empty\.why"\)/.test(src) &&
    /examples: exampleKeys\("agents"\)\.map\(\(key\) => \(\{ key, label: tExamples\(key as never\) \}\)\)/.test(src));

console.log("\n== 2. SENDING NEVER SPENDS ==");
// The old screen's own comment says why, and it is the whole order of
// this flow: "offering a cheaper route after the expensive one has been
// paid for is offering a refund". So the field may not call the builder.
{
  const sendStart = src.indexOf("function onSend(text: string)");
  const sendEnd = src.indexOf("const ownRunJob", sendStart);
  const onSend = sendStart >= 0 && sendEnd > sendStart ? src.slice(sendStart, sendEnd) : "";
  check("onSend was found", onSend.length > 200);
  check("pressing send calls neither the builder nor the template adopt route",
    !/build\(/.test(onSend) && !/adoptTemplate\(/.test(onSend) && !/fetch\(/.test(onSend));
  check("...it puts the request on the table, which is what starts the free template search",
    /setRequestText\(trimmed\)/.test(onSend) && /\/api\/agents\/templates\?q=/.test(src));
  check("...and with an agent open it writes that agent's task or description, through PATCH",
    /fieldTarget === "task" \? \{ prompt: trimmed \} : \{ description: trimmed \}/.test(onSend) &&
      /method: "PATCH"/.test(src));
}
check("the two priced presses are the ones that carry a price",
  /onBuildNew=\{\(\) => build\(requestText, false\)\}/.test(src) &&
    /templates\.buildNew", \{ credits: buildCredits \}/.test(src) &&
    /templateCredits=\{templateCredits\}/.test(src));

console.log("\n== 3. the list is the shared [◧] column, not a grid of its own ==");
check("the column is rendered with this account's agents",
  /<ShellHistoryColumn\b/.test(src) && /rows=\{rows\}/.test(src) &&
    /const rows: ShellHistoryRow\[\] = agents\.map\(/.test(src));
check("each row carries its schedule and its status under the name",
  /status: `\$\{scheduleLabel\(agent\.schedule_cron\)\} · \$\{/.test(src));
check("rename and delete go through the agent's own routes",
  /onRename=\{async \(id, title\) => \{/.test(src) && /patchAgent\(agent, \{ name: title \}/.test(src) &&
    /onDelete=\{deleteAgent\}/.test(src) && /method: "DELETE"/.test(src));
// A GAIN, not a port: user_agents is already a linkable table
// (src/lib/projects/linkable-extras.ts), and the shared column draws the
// «Προσθήκη σε Project» button for any caller that names one.
check("...and every row gets Add to Project, because user_agents is linkable",
  /linkTable="user_agents"/.test(src) &&
    /table: "user_agents"/.test(readFileSync("src/lib/projects/linkable-extras.ts", "utf8")));
check("no second list UI survives beside it",
  !/<CardGrid\b|<EntityCard\b|<PaginationControls\b|<SortToggle\b|<ListLayout\b|<EmptyState\b/.test(src));

console.log("\n== 4. the plan boxes, and where each of the three states comes from ==");
// THE POPULATION IS THE DECLARED STEP LIST, not three boxes typed out.
// JOB_STEPS.agent_run is what the worker reports as it passes each step
// (src/lib/jobs/job-types.ts), so a fourth step added there appears here
// without this screen being touched — and a box that is not one of them
// cannot appear at all.
const jobTypes = stripComments(readFileSync("src/lib/jobs/job-types.ts", "utf8"));
check("the boxes range over JOB_STEPS.agent_run, the worker's own list",
  /JOB_STEPS\.agent_run\.map\(\(token\) => \(\{/.test(src) &&
    /agent_run: \["preparing", "working", "delivering"\]/.test(jobTypes));
check("each box's label is that step's existing message key, not a new string",
  /label: tSteps\(token as never\)/.test(src) &&
    /useTranslations\("aiSteps\.agent_run"\)/.test(src) &&
    LOCALES.every((l) => ["preparing", "working", "delivering"].every((s) => typeof messages[l].aiSteps.agent_run[s] === "string")));
check("each box's one line is derived from THIS agent's own config, not written per box",
  /preparing: searching \? t\("capability\.stepSearch"\) : t\("capability\.stepNoSearch"\)/.test(src) &&
    /working: t\("capability\.stepWrite"\)/.test(src) &&
    /delivering: t\("capability\.stepDeliver", \{/.test(src) &&
    /const searching = selected\.config\?\.needsWebSearch === true;/.test(src));
// THE THREE STATES. Done and Working are read off the timeline; Waiting
// is the absence of an entry. Stated as one function so there is one
// place the rule lives.
check("Done / Working / Waiting are derived from the run's timeline, in one function",
  /function planStepState\(token: string, timeline: ClientStep\[\] \| undefined, running: boolean\): StepState \{/.test(src) &&
    /if \(!entry\) return "waiting";/.test(src) &&
    /return entry\.seconds === null && running \? "working" : "done";/.test(src));
check("...and the boxes carry the state where a test can read it",
  /data-testid="agents-plan-box"/.test(src) && /data-state=\{state\}/.test(src) &&
    /data-testid="agents-plan-state"/.test(src));
// THE TIMELINE IS THIS AGENT'S OWN. Without the narrowing, a run started
// on one agent paints a second agent's boxes the moment it is opened.
check("a run's timeline is never read for another agent",
  /const ownRunJob = selected && runAgentId === selected\.id \? runJob : null;/.test(src) &&
    /state: planStepState\(token, ownRunJob\?\.timeline, runningNow\)/.test(src) &&
    /setRunAgentId\(agent\.id\);/.test(src));
check("...including a run resumed after a reload, whose agent the job row carries",
  /\(data\.job\.input as \{ agentId\?: unknown \} \| null\)\?\.agentId/.test(src) &&
    /input: depthOverride \? \{ agentId, depth: depthOverride \} : \{ agentId \}/.test(
      stripComments(readFileSync("src/app/api/agents/[id]/run/route.ts", "utf8"))
    ));
// AND THE DATA SOURCE, RUN RATHER THAN READ. `seconds === null` has to
// mean "still going" and a number has to arrive when it ends, or the
// Working box never becomes Done.
{
  const { loadTs } = await import("./load-ts.mjs");
  const tl = await loadTs("src/lib/jobs/job-timeline.ts");
  const entries = [
    { at: "2026-10-31T10:00:00.000Z", step: 1, label: "preparing", costUsd: 0, evidence: null },
    { at: "2026-10-31T10:00:20.000Z", step: 2, label: "working", costUsd: 0.01, evidence: null },
  ];
  const running = tl.timelineForClient(entries, { status: "running", creditsCharged: null, finishedAt: null, finalCostUsd: 0.01 });
  const done = tl.timelineForClient(entries, { status: "done", creditsCharged: 2, finishedAt: "2026-10-31T10:00:50.000Z", finalCostUsd: 0.02 });
  check("while it runs, the last step reports no seconds — which is what 'Working' reads",
    running.length === 2 && running[0].seconds === 20 && running[1].seconds === null,
    JSON.stringify(running.map((s) => s.seconds)));
  check("...and when it finishes, every step has its seconds — which is what 'Done' reads",
    done.length === 2 && done[0].seconds === 20 && done[1].seconds === 30,
    JSON.stringify(done.map((s) => s.seconds)));
  check("a step the worker never reached is simply absent, which is what 'Waiting' reads",
    !running.some((s) => s.label === "delivering") && !done.some((s) => s.label === "delivering"));
  check("the column it all comes out of is the one the migration adds",
    /add column if not exists timeline jsonb/.test(
      readFileSync("supabase/migrations/20261004200000_ai_jobs_timeline.sql", "utf8")
    ));
}
check("before any run, the screen says so in words rather than drawing a state it does not have",
  /\{!ownRunJob && <p className="mt-2 text-\[11px\] leading-relaxed text-muted">\{t\("shell\.noRunYet"\)\}<\/p>\}/.test(src));

console.log("\n== 5. the bar: status, Run now, ONE white button ==");
check("the status is the agent's own, and says Running while it runs",
  /data-testid="agents-bar-status"/.test(src) &&
    /\{runningNow && runAgentId === selected\.id\s*\?\s*t\("runRunning"\)/.test(src));
check("Run now resolves the tier through the shared helper",
  /data-testid="agents-run-now"/.test(src) &&
    /runNow\(selected, effectiveRunDepth\(selected, runOverride\)\)/.test(src));
// THE ONE WHITE BUTTON. `bg-button` exactly once in the whole file, and
// it is the pause/resume — the thing the screen is about. Run now beside
// it is a 44px icon action (ACTION), on purpose, so the count stays at
// one here and two on the page (the field's send is the other).
check("exactly one bg-button in the file, and it is Παύση/Συνέχιση",
  (src.match(/\bbg-button\b/g) ?? []).length === 1 &&
    /data-testid="agents-toggle"/.test(src) &&
    /\{selected\.status === "active" \? t\("menuPause"\) : t\("menuResume"\)\}/.test(src));
check("...and it really switches the schedule on and off",
  /patchAgent\(\s*selected,\s*\{ status: selected\.status === "active" \? "paused" : "active" \}/.test(src));
check("Run now is an icon action, not a second filled control",
  /data-testid="agents-run-now"[\s\S]{0,200}className=\{`\$\{ACTION\}/.test(src));

console.log("\n== 5b. the phone, where the work covers the field ==");
// THREE THINGS THAT ONLY GO WRONG BELOW `lg`, all three found by this
// piece's own prodtest on 2026-10-31 and none of them visible on a
// computer. ToolShell draws the work area `fixed inset-0 z-[60]` there.
check("the [◧] column opens beside the landing and stays a closed drawer over it",
  /const \[historyOpen, setHistoryOpen\] = useState\(false\);/.test(src) &&
    /if \(window\.matchMedia\("\(min-width: 768px\)"\)\.matches\) setHistoryOpen\(true\);/.test(src));
check("«back» closes the work and keeps the agent chosen, so the field can still reach it",
  /const work = selected && workOpen/.test(src) && /onCloseWork=\{hideWork\}/.test(src) &&
    /function hideWork\(\) \{\s*setWorkOpen\(false\);/.test(src));
// AND THE WIDTH. 280px of column plus 60% of work leaves about 200px for
// the conversation at 1440 — the width tool-shell.tsx records as the one
// that wrapped a heading to a letter per line. The column belongs to the
// landing and the width belongs to the work.
check("opening an agent puts the column away, and closing it brings the column back",
  /function showAgent\(id: string\) \{\s*setSelectedId\(id\);\s*setWorkOpen\(true\);\s*setHistoryOpen\(false\);\s*\}/.test(src) &&
    /if \(typeof window !== "undefined" && window\.matchMedia\("\(min-width: 768px\)"\)\.matches\) setHistoryOpen\(true\);/.test(src) &&
    /onOpen=\{\(id\) => showAgent\(id\)\}/.test(src));
check("...and the shell's own ChosenBox says which agent the next sentence lands on",
  /\{selected && !workOpen && \(\s*<ChosenBox label=\{selected\.name\} onClear=\{\(\) => setSelectedId\(null\)\} \/>\s*\)\}/.test(src));
check("the two columns are two scrollers on a computer and one page on a phone",
  /<div className="flex flex-col gap-4 lg:h-full lg:flex-row">/.test(src) &&
    /<div className="flex min-w-0 flex-1 flex-col gap-4 lg:overflow-y-auto">/.test(src) &&
    /<div className="w-full space-y-4 lg:w-72 lg:shrink-0 lg:overflow-y-auto" data-testid="agents-settings-panel">/.test(src));
check("...and the option under the field wraps inside itself, not only as a whole",
  /<span key="target" className="flex flex-wrap items-center gap-1\.5">/.test(src));
// THE BAR'S LABELS GO BEFORE THE TITLE DOES. Three labelled controls at
// 390px left the work title about twenty pixels of a `break-words` box,
// which broke it to one letter per line and pushed the bar 340px down.
check("the bar's two labels stand down below `sm`, and the press keeps its name",
  /<span className="hidden text-xs sm:inline">\{t\("menuRunNow"\)\}<\/span>/.test(src) &&
    /aria-label=\{t\("menuRunNow"\)\}/.test(src) &&
    /<span className="hidden sm:inline">\{selected\.status === "active" \? t\("menuPause"\) : t\("menuResume"\)\}<\/span>/.test(src) &&
    /aria-label=\{selected\.status === "active" \? t\("menuPause"\) : t\("menuResume"\)\}/.test(src));

console.log("\n== 6. the panel, in the order the directive asks for it ==");
const PANEL_ORDER = [
  ["name", /<p className="text-xs font-medium text-muted">\{t\("nameLabel"\)\}<\/p>/],
  ["email", /data-testid="agents-panel-email"/],
  ["tools and connections", /data-testid="agents-panel-tools"/],
  ["credits per run and per month", /data-testid="agents-panel-caps"/],
  ["schedule", /data-testid="agents-panel-schedule"/],
  ["approval rules", /data-testid="agents-panel-approvals"/],
];
{
  let cursor = -1;
  let inOrder = true;
  for (const [, re] of PANEL_ORDER) {
    const at = src.search(re);
    if (at < 0 || at < cursor) inOrder = false;
    cursor = at;
  }
  check(`all six rows are there, in the asked order (${PANEL_ORDER.map(([n]) => n).join(" → ")})`, inOrder);
}
// THE TWO ROWS THAT HAVE DATA are checked against what produces them.
check("the per-run figure is the server's own price for the chosen tier, not a number in this file",
  /const perRunCredits = editDraft \? \(depthFacts\[editDraft\.depth\]\?\.credits \?\? 0\) : 0;/.test(src) &&
    /depthPrices = agentRunEstimatesByDepth\(/.test(page));
check("the monthly figure is that price times how often THIS schedule fires",
  /const RUNS_PER_MONTH: Record<ScheduleParts\["frequency"\], number> = \{\s*hourly: 730,\s*daily: 30,\s*weekly: 4,\s*monthly: 1,\s*\};/.test(src) &&
    /const monthlyRuns = editDraft \? RUNS_PER_MONTH\[editDraft\.parts\.frequency\] : 0;/.test(src) &&
    /credits: perRunCredits \* monthlyRuns, runs: monthlyRuns/.test(src));
// THE FOUR HONEST GAPS. Each is a sentence, not a blank — and each says
// what IS true, not only what is missing.
const GAPS = [
  ["its own address", "shell.ownEmailNone", /data-testid="agents-panel-email"[\s\S]{0,400}t\("shell\.ownEmailNone"\)/],
  ["a per-agent tool allowlist", "shell.toolsNone", /data-testid="agents-panel-tools"[\s\S]{0,1400}t\("shell\.toolsNone"\)/],
  ["a credit limit that stops it", "shell.capNoHardStop", /data-testid="agents-panel-caps"[\s\S]{0,1600}t\("shell\.capNoHardStop", \{ max: AGENT_MAX_CONSECUTIVE_FAILURES \}\)/],
  ["approval rules", "shell.approvalsNone", /data-testid="agents-panel-approvals"[\s\S]{0,300}t\("shell\.approvalsNone"\)/],
];
for (const [what, key, re] of GAPS) {
  check(`the gap in ${what} is said, where it is missing`, re.test(src), key);
  const leaf = key.split(".").slice(1).join(".");
  const missing = notASentence(leaf);
  check(`...in all ten languages, as a real sentence (${key})`, missing.length === 0, missing.join(", "));
}
// THE PANEL IS WHERE THE SETTINGS LIVE NOW, so the four controls the edit
// form had must all be in it, and still write through the same PATCH.
check("the four settings controls are the SAME components, in the panel",
  /<ScheduleEditor parts=\{editDraft\.parts\}/.test(src) &&
    /<DeliveryPicker\s+value=\{editDraft\.deliveryMethod\}/.test(src) &&
    /<DepthPicker value=\{editDraft\.depth\}/.test(src) &&
    /<input type="checkbox" checked=\{editDraft\.needsWebSearch\}/.test(src));
check("...and Save sends all five fields together, as the route resolves them together",
  /scheduleCron: partsToCron\(editDraft\.parts\),[\s\S]{0,260}deliveryMethod: editDraft\.deliveryMethod,\s*deliveryTarget: editDraft\.deliveryTarget,/.test(src));

console.log("\n== 7. the Inbox tab: built, empty, and honest about which half is empty why ==");
check("there are two tabs and the Inbox is one of them",
  /role="tablist"/.test(src) && /data-testid="agents-tab-plan"/.test(src) && /data-testid="agents-tab-inbox"/.test(src));
check("the Inbox has both halves the directive names",
  /data-testid="agents-inbox"/.test(src) &&
    /t\("shell\.inboxReceived"\)/.test(src) && /t\("shell\.inboxApprovals"\)/.test(src));
check("...and each half says why it is empty, in its own words",
  /data-testid="agents-inbox-received-empty"[\s\S]{0,200}t\("shell\.inboxReceivedNone"\)/.test(src) &&
    /data-testid="agents-inbox-approvals-empty"[\s\S]{0,200}t\("shell\.inboxApprovalsNone"\)/.test(src));
{
  const thin = [...new Set(["inboxReceivedNone", "inboxApprovalsNone"].flatMap(notASentence))];
  check("...in all ten languages", thin.length === 0, thin.join(", "));
}

console.log("\n== 8. nothing the old screen could do stopped working ==");
// THE POPULATION IS THE OLD FILE'S OWN ROUTE LIST. This screen replaced a
// 1664-line component (git mv, same path history), and docs/TOOL-RULES.md
// §46-47 is explicit: when a tool moves to the new screen no function is
// lost. Every route it called is called here.
const ROUTES = [
  '"/api/agents/build"',
  '"/api/agents"',
  "`/api/agents/${agent.id}`",
  "`/api/agents/${agent.id}/run`",
  '"/api/agents/templates/adopt"',
  "`/api/agents/templates?q=${encodeURIComponent(q)}`",
  '"/api/jobs?kind=agent_build"',
  '"/api/jobs?kind=agent_run"',
];
const goneRoutes = ROUTES.filter((r) => !src.includes(r));
// THE COUNT GOES IN THE DETAIL, NOT THE NAME. With it in the name the
// line reads "(7/8)" when it is red, so a mutation suite expecting
// "(8/8)" finds no matching FAIL and reports a hole that is not one
// (found 2026-10-31, this suite's first run).
check(`every route the old screen called is still called (${ROUTES.length})`,
  goneRoutes.length === 0, goneRoutes.length ? `${goneRoutes.length} gone: ${goneRoutes.join(", ")}` : "");
// The four honesty surfaces the old screen carried, each in its new home.
check("what an agent can and cannot do is still shown, at the moment of the decision",
  /data-testid="agents-capability-box"/.test(src) &&
    /AGENT_CAN_IDS\.map\(/.test(src) && /AGENT_CANNOT_IDS\.map\(/.test(src));
check("the one honest line under the field is the same key the old chips drew",
  /data-testid="agents-limits"[\s\S]{0,120}tExamples\("limits"\)/.test(src) &&
    typeof messages.el.aiExamples.agents.limits === "string");
check("where the result goes is said before anything is built",
  /data-testid="agents-delivery-note"[\s\S]{0,140}t\("deliveryNote", \{ email: accountEmail \}\)/.test(src));
check("the AI disclosure and the record cap travel in from the page, and are drawn",
  /aiDisclosure=\{t\("aiDisclosure"\)\}/.test(page) && /cap=\{RECORD_CAP\}/.test(page) &&
    /data-testid="agents-ai-disclosure"/.test(src) && /<ListCappedNotice cap=\{cap\} \/>/.test(src));
check("the cap counts ACTIVE agents, as the server does, and is shown",
  /agents\.filter\(\(a\) => a\.status === "active"\)\.length/.test(src) &&
    /agentsUsed", \{ used: activeCount, cap: agentCap \}/.test(src) &&
    /atCapacity = activeCount >= agentCap/.test(src));
check("listening to a result is still offered, for the latest and for every past run",
  (src.match(/<VoicePlayer\b/g) ?? []).length === 2);
check("the mic is the shared field's, and this file no longer renders its own",
  !/<VoiceInput\b/.test(src) && /<VoiceInput\b/.test(readFileSync("src/components/chat/chat-composer.tsx", "utf8")));
check("both background jobs are still resumed on arrival, so closing the page is safe",
  /kind=agent_build/.test(src) && /kind=agent_run/.test(src) &&
    (src.match(/markJobConsumed\(/g) ?? []).length >= 3);
// ?agent=<…> CARRIES TWO MEANINGS AND ONE EFFECT DECIDES WHICH. They
// were two effects, and the arrival one ran first and deleted the
// parameter from the address bar (forgetExampleParam), so a link straight
// to an agent opened the landing with that agent's UUID sitting in the
// thread as though somebody had typed it. Both branches are asserted,
// inside one effect, because that is the thing that was wrong.
{
  const at = src.indexOf("const arrivedRef = useRef(false);");
  const end = src.indexOf("const selectedRuns", at);
  const arrival = at >= 0 && end > at ? src.slice(at, end) : "";
  check("one effect reads ?agent= and decides which of its two meanings it is",
    arrival.length > 200 &&
      /new URLSearchParams\(window\.location\.search\)\.get\("agent"\) \?\? initialAgent \?\? ""/.test(arrival) &&
      (arrival.match(/forgetExampleParam\("agent"\)/g) ?? []).length === 1);
  check("...an id of this account's own agents opens that agent",
    /agents\.some\(\(a\) => a\.id === requested\)\) \{\s*setSelectedId\(requested\);/.test(arrival));
  check("...anything else arrives as a request on the table, priced before it is built",
    /setRequestText\(requested\);/.test(arrival) && /role: "user", text: requested/.test(arrival) &&
      /initialAgent=\{readExampleParam\(searchParams\.agent\)\}/.test(page));
}

console.log("\n== 9. no route's English reaches the reader ==");
// tool-shell.test.mjs holds this over every tool in the shell; it is
// restated here because this screen is where the two gates disagreed
// (see scripts/tests/problem-messages.test.mjs) and the resolution is
// easy to undo by accident.
check("no toast repeats a route's or a job's own English",
  !/data\.error/.test(src) && !/result\.error \?\?/.test(src) && !/getErrorMessage\(/.test(src));
check("a limit is said with its own name and time, in the reader's language",
  (src.match(/limitText\(data\) \?\? t\(/g) ?? []).length >= 4);
check("a coded failure still gets its own notice", /problemCodeFrom\(data\)/.test(src) && /<ProblemNotice/.test(src));

console.log("\n== 10. every shell.* string exists, everywhere, and its placeholders are not escaped ==");
{
  const keys = Object.keys(agentsMessages("el").shell).sort();
  check(`the shell's own strings were found (${keys.length})`, keys.length >= 25, keys.join(", "));
  const missing = [];
  const escaped = [];
  for (const locale of LOCALES) {
    const shellKeys = agentsMessages(locale).shell ?? {};
    for (const key of keys) {
      const value = shellKeys[key];
      if (typeof value !== "string" || !value.trim()) missing.push(`${locale}.${key}`);
      // '{x}' is the literal text {x} in every language — the single
      // quote escapes the braces (CLAUDE.md, the ICU trap).
      else if (/'\{[a-zA-Z]+\}'/.test(value)) escaped.push(`${locale}.${key}`);
    }
    const extra = Object.keys(shellKeys).filter((k) => !keys.includes(k));
    if (extra.length) missing.push(`${locale}: extra ${extra.join(", ")}`);
  }
  check("every one resolves in all ten languages", missing.length === 0, missing.join(", "));
  check("...and no placeholder is quoted into literal text", escaped.length === 0, escaped.join(", "));
  // The three that carry a value have to carry it in every language, or
  // one locale prints a sentence with the number missing.
  const WITH_VALUES = { capPerMonthValue: ["credits", "runs"], capNoHardStop: ["max"] };
  const dropped = [];
  for (const [key, placeholders] of Object.entries(WITH_VALUES)) {
    for (const locale of LOCALES) {
      const value = agentsMessages(locale).shell[key] ?? "";
      for (const p of placeholders) if (!value.includes(`{${p}}`)) dropped.push(`${locale}.${key} lost {${p}}`);
    }
  }
  check("every placeholder survives every translation", dropped.length === 0, dropped.join(", "));
}

console.log(
  failures.length === 0
    ? `\nALL PASS: ${pass} passed, 0 failed`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`
);
process.exit(failures.length === 0 ? 0 : 1);
