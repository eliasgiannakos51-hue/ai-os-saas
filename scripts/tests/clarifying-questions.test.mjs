// "The clarifying questions exist in the response and never fire."
//
// THE DIAGNOSIS, and it was not the plumbing. Every link in the chain was
// already connected: the agents workspace sends skipClarification: false,
// the route stores it, the worker calls checkNeedsClarification, the
// result carries needsClarification/questions, and the workspace renders
// ClarificationQuestions when it sees them. Nothing was disconnected.
//
// What stopped it was the TEXT the model was given. The `agent` system
// prompt permitted exactly one trigger — "the request names no subject" —
// and explicitly BANNED asking how often the agent should run, justifying
// the ban with "those are separate fields the user picks directly".
//
// That justification is true of Automations and false of Agents. There is
// no schedule field in the agent create flow: the create panel is one
// textarea and a button, the cron is INFERRED by the builder from the same
// sentence, and the ScheduleEditor only appears when editing an agent that
// already exists. So the single detail most likely to be missing was the
// one detail the check was forbidden to ask about — and with the shared
// header saying "default to false when in doubt", a check with one
// permitted trigger and a bias toward silence is a check that is silent.
//
// The other three things that decide what a scheduled agent produces on
// EVERY run — the shape of the result, where the information comes from,
// and what to do on a day with nothing to report — were not mentioned at
// all.
//
// Run: node scripts/tests/clarifying-questions.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";

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
function eq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const { loadTs } = await import("./load-ts.mjs");
const c = await loadTs("src/lib/clarification-client.ts");

const lib = readFileSync("src/lib/clarification.ts", "utf8");
const ui = readFileSync("src/components/clarification/clarification-questions.tsx", "utf8");
const buildRoute = readFileSync("src/app/api/agents/build/route.ts", "utf8");
const buildHandler = readFileSync("src/lib/jobs/handlers/agent-build.ts", "utf8");
const agentsUi = readFileSync("src/components/agents/agents-workspace.tsx", "utf8");

// The `agent` prompt, isolated so assertions about it cannot be satisfied
// by text belonging to one of the other four kinds.
const agentPrompt = (() => {
  const start = lib.indexOf("  agent: `");
  const end = lib.indexOf("`,", start);
  return start === -1 ? "" : lib.slice(start, end);
})();

// ---------------------------------------------------------------------
console.log("== 1. (α) the prompt no longer forbids the thing most often missing ==");
check("the agent prompt exists and was found", agentPrompt.length > 200);
// The exact sentence that made this dead code, gone.
check(
  "the ban on asking how often it should run is gone",
  !/Do NOT ask about how often it should run/.test(agentPrompt),
  "this single sentence is why the check never fired for an agent"
);
check(
  "and the false justification with it",
  !/separate fields the user picks directly/.test(agentPrompt)
);
// The claim that justification rested on, checked against the actual UI:
// there is no schedule input in the create flow.
check(
  "the create panel really has no schedule field (only the request textarea)",
  /id="agent-request"/.test(agentsUi) && !/ScheduleEditor[\s\S]{0,200}creating/.test(agentsUi)
);
check(
  "the cron is inferred by the builder from the same sentence",
  /scheduleCron/.test(readFileSync("src/lib/agents/agent-builder.ts", "utf8"))
);

