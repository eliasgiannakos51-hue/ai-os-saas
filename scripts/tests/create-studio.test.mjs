// Reproduction test for Create Studio's preview numbers.
//
// The preview is the whole safety mechanism of the studio: it is what
// lets a user catch a wrong type guess BEFORE a website generation is
// charged. So the two numbers it shows have to be real — the credit
// figure has to come from the same estimator the creating route reserves
// against, and it has to actually change when the type changes. A preview
// that quotes the same number for a document and a website would be worse
// than no preview at all.
//
// Run: node scripts/tests/create-studio.test.mjs
import { loadTs } from "./load-ts.mjs";
import { readFileSync, existsSync } from "node:fs";

const plan = await loadTs("src/lib/create-studio/plan.ts");
const pricing = await loadTs("src/lib/billing/pricing-config.ts");
const estimate = await loadTs("src/lib/billing/estimate.ts");
const {
  CREATE_STUDIO_TYPES,
  isCreateStudioType,
  STUDIO_ACTION_PROFILE,
  estimateCreditsFor,
  timeBucketFor,
} = plan;
const { DEFAULTS } = pricing;
const { ACTION_PROFILES } = estimate;

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
function checkTrue(name, cond) {
  check(name, Boolean(cond), true);
}

console.log("== 1. the five types are the five real features ==");
check("types", [...CREATE_STUDIO_TYPES], [
  "website",
  "mission",
  "moduleEntry",
  "automation",
  "document",
  "agent",
]);

