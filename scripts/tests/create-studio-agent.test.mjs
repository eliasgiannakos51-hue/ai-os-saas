// Create Studio can make an AGENT — and cannot silently gain a kind it
// does not know how to make.
//
// WHAT WAS REPORTED: "Create Studio δεν μπορεί να φτιάξει agent". The
// Agent Builder exists, works, has its own per-plan cap, preview and
// delivery channels — and Create Studio could not reach it, because
// "agent" was not one of the kinds detection could return. Create Studio
// has no "none": the prompt says to pick the CLOSEST kind. So a request
// for an agent came back as an automation (both recur) or a mission, and
// the user was handed something they had not asked for.
//
// THE SECOND CAUSE, which is why this file checks more than one thing:
// the dispatch switch had no default and no never-check. Adding "agent" to
// the list of kinds would have compiled cleanly and done NOTHING at
// runtime — press Create, watch the spinner stop, no result, no error.
// Every check below is derived from CREATE_STUDIO_TYPES, so the NEXT kind
// someone adds fails here until it is actually wired.
//
// Run: node scripts/tests/create-studio-agent.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

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

const plan = await loadTs("src/lib/create-studio/plan.ts");
const { CREATE_STUDIO_TYPES, STUDIO_ACTION_PROFILE, estimateCreditsFor, timeBucketFor, isCreateStudioType } = plan;
const { ACTION_PROFILES } = await loadTs("src/lib/billing/estimate.ts");

const dispatch = readFileSync("src/lib/create-studio/use-create-studio.ts", "utf8");
const detect = readFileSync("src/app/api/create-studio/detect/route.ts", "utf8");
const ui = readFileSync("src/components/create/create-studio.tsx", "utf8");
const messages = JSON.parse(readFileSync("messages/en.json", "utf8"));

console.log("== 1. agent is a kind Create Studio knows ==");
check("CREATE_STUDIO_TYPES contains 'agent'", CREATE_STUDIO_TYPES.includes("agent"), CREATE_STUDIO_TYPES.join(", "));
check("isCreateStudioType('agent')", isCreateStudioType("agent") === true);
check("...and still refuses a made-up kind", isCreateStudioType("spaceship") === false);

console.log("\n== 2. it is priced against the call it will actually make ==");
// The preview must reserve against the SAME profile the creating route
// charges, or the number shown before Create is not the number held.
check(
  `agent prices against agentBuild (${STUDIO_ACTION_PROFILE.agent})`,
  STUDIO_ACTION_PROFILE.agent === "agentBuild"
);
check("...and that profile exists", Boolean(ACTION_PROFILES.agentBuild));
// The real PricingConfig shape — an estimate built from a half-filled one
// silently comes back as 0, which would have made this check pass for the
// wrong reason.
const config = {
  marginMultiplier: 4,
  creditPriceEur: 0.02,
  usdToEurRate: 0.92,
  largeActionConfirmThreshold: 50,
  reserveBufferPercent: 10,
};
const estimate = estimateCreditsFor("agent", 200, config);
check(`the estimate is a real number, not zero (${estimate})`, Number.isFinite(estimate) && estimate > 0);
// Every kind that DOES make an AI call must price above zero. A kind that
// prices at 0 by accident is a kind the account is never asked to pay for.
for (const type of CREATE_STUDIO_TYPES) {
  const credits = estimateCreditsFor(type, 200, config);
  const expectsCost = STUDIO_ACTION_PROFILE[type] !== null;
  check(
    `${type} estimates ${credits} credits (${expectsCost ? "makes an AI call" : "makes none"})`,
    expectsCost ? credits > 0 : credits === 0
  );
}
check(
  `the time bucket is not "instant" — designing an agent is an AI call (${timeBucketFor("agent", 200)})`,
  timeBucketFor("agent", 200) !== "instant"
);

console.log("\n== 3. detection is taught the two confusions that matter ==");
// Both an agent and an automation repeat; both an agent and a mission are
// described as goals. Without a rule the model picks by vibe.
check("the prompt names the agent kind", /- "agent":/.test(detect));
check("...distinguishes it from automation", /agent" FROM "automation/i.test(detect));
check("...and from mission", /agent" FROM "mission/i.test(detect));
check(
  "...and says which way to fall when neither signal is present",
  /prefer "automation"/.test(detect),
  "an unbiased tie means the more expensive, capped feature wins a coin flip"
);
check(
  "the prompt counts the kinds correctly",
  new RegExp(`The six kinds`).test(detect) && CREATE_STUDIO_TYPES.length === 6,
  "the prose says one number and the enum another"
);
// The tool enum is spread from the same constant, so it cannot drift.
check("the tool enum is derived from CREATE_STUDIO_TYPES", /enum: \[\.\.\.CREATE_STUDIO_TYPES\]/.test(detect));