console.log("\n== 2. (β) it fires on the four gaps that change every run ==");
for (const [label, pattern] of [
  ["subject", /SUBJECT/],
  ["how often", /HOW OFTEN/],
  ["what the result should look like", /WHAT THE RESULT SHOULD LOOK LIKE/],
  ["where the information comes from", /WHERE THE INFORMATION SHOULD COME FROM/],
  ["what to do when there is nothing", /WHAT TO DO WHEN THERE IS NOTHING TO REPORT/],
]) {
  check(`the prompt names ${label}`, pattern.test(agentPrompt));
}
// Still refused, and for a reason that IS true: the address is the
// account's own email, fixed by the route and shown before the press.
check("it still never asks where the result is delivered", /NEVER ask where the result is delivered/.test(agentPrompt));
check(
  "and that is true — the route fixes delivery to the account email",
  /normaliseDeliveryTarget\(user\.email\)/.test(buildRoute)
);
check("the UI states that address before anything is built", /deliveryNote", \{ email/.test(agentsUi));
// Asking about a cadence the user already gave would be noise.
check("a request that already implies a cadence is not asked about it", /Do NOT ask when the request already implies one/.test(agentPrompt));
check("an already-complete request is still left alone", /already good enough — ask nothing/.test(agentPrompt));

console.log("\n== 3. (γ) at most three, with answers to tap, and Skip always ==");
eq("the ceiling is three", c.MAX_CLARIFICATION_QUESTIONS, 3);
const four = c.parseClarificationResult({
  needsClarification: true,
  questions: [
    { question: "One?", suggestions: ["a"] },
    { question: "Two?", suggestions: ["b"] },
    { question: "Three?", suggestions: ["c"] },
    { question: "Four?", suggestions: ["d"] },
  ],
});
eq("a fourth question is dropped", four.questions.length, 3);
eq("and its suggestions with it", four.suggestions.length, 3);
check("the tool schema asks the model for suggestions", /suggestions: \{[\s\S]{0,400}2-4 SHORT/.test(lib));
check("and requires them alongside the question", /required: \["question", "suggestions"\]/.test(lib));
check("the UI renders them as buttons", /aria-pressed=\{chosen\}/.test(ui));
check("clicking one fills that answer", /setAnswer\(index, chosen \? "" : option\)/.test(ui));
check("and clicking it again clears it", /Pressing the chosen one again clears it/.test(ui));
check("Skip is rendered unconditionally, never behind a condition", /ALWAYS PRESENT, never conditional/.test(ui));
check(
  "...and really is outside every conditional in the JSX",
  (() => {
    // The Skip button sits in the same flat button row as Continue: if it
    // were inside a `{cond && (` it would have a `&&` between the row's
    // opening div and itself.
    const row = ui.slice(ui.indexOf('<div className="flex flex-wrap gap-2">'), ui.lastIndexOf("</div>"));
    return row.includes("onClick={onSkip}") && !/&&/.test(row);
  })()
);

console.log("\n== 3b. the parser, over the shapes it can actually receive ==");
// Both wire shapes, because a job that finished BEFORE this deploy carries
// the old one — and a finished-but-unseen job is offered back to the user
// for 24 hours (lib/jobs/resumable.ts), so the old shape can still arrive
// at a screen running the new code.
const legacy = c.parseClarificationResult({ needsClarification: true, questions: ["Which market?"] });
eq("a bare string question is still accepted", legacy.questions, ["Which market?"]);
eq("with an empty suggestion slot, not a missing one", legacy.suggestions, [[]]);
const mixed = c.parseClarificationResult({
  needsClarification: true,
  questions: ["Plain?", { question: "Rich?", suggestions: ["daily", "weekly"] }],
});
eq("the two shapes can be mixed", mixed.questions, ["Plain?", "Rich?"]);
eq("and stay aligned by index", mixed.suggestions, [[], ["daily", "weekly"]]);
const messy = c.parseClarificationResult({
  needsClarification: true,
  questions: [
    { question: "  Padded?  ", suggestions: ["  daily  ", "daily", "", null, 7, "weekly", "monthly", "yearly", "never"] },
    { question: "   ", suggestions: ["dropped"] },
    { question: "Kept?", suggestions: "not-an-array" },
  ],
});
eq("blank questions are dropped", messy.questions, ["Padded?", "Kept?"]);
eq(
  "suggestions are trimmed, de-duplicated, non-strings removed, capped at four",
  messy.suggestions[0],
  ["daily", "weekly", "monthly", "yearly"]
);
eq("a non-array suggestions field degrades to none", messy.suggestions[1], []);
eq("no questions at all is treated as 'no clarification needed'", c.parseClarificationResult({ needsClarification: true, questions: [] }).needsClarification, false);
eq("and so is a verdict of false", c.parseClarificationResult({ needsClarification: false, questions: [{ question: "x", suggestions: [] }] }).needsClarification, false);
eq("a missing verdict is false", c.parseClarificationResult({}).needsClarification, false);
// A truthy-but-not-true verdict must not open the gate.
eq('the verdict must be exactly true, not "true"', c.parseClarificationResult({ needsClarification: "true", questions: ["x"] }).needsClarification, false);
// A very long question would blow the layout rather than being read.
const long = c.parseClarificationResult({
  needsClarification: true,
  questions: [{ question: "x".repeat(400), suggestions: ["y".repeat(200)] }],
});
check("an over-long question is truncated, not rendered whole", long.questions[0].length <= 200);
check("and an over-long suggestion too", long.suggestions[0][0].length <= 60);

console.log("\n== 3c. alignSuggestions never mis-attributes an answer ==");
// The failure this exists to prevent: question 2's options rendered under
// question 1, which reads as the model having lost track of the question.
eq("a short array is padded, not shifted", c.alignSuggestions(["a", "b", "c"], [["1"]]), [["1"], [], []]);
eq("a long one is cut to the questions", c.alignSuggestions(["a"], [["1"], ["2"]]), [["1"]]);
eq("undefined is all-empty", c.alignSuggestions(["a", "b"], undefined), [[], []]);
eq("a non-array entry is empty, not a crash", c.alignSuggestions(["a", "b"], ["nope", ["ok"]]), [[], ["ok"]]);
eq("no questions is no suggestions", c.alignSuggestions([], [["1"]]), []);

console.log("\n== 4. (δ) it cannot ask what the app already knows ==");
check("the prompt carries an 'already known' section", /ALREADY KNOWN ABOUT THIS USER/.test(lib));
check("and is told to drop questions it answers", /do NOT ask about anything this already answers/.test(lib));
check("the check accepts that context", /knownContext\?: string \| null/.test(lib));
check("the agent build passes it through", /ctx\.input\.knownContext/.test(buildHandler));
check("the route captures it from the AI Life Context", /getUserFullContext\(supabase, user\.id\)/.test(buildRoute));
// THE SECURITY POINT, and it is not a small one. getUserFullContext runs
// `.from("ai_missions").select("*")` with no user_id filter and relies
// entirely on RLS. Called with the worker's service-role client it would
// return EVERY user's missions and fold them into this user's prompt.
const contextLib = readFileSync("src/lib/user-context.ts", "utf8");
check(
  "getUserFullContext really does rely on RLS for missions",
  /from\("ai_missions"\)\.select\("\*"\)/.test(contextLib)
);
check(
  "so it is called with the USER's client, never the admin one",
  /getUserFullContext\(supabase,/.test(buildRoute) && !/createAdminClient/.test(buildRoute)
);
// Comments stripped first: agent-build.ts documents WHY it must not make
// this call, and a scanner that flags its own explanation is a scanner
// people delete the explanation to satisfy.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
check("and never from the worker, which holds service-role", !/getUserFullContext/.test(stripComments(buildHandler)));
// ~15 queries is not something to run when nothing will read the result.
check("it is only fetched when the check will actually run", /if \(!skipClarification\) \{[\s\S]{0,200}getUserFullContext/.test(buildRoute));
check("and a failure there does not block the build", /catch \(err\) \{[\s\S]{0,120}stage: "user_context"/.test(buildRoute));

console.log("\n== 5. every screen that asks offers the answers ==");
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = `${dir}/${entry}`;
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const renderers = walk("src")
  .filter((f) => !f.endsWith("clarification-questions.tsx"))
  .filter((f) => readFileSync(f, "utf8").includes("<ClarificationQuestions"));
check(`all ${renderers.length} screens render the shared component`, renderers.length === 4, renderers.join(", "));
for (const file of renderers) {
  const src = readFileSync(file, "utf8");
  check(`${file.split("/").pop()} passes the tappable answers`, /suggestions=\{/.test(src));
}
// And every producer sends them.
for (const file of [
  "src/lib/jobs/handlers/agent-build.ts",
  "src/lib/jobs/handlers/create.ts",
  "src/app/api/websites/generate/route.ts",
  "src/app/api/automations/create/route.ts",
]) {
  check(`${file.split("/").pop()} returns them`, /questionSuggestions/.test(readFileSync(file, "utf8")));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
