// Reproduction test for the Mission Control planner's output handling.
//
// The planner's tool schema changed from "an array of strings" to "an
// array of objects with an outcome, a time estimate and optional
// sub-steps". Two things have to hold for that to be safe:
//
//   1. A model that still returns bare strings must NOT be treated as a
//      parse failure — that would turn a perfectly good plan into a
//      spurious "your goal is too vague" clarification prompt.
//   2. Junk in the new fields must be dropped rather than shown. A time
//      estimate of -5 or 40000 minutes is worse than no estimate, because
//      the user cannot tell it is wrong.
//
// Run: node scripts/tests/mission-planner.test.mjs
import { readFileSync } from "node:fs";
import ts from "typescript";

// mission-agents.ts imports the Anthropic SDK, which the shared
// dependency-free loader deliberately refuses. parsePlanMissionToolInput
// is pure — it never touches the client — so the import is stubbed out
// and the module is transpiled directly. The tool constants that
// reference Anthropic types erase at compile time.
function loadMissionAgents() {
  let src = readFileSync("src/lib/mission-agents.ts", "utf8");
  src = src.replace('import "server-only";', "");
  src = src.replace('import Anthropic from "@anthropic-ai/sdk";', "const Anthropic = class {};");
  src = src.replace(
    /import \{ AI_QUALITY_CHECKLIST_EL \} from "@\/lib\/ai-quality-checklist";/,
    'const AI_QUALITY_CHECKLIST_EL = "";'
  );
  // Same stubbing reason as the checklist above: the conduct block is a
  // constant string, and this test is about the PLANNER's parsing logic.
  // scripts/tests/ai-conduct.test.mjs is what asserts the real block is
  // present and correct.
  src = src.replace(
    /import \{ AI_CONDUCT_EL \} from "@\/lib\/ai-conduct";/,
    'const AI_CONDUCT_EL = "";'
  );
  src = src.replace(/import type \{ CostAccumulator \} from "@\/lib\/billing\/cost-accumulator";/, "");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}

const { parsePlanMissionToolInput } = await loadMissionAgents();

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

console.log("== 1. the new rich shape is parsed ==");
const rich = parsePlanMissionToolInput({
  clarificationNeeded: false,
  clarificationQuestion: "",
  steps: [
    {
      text: "Find 5 competitors in your niche and log their prices in the Competitors module",
      outcome: "5 competitors logged with prices",
      estimatedMinutes: 45,
      substeps: [
        "Search for competitors on Google and in app stores",
        "Open each pricing page and note the tiers",
        "Create one Competitors entry per company",
      ],
    },
    { text: "Decide your launch price and log it in the Products module", estimatedMinutes: 20 },
  ],
});
check("not a clarification", rich.clarificationNeeded, false);
check("two steps", rich.steps.length, 2);
check("outcome kept", rich.steps[0].outcome, "5 competitors logged with prices");
check("minutes kept", rich.steps[0].estimatedMinutes, 45);
check("three sub-steps kept", rich.steps[0].substeps?.length, 3);
check("step without sub-steps has none", rich.steps[1].substeps, undefined);
check("step without an outcome has none", rich.steps[1].outcome, undefined);

console.log("\n== 2. a bare string array still works (backwards compatible) ==");
// This is the regression that would silently break real users: a model
// returning the OLD shape must not read as an unusable plan.
const legacy = parsePlanMissionToolInput({
  clarificationNeeded: false,
  clarificationQuestion: "",
  steps: ["Log the newsletter as a product with pricing", "Research three competing newsletters"],
});
check("not a clarification", legacy.clarificationNeeded, false);
check("both steps survive", legacy.steps.length, 2);
check("text is carried over", legacy.steps[0].text, "Log the newsletter as a product with pricing");
check("no invented outcome", legacy.steps[0].outcome, undefined);
check("no invented estimate", legacy.steps[0].estimatedMinutes, undefined);

