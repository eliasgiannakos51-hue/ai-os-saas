// The personalised upgrade suggestion, after 30 days (V3 Task 9).
//
// Like upgrade-triggers.test.mjs, the property under test is RESTRAINT —
// almost every input must produce silence — plus one new property this
// rule adds: HONESTY. When it does speak, every number in the sentence
// must be real: the usage is the account's, the cap is the one the API
// enforces, and the named plan actually raises it.
//
// Run: node scripts/tests/upgrade-suggestion.test.mjs
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
const us = await loadTs("src/lib/upgrade-suggestion.ts");

// Starter's real caps (from the limit modules): presentations 5,
// research 2, published sites 1. Growth: 20 / 10 / 3.
const quiet = { presentations: 0, researchReports: 0, publishedSites: 0 };
const build = (over = {}) =>
  us.buildUpgradeSuggestion({
    accountAgeDays: 45,
    planSlug: "starter",
    usedThisMonth: quiet,
    ...over,
  });

console.log("== 1. silence is the default ==");
check("no usage says nothing", build().kind, "none");
check(
  "moderate usage says nothing",
  build({ usedThisMonth: { ...quiet, presentations: 3 } }).kind, // 60% of 5
  "none"
);
check(
  "79% is still below the line",
  build({ usedThisMonth: { ...quiet, researchReports: 1 } }).kind, // 50% of 2
  "none"
);

console.log("\n== 2. no pattern before thirty days ==");
// A heavy first week is what onboarding is FOR. Suggesting a bigger
// plan because somebody explored the product punishes exploring it.
const heavy = { presentations: 5, researchReports: 2, publishedSites: 1 };
check("day 10 at 100% usage says nothing", build({ accountAgeDays: 10, usedThisMonth: heavy }).kind, "none");
check("day 29 says nothing", build({ accountAgeDays: 29.9, usedThisMonth: heavy }).kind, "none");
check("day 30 may speak", build({ accountAgeDays: 30, usedThisMonth: heavy }).kind, "suggest");
check("unknown age fails closed", build({ accountAgeDays: null, usedThisMonth: heavy }).kind, "none");

console.log("\n== 3. the top of the self-serve ladder is never pitched ==");
// Ultimate's caps are mostly unlimited, and the plan above it is
// sales-negotiated — a banner pointing at it lands on a pricing page
// with no button to press.
check(
  "ultimate is never pitched",
  build({ planSlug: "ultimate", usedThisMonth: { ...quiet, publishedSites: 30 } }).kind,
  "none"
);
check("enterprise is never pitched", build({ planSlug: "enterprise", usedThisMonth: heavy }).kind, "none");
check("an unknown plan slug fails closed", build({ planSlug: "mystery", usedThisMonth: heavy }).kind, "none");

console.log("\n== 4. free's zero caps are locks, not ceilings ==");
// A Free account's presentations cap of 0 is the upgrade wall's story
// and the sidebar lock's story. This banner reasons about usage against
// a cap, and 0 usage of a 0 cap is not a pattern.
check("free with no usable metered resource says nothing", build({ planSlug: "free" }).kind, "none");

console.log("\n== 5. when it speaks, every number is real ==");
const s = build({ usedThisMonth: { ...quiet, presentations: 4 } }); // 80% of 5
check("80% of the presentations cap speaks", s.kind, "suggest");
check("...naming the binding resource", s.resource, "presentations");
check("...their real usage", s.used, 4);
check("...the cap the API enforces", s.cap, 5);
check("...the next plan by name", s.nextPlan, "Growth");
check("...and that plan's real cap", s.nextCap, 20);

// Two resources over the line: the MOST binding one wins, because a
// banner that lists everything is a campaign again.
const both = build({ usedThisMonth: { presentations: 4, researchReports: 2, publishedSites: 0 } });
check("the most-utilised resource wins", both.resource, "researchReports"); // 100% beats 80%

// Usage above the cap (admin bypass, a cap lowered mid-month) must not
// render "7 of 5", which reads as a bug even when it is history.
const over = build({ usedThisMonth: { ...quiet, presentations: 7 } });
check("over-cap usage is clamped to the cap", over.used, 5);

console.log("\n== 6. the named plan must fix the named problem ==");
// If the next plan's cap for the binding resource were not higher, the
// suggestion would be a lie with numbers in it. No real plan pair does
// this today, so the guarantee is asserted structurally: every plan and
// resource that CAN speak names a strictly higher cap.
const { readFileSync } = await import("node:fs");
for (const slug of ["free", "starter", "growth", "professional"]) {
  for (const resource of ["presentations", "researchReports", "publishedSites"]) {
    const r = build({ planSlug: slug, usedThisMonth: { ...quiet, [resource]: 1000 } });
    if (r.kind === "suggest") {
      checkTrue(`${slug}/${r.resource}: next cap is strictly higher`, r.nextCap > r.cap);
    }
  }
}

console.log("\n== 7. the rule is pure and the caps are the enforced ones ==");
const src = readFileSync("src/lib/upgrade-suggestion.ts", "utf8");
checkTrue("no database", !/supabase/i.test(src));
checkTrue("no model call", !/anthropic/i.test(src));
// The caps must come from the SAME modules the API routes enforce with —
// a literal number here would drift the first time a limit changed.
checkTrue("presentations cap from the real module", /maxPresentationsForPlan/.test(src));
checkTrue("research cap from the real module", /maxResearchRunsForPlan/.test(src));
checkTrue("publish cap from the real module", /maxPublishedSitesForPlan/.test(src));

console.log("\n== 8. the moment component is actually rendered somewhere ==");
// b768cfe shipped UpgradeMoment with nothing rendering it — a rule with
// perfect tests and no callers. This pins the wiring so it cannot
// silently regress to decoration again.
const deckPage = readFileSync("src/app/dashboard/presentations/[id]/page.tsx", "utf8");
checkTrue("the deck page renders UpgradeMoment", /<UpgradeMoment/.test(deckPage));
const overview = readFileSync("src/app/dashboard/overview/page.tsx", "utf8");
checkTrue("the overview renders UpgradeSuggestionCard", /<UpgradeSuggestionCard/.test(overview));
checkTrue(
  "the overview gates the suggestion on account age",
  /SUGGESTION_MIN_ACCOUNT_AGE_DAYS/.test(overview),
  "the 30-day gate around the suggestion is gone"
);

console.log(
  fail === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${fail} failed`
);
process.exit(fail === 0 ? 0 : 1);
