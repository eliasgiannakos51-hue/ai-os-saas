// The first 60 seconds (V3): action-first onboarding.
//
// The behaviour under test is deliberately pure data
// (lib/onboarding-flow.ts): which four doors exist, where each one
// lands, which ones complete the flow, and where a refresh resumes.
// Testing it as functions is what lets the flow's routing decisions
// fail a build instead of failing a new user.
//
// The rest of this file is source-level: the flow component must
// actually use those functions (a lib nobody calls tests nothing), the
// progress route must allowlist the action rather than store client
// strings, the destinations must hold up their end ("with the input
// ready"), and the two DON'Ts of the spec — no plans in the welcome, no
// auto-shown feature tour — must be checkable in the code.
//
// Run: node scripts/tests/first-60-seconds.test.mjs
import { readFileSync } from "node:fs";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail) console.log(`        ${detail}`);
}

const { loadTs } = await import("./load-ts.mjs");
const flow = await loadTs("src/lib/onboarding-flow.ts");

console.log("== 1. the four doors ==");
check("exactly four actions", flow.FIRST_ACTIONS.length, 4);
check("in the spec's order", [...flow.FIRST_ACTIONS], ["website", "mission", "data", "chat"]);

console.log("\n== 2. each door lands somewhere real ==");
check("website -> the builder, with the example brief", flow.firstActionDestination("website"), "/dashboard/website-builder?example=1");
check("mission -> Mission Control", flow.firstActionDestination("mission"), "/dashboard/mission");
check("chat -> Chat", flow.firstActionDestination("chat"), "/dashboard/chat");
check("data stays in the flow", flow.firstActionDestination("data"), null);

console.log("\n== 3. leaving completes; staying doesn't ==");
check("website completes", flow.firstActionCompletes("website"), true);
check("mission completes", flow.firstActionCompletes("mission"), true);
check("chat completes", flow.firstActionCompletes("chat"), true);
// The data door still has an import ahead of it — completing on click
// would mark an account done before it decided anything.
check("data does NOT complete on click", flow.firstActionCompletes("data"), false);

console.log("\n== 4. the allowlist ==");
for (const a of flow.FIRST_ACTIONS) check(`${a} is a first action`, flow.isFirstAction(a), true);
check("free text is not", flow.isFirstAction("drop table"), false);
check("null is not", flow.isFirstAction(null), false);
check("an object is not", flow.isFirstAction({}), false);

console.log("\n== 5. where a refresh resumes ==");
// Fresh account: the question.
check("no row -> the action question", flow.resolveInitialStep({ firstAction: null, goal: null }), "action");
// Mid-import refresh: back to where they were, not the start. This is
// the double-show bug's other half — restarting from the first question
// on F5.
check("data chosen, no goal yet -> goal step", flow.resolveInitialStep({ firstAction: "data", goal: null }), "goal");
check("data + goal recorded -> source step", flow.resolveInitialStep({ firstAction: "data", goal: "trading" }), "source");
// A row carrying website/mission/chat is completed in the same write, so
// the page redirects before this runs — but if one ever arrives here
// (the completed write failed), re-asking is the safe answer.
check("a click-through action re-asks, never traps", flow.resolveInitialStep({ firstAction: "website", goal: null }), "action");
check("garbage re-asks", flow.resolveInitialStep({ firstAction: "??", goal: null }), "action");