// THE LIST USED TO BE PINNED BY COUNT ALONE ("exactly five types"), and a
// count is the one thing that cannot catch what actually went wrong here.
//
// Autonomous Agents shipped as a full feature — its own page, its own
// build route, its own scheduler, its own delivery channels — and was
// never added to this list. Nothing failed. The detector has no "none"
// and must pick one of the kinds it is given, so "email me the Nvidia
// news every morning" was confidently classified as an "automation" and
// filed as a recurring workspace task. The user pressed Create, got a
// green tick, and owned something that could not deliver anywhere.
//
// A missing option in a forced-choice enum is not experienced as a
// missing option. It is a wrong answer given with full confidence, and
// the only guard that can see it is one that compares this list against
// the routes that really exist. Both directions are checked below,
// because the reverse — a type here with no route behind it — is how the
// list would come to promise something the product cannot do.
const CREATABLE = {
  website: "src/app/api/websites/generate/route.ts",
  mission: "src/app/api/mission/plan/route.ts",
  moduleEntry: "src/app/api/create/route.ts",
  automation: "src/app/api/automations/create/route.ts",
  document: "src/app/api/documents/route.ts",
  agent: "src/app/api/agents/build/route.ts",
};
for (const [type, route] of Object.entries(CREATABLE)) {
  check(`${type}: the route behind it exists`, existsSync(route), true);
  check(`${type}: is offered in Create Studio`, CREATE_STUDIO_TYPES.includes(type), true);
}
check(
  "no type is offered without a route behind it",
  CREATE_STUDIO_TYPES.filter((t) => !CREATABLE[t]),
  []
);
// The branch that runs it must exist too — a type in the enum with no
// case in the switch detects fine and then silently does nothing.
const studioHook = readFileSync("src/lib/create-studio/use-create-studio.ts", "utf8");
for (const type of CREATE_STUDIO_TYPES) {
  check(`${type}: has a branch that creates it`, studioHook.includes(`case "${type}":`), true);
}
// ...and it must go through the feature's OWN route, not a second copy of
// the plan cap, the credit reservation and the rate limit.
check(
  "the agent branch calls the real build route",
  /startAndWatchJob\("\/api\/agents\/build"/.test(studioHook),
  true
);
check("guard accepts a real type", isCreateStudioType("website"), true);
check("guard rejects an invented type", isCreateStudioType("presentation"), false);
check("guard rejects non-strings", isCreateStudioType(null), false);

console.log("\n== 2. every type maps to a profile the estimator knows ==");
for (const type of CREATE_STUDIO_TYPES) {
  const key = STUDIO_ACTION_PROFILE[type];
  if (key === null) {
    // A null profile is a claim: this action makes no AI call at all.
    check(`${type} maps to no AI call`, key, null);
  } else {
    checkTrue(`${type} -> ${key} exists in ACTION_PROFILES`, key in ACTION_PROFILES);
  }
}

console.log("\n== 3. the credit estimate actually differs per type ==");
const chars = 120;
const credits = Object.fromEntries(
  CREATE_STUDIO_TYPES.map((t) => [t, estimateCreditsFor(t, chars, DEFAULTS)])
);
console.log("        " + JSON.stringify(credits));
check("a document costs nothing (no AI call)", credits.document, 0);
checkTrue("a website costs more than a module entry", credits.website > credits.moduleEntry);
checkTrue("a mission costs more than nothing", credits.mission > 0);
checkTrue("an automation costs more than nothing", credits.automation > 0);
checkTrue(
  "an automation is cheaper than a website",
  credits.automation < credits.website
);

console.log("\n== 4. a bigger request estimates higher (never a flat fee) ==");
const small = estimateCreditsFor("website", 100, DEFAULTS);
const large = estimateCreditsFor("website", 6000, DEFAULTS);
checkTrue(`website: ${small} credits at 100 chars < ${large} at 6000`, large > small);
const smallEntry = estimateCreditsFor("moduleEntry", 100, DEFAULTS);
const largeEntry = estimateCreditsFor("moduleEntry", 6000, DEFAULTS);
checkTrue(`entry: ${smallEntry} < ${largeEntry}`, largeEntry > smallEntry);

console.log("\n== 5. the account's own credit rate is respected ==");
// Settlement divides the real cost by what a credit is worth on THIS
// account, so the preview has to as well — a cheaper credit means MORE
// credits for the same work. Quoting the list price to an Ultimate user
// is exactly the bug this mirrors from the Website Builder's estimate.
const atListPrice = estimateCreditsFor("website", 500, DEFAULTS);
const atHalfPrice = estimateCreditsFor("website", 500, DEFAULTS, DEFAULTS.creditPriceEur / 2);
checkTrue(
  `half-price credits quote more of them (${atListPrice} -> ${atHalfPrice})`,
  atHalfPrice > atListPrice
);

console.log("\n== 6. time buckets are coarse, real and ordered ==");
check("a document is instant (nothing runs)", timeBucketFor("document", 500), "instant");
check("a website is the slow bucket", timeBucketFor("website", 500), "manyMinutes");
const BUCKETS = ["instant", "seconds", "aMinute", "fewMinutes", "manyMinutes"];
for (const type of CREATE_STUDIO_TYPES) {
  checkTrue(
    `${type} reports a known bucket`,
    BUCKETS.includes(timeBucketFor(type, 500))
  );
}
// A longer request can only ever move the bucket later, never earlier.
const order = (b) => BUCKETS.indexOf(b);
checkTrue(
  "a longer mission never estimates as faster",
  order(timeBucketFor("mission", 8000)) >= order(timeBucketFor("mission", 50))
);

console.log("\n== 7. the detect route is guarded like every other AI route ==");
// Read as source rather than executed: the route pulls in next/server and
// the Anthropic SDK, which this dependency-free harness deliberately
// cannot load. What matters here is that none of the four guards was
// forgotten, and that is visible in the source.
const route = readFileSync("src/app/api/create-studio/detect/route.ts", "utf8");
checkTrue("rejects unauthenticated callers", route.includes('{ ok: false, error: "Not authenticated." }, { status: 401 }'));
checkTrue("rate limited per user", route.includes("checkRateLimit("));
checkTrue("goes through the AI circuit breaker", route.includes("checkAiCallAllowed("));
checkTrue("reserves credits before the call", route.includes("reserveCredits("));
checkTrue("settles against measured usage", route.includes("settleReservation("));
checkTrue("releases the hold when the call fails", route.includes("releaseReservation("));
checkTrue("caps the request length", route.includes("MAX_REQUEST_LENGTH"));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