console.log("\n== 3. junk in the new fields is dropped, not displayed ==");
const junk = parsePlanMissionToolInput({
  clarificationNeeded: false,
  clarificationQuestion: "",
  steps: [
    { text: "A genuinely long enough first step", estimatedMinutes: -5 },
    { text: "A genuinely long enough second step", estimatedMinutes: 40000 },
    { text: "A genuinely long enough third step", estimatedMinutes: 0 },
    { text: "A genuinely long enough fourth step", estimatedMinutes: 30.6 },
    { text: "A genuinely long enough fifth step", outcome: "   " },
  ],
});
check("negative minutes dropped", junk.steps[0].estimatedMinutes, undefined);
check("absurd minutes dropped", junk.steps[1].estimatedMinutes, undefined);
check("zero minutes dropped", junk.steps[2].estimatedMinutes, undefined);
check("fractional minutes rounded", junk.steps[3].estimatedMinutes, 31);
check("whitespace-only outcome dropped", junk.steps[4].outcome, undefined);

const oneSub = parsePlanMissionToolInput({
  clarificationNeeded: false,
  clarificationQuestion: "",
  steps: [
    { text: "A genuinely long enough step here", substeps: ["Only one sub-step listed here"] },
    { text: "Another genuinely long enough step", substeps: ["ok", "x", "  "] },
  ],
});
// One sub-step is the step restated, not a breakdown.
check("a lone sub-step is discarded", oneSub.steps[0].substeps, undefined);
check("sub-steps that are too short are discarded", oneSub.steps[1].substeps, undefined);

console.log("\n== 4. the existing protections still hold ==");
const filtered = parsePlanMissionToolInput({
  clarificationNeeded: false,
  clarificationQuestion: "",
  steps: [
    { text: "Do it" },
    { text: "A genuinely long enough step" },
    { text: "a GENUINELY long enough step" },
    { text: "Another genuinely long enough step" },
    null,
    42,
  ],
});
check("too-short step dropped", filtered.steps.some((s) => s.text === "Do it"), false);
check("case-insensitive duplicate dropped", filtered.steps.length, 2);
check("non-object entries dropped", filtered.steps.every((s) => typeof s.text === "string"), true);

const vague = parsePlanMissionToolInput({
  clarificationNeeded: true,
  clarificationQuestion: "What specifically do you want to achieve?",
  steps: [],
});
check("explicit clarification honoured", vague.clarificationNeeded, true);

const degraded = parsePlanMissionToolInput({
  clarificationNeeded: false,
  clarificationQuestion: "",
  steps: [{ text: "A genuinely long enough step" }],
});
check("a one-step plan falls back to clarification", degraded.clarificationNeeded, true);

console.log("\n== 5. research runs before planning and is priced ==");
const agents = readFileSync("src/lib/mission-agents.ts", "utf8");
checkTrue("a web search tool is offered to the research pass", agents.includes("web_search_20250305"));
checkTrue("research is a SEPARATE call from planning", agents.includes("export async function researchGoal"));
checkTrue(
  "research failure is swallowed so planning still runs",
  /catch\s*{[\s\S]*?return \{ findings: "", searchCount: 0 \}/.test(agents)
);
checkTrue('an empty result is signalled with NONE', agents.includes('toUpperCase().startsWith("NONE")'));

const route = readFileSync("src/app/api/mission/plan/route.ts", "utf8");
// Compare the awaited CALL SITES, not any textual occurrence — prose
// comments in this file mention planMission() long before it is called.
checkTrue(
  "the route researches before it plans",
  route.indexOf("await researchGoal(") < route.indexOf("await planMission(")
);
checkTrue("web searches are reserved for", route.includes("expectedWebSearches: 3"));

const estimate = readFileSync("src/lib/billing/estimate.ts", "utf8");
const missionProfile = estimate.slice(estimate.indexOf("missionPlan: {"), estimate.indexOf("createStudioDetect"));
checkTrue("the research call is in the missionPlan cost profile", missionProfile.includes("3000"));

console.log("\n== 6. the planner prompt demands specific, executable steps ==");
checkTrue("it shows a bad-vs-good example", agents.includes("ΟΧΙ:") && agents.includes("ΝΑΙ:"));
checkTrue("it names the modules a step can land in", agents.includes("Competitors"));
checkTrue("it asks for an outcome per step", agents.includes('"outcome"'));
checkTrue("it asks for a time estimate per step", agents.includes('"estimatedMinutes"'));
checkTrue("it asks for sub-steps only when complex", agents.includes('"substeps"'));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