console.log("\n== 6. the component actually uses this ==");
const component = readFileSync("src/components/onboarding/onboarding-flow.tsx", "utf8");
checkTrue("renders the doors from FIRST_ACTIONS", /FIRST_ACTIONS\.map/.test(component));
checkTrue("routes through firstActionDestination", component.includes("firstActionDestination(action)"));
checkTrue("completes through firstActionCompletes", component.includes("firstActionCompletes(action)"));
checkTrue(
  "the action write is AWAITED before navigation",
  /await saveProgress\(\{ firstAction: action, completed: firstActionCompletes\(action\) \}\);\s*\n\s*router\.push\(destination\)/.test(component)
);
checkTrue("skip is rendered outside the step branches (every step)", /step !== "insights" && \(/.test(component));

const page = readFileSync("src/app/onboarding/page.tsx", "utf8");
checkTrue("the page resumes via resolveInitialStep", page.includes("resolveInitialStep({"));
checkTrue("...from the recorded row", page.includes('select("goal, first_action, completed_at, skipped_at")'));
checkTrue(
  "a completed account is redirected away from /onboarding (direct URL included)",
  /if \(state\?\.completed_at \|\| state\?\.skipped_at\) \{\s*\n\s*redirect\("\/dashboard\/overview"\)/.test(page)
);

console.log("\n== 6b. the race a new account can win ==");
// A user can reach /onboarding BEFORE their user_credits row or
// subscription_tier exists (an OAuth bootstrap that failed, a signup
// grant still in flight). The page must not care — so it must not read
// either. What it does read (user_onboarding) tolerates absence by
// construction: maybeSingle, and claim_activation_run inserts the row
// itself. The credit-consuming routes behind the data door create the
// credits row lazily (getOrInitCredits) and default a missing tier to
// free (resolveEffectivePlan) — both already under test elsewhere.
checkTrue("the onboarding page never reads user_credits", !page.includes("user_credits"));
checkTrue("...or the subscription tier", !page.includes("subscription_tier"));
checkTrue("...and the flow component makes no credit calls", !component.includes("useCredits"));
checkTrue("the row read tolerates a missing row", page.includes(".maybeSingle()"));

console.log("\n== 7. the progress route stores the allowlist, not the client's string ==");
const route = readFileSync("src/app/api/onboarding/route.ts", "utf8");
checkTrue("firstAction is validated with isFirstAction", route.includes("isFirstAction(body?.firstAction)"));
checkTrue("the DB flag is server-side, not localStorage", !component.includes("localStorage"));

console.log("\n== 8. the doors keep their promise: input ready on arrival ==");
const builderPage = readFileSync("src/app/dashboard/website-builder/page.tsx", "utf8");
checkTrue("?example=1 pre-fills the builder brief", builderPage.includes('searchParams.example === "1"'));
const workspace = readFileSync("src/components/website-builder/website-builder-workspace.tsx", "utf8");
checkTrue("the pre-filled draft seeds the form fields", workspace.includes("initialDraft?.name") && workspace.includes("initialDraft?.description"));
checkTrue("...and opens the form", workspace.includes("|| Boolean(initialDraft)"));
const missionForm = readFileSync("src/components/mission/mission-form.tsx", "utf8");
checkTrue("the mission goal box focuses itself", /autoFocus/.test(missionForm));
const chat = readFileSync("src/components/chat/chat-workspace.tsx", "utf8");
checkTrue("the chat composer focuses itself", /autoFocus/.test(chat));

console.log("\n== 9. what must NOT be in the welcome ==");
// No plans, no prices. Plans appear at limit moments (upgrade triggers,
// Task 9) — the first screen selling is the exact anti-pattern.
checkTrue("no plan/pricing imports in the flow", !/billing\/plans|\bPLANS\b|SubscribeButton/.test(component));
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const onboardingCopy = JSON.stringify(en.dashboard.onboarding).toLowerCase();
// Currency and selling words. NOT "/month" — the date-order copy
// legitimately says "day/month".
checkTrue("no plan-selling copy in the flow's strings", !/upgrade|per month|€|\$|price/.test(onboardingCopy));

console.log("\n== 10. the capability tour exists — and is never pushed ==");
const tour = readFileSync("src/app/dashboard/tour/page.tsx", "utf8");
checkTrue("the tour page exists with six sections", (tour.match(/key: "/g) ?? []).length === 6);
// Code-level: no billing imports. Copy-level: no currency in any tour
// string. (The page's own comment SAYS "no pricing", so grepping the
// source for the word would fail on the rule stating itself.)
checkTrue("no billing imports on the tour", !/billing\/plans|\bPLANS\b|SubscribeButton/.test(tour));
const tourCopy = JSON.stringify(en.dashboard.tour).toLowerCase();
checkTrue("no selling copy in the tour's strings", !/upgrade|per month|€|\$|price/.test(tourCopy));
const nav = readFileSync("src/lib/sidebar-nav.ts", "utf8");
checkTrue("reachable from the sidebar", nav.includes('"/dashboard/tour"'));
// Nothing may auto-navigate to it: the overview's only onboarding
// redirect goes to /onboarding, and no component pushes /dashboard/tour.
const overview = readFileSync("src/app/dashboard/overview/page.tsx", "utf8");
checkTrue("the overview never redirects to the tour", !overview.includes("/dashboard/tour"));
checkTrue("the flow never routes to the tour", !component.includes("/dashboard/tour"));

console.log("\n== 11. every new string exists in every locale ==");
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const NEW_KEY_PATHS = [
  ["dashboard", "onboarding", "welcomeIntro"],
  ["dashboard", "onboarding", "actionTitle"],
  ...["website", "mission", "data", "chat"].flatMap((a) => [
    ["dashboard", "onboarding", "actions", a, "title"],
    ["dashboard", "onboarding", "actions", a, "hint"],
  ]),
  ["dashboard", "websiteBuilder", "exampleName"],
  ["dashboard", "websiteBuilder", "exampleDescription"],
  ["dashboard", "tour", "title"],
  ["dashboard", "tour", "description"],
  ["dashboard", "tour", "tryIt"],
  ...["website", "mission", "chat", "data", "presentations", "agents"].flatMap((s) => [
    ["dashboard", "tour", "sections", s, "title"],
    ["dashboard", "tour", "sections", s, "description"],
  ]),
  ["sidebar", "items", "tour"],
  ["sidebar", "hints", "tour"],
];
for (const locale of LOCALES) {
  const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  const missing = NEW_KEY_PATHS.filter((path) => {
    let node = messages;
    for (const part of path) node = node?.[part];
    return typeof node !== "string" || node.length === 0;
  }).map((p) => p.join("."));
  check(`${locale}: all ${NEW_KEY_PATHS.length} new keys present`, missing, []);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