console.log("\n== 4. EVERY kind is actually wired — derived, not listed ==");
for (const type of CREATE_STUDIO_TYPES) {
  check(`the dispatch handles "${type}"`, new RegExp(`case "${type}":`).test(dispatch));
  check(`the UI has a chip for "${type}"`, new RegExp(`^\\s+${type}: \\{ icon:`, "m").test(ui));
}

console.log("\n== 5. ...and a kind that is NOT wired cannot compile ==");
// The structural half. Without this, the next added kind is a silent
// no-op — which is exactly how this bug happened.
check(
  "the switch ends in a never-typed default",
  /default: \{[\s\S]{0,900}const exhaustive: never = detection\.type;/.test(dispatch)
);
check(
  "...that says something rather than failing silently",
  /const exhaustive: never = detection\.type;[\s\S]{0,200}setError\(/.test(dispatch)
);
check(
  "...in the user's language, not in English",
  /setError\(tStudio\("unsupportedType"\)\)/.test(dispatch)
);

console.log("\n== 6. the agent branch calls both halves of the feature ==");
// build DESIGNS and charges; /api/agents SAVES and charges nothing.
const agentBranch = dispatch.slice(dispatch.indexOf('case "agent":'), dispatch.indexOf('case "document":'));
check("it designs through /api/agents/build", /startAndWatchJob\("\/api\/agents\/build"/.test(agentBranch));
check("...as a background job, so closing the page does not lose it", /startAndWatchJob/.test(agentBranch));
check("...skipping the second clarifying pass", /skipClarification: true/.test(agentBranch));
check(
  "...and sends a real timezone, so 'every morning' is the user's morning",
  /timezone: resolveTimeZone\(\)/.test(agentBranch) && /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/.test(dispatch)
);
check("then saves through POST /api/agents", /"\/api\/agents",[\s\S]{0,120}method: "POST"/.test(agentBranch));
check("...passing the draft the builder produced", /body: JSON\.stringify\(\{ draft: built\.draft \}\)/.test(agentBranch));
check(
  "a still-running design is reported as success, not as a failure",
  /still_running/.test(agentBranch) && /finishStep\("designAgent", "done"\)/.test(agentBranch),
  "reporting it as failed is how a user pays twice for the same design"
);
// Not an English literal in the dispatch — a key, so it says the same
// thing in all ten languages. The claim is checked where the words are.
check("a failed SAVE has its own message, not a generic one", /tStudio\("agentSaveFailed"\)/.test(agentBranch));
check(
  "...and that message says the agent WAS designed",
  /designed/i.test(messages.dashboard.createStudio.agentSaveFailed ?? ""),
  messages.dashboard.createStudio.agentSaveFailed
);
check(
  "...so the user is not left guessing whether they were billed",
  /could not be saved/i.test(messages.dashboard.createStudio.agentSaveFailed ?? "")
);
check("a failed DESIGN has its own message too", /tStudio\("agentDesignFailed"\)/.test(agentBranch));
check(
  "the result links to the agent that was created, not to a list",
  /href: `\/dashboard\/agents\?agent=\$\{data\.agent\.id\}`/.test(agentBranch)
);
check(
  "the title comes from the builder, not from the detector's guess",
  /built\.draft\.name/.test(agentBranch)
);

console.log("\n== 7. every step label the dispatch names actually resolves ==");
// A labelKey with no message renders its own dotted path to the user.
const progress = messages.dashboard.createStudio.progress ?? {};
const usedKeys = [...dispatch.matchAll(/labelKey: "([A-Za-z]+)"/g)].map((m) => m[1]);
check(`the dispatch names ${usedKeys.length} step labels`, usedKeys.length >= 7);
const missing = [...new Set(usedKeys)].filter((k) => !(k in progress));
check("all of them exist in en.json", missing.length === 0, `missing: ${missing.join(", ")}`);
check("including the two new agent steps", "designingAgent" in progress && "savingAgent" in progress);

console.log("\n== 8. the type chip has a label in every locale ==");
for (const locale of ["en", "el", "de", "es", "fr", "it", "pt", "ar", "ja", "zh"]) {
  const m = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  const label = m.dashboard?.createStudio?.typeAgent;
  check(`${locale}: typeAgent = ${JSON.stringify(label)}`, typeof label === "string" && label.length > 0);
}

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ` + failures.join("\n  - ")
);
process.exit(failures.length === 0 ? 0 : 1);
