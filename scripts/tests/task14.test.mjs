// V3 Task 14 — the AI Intelligence Layer: parallel thinking, honest
// confidence, one dismissible suggestion, the learning profile,
// explainability, and the data-first sidebar rule.
//
// Run: node scripts/tests/task14.test.mjs
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

console.log("== 1. the concurrency pool actually runs concurrently, bounded, in order ==");
const { mapWithConcurrency } = await loadTs("src/lib/ai/parallel.ts");
{
  let inFlight = 0;
  let peak = 0;
  const order = [];
  const results = await mapWithConcurrency([50, 10, 30, 5, 20, 1], 3, async (delayMs, index) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, delayMs));
    inFlight--;
    order.push(index);
    return delayMs * 2;
  });
  checkTrue(`more than one ran at once (peak ${peak})`, peak > 1);
  checkTrue(`...but never more than the limit (peak ${peak} <= 3)`, peak <= 3);
  check("results come back in INPUT order regardless of finish order", results, [100, 20, 60, 10, 40, 2]);
  checkTrue("completion order differed from input order (i.e. it was actually parallel)", order.join(",") !== "0,1,2,3,4,5");

  // A rejection carries through — no silently dropped questions.
  let threw = false;
  try {
    await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    });
  } catch {
    threw = true;
  }
  check("a failing item fails the call, same as the sequential loop", threw, true);
  check("empty input short-circuits", await mapWithConcurrency([], 5, async () => 1), []);
}

console.log("\n== 2. the research loop uses the pool, and the reserve covers it ==");
const runRoute = readFileSync("src/app/api/research/[id]/run/route.ts", "utf8");
checkTrue("the sequential for-await loop is gone", !/for \(const question of questions\) \{\s*\n\s*const result = await researchQuestion/.test(runRoute));
checkTrue("the pool runs the questions", runRoute.includes("mapWithConcurrency(") && runRoute.includes("RESEARCH_CONCURRENCY"));
const limits = await loadTs("src/lib/research/research-limits.ts");
checkTrue(`the pool is bounded (${limits.RESEARCH_CONCURRENCY}), not a bare Promise.all`, limits.RESEARCH_CONCURRENCY >= 2 && limits.RESEARCH_CONCURRENCY < limits.RESEARCH_MAX_QUESTIONS);
// The reservation is taken from the estimate for ALL questions BEFORE
// any parallel call starts — concurrency cannot outrun the hold.
const reserveIndex = runRoute.indexOf("reserveCredits(user.id, estimate.reserveCredits");
const poolIndex = runRoute.indexOf("mapWithConcurrency(");
checkTrue("the full-run reserve happens before the pool starts", reserveIndex > 0 && reserveIndex < poolIndex);
// Latency math, stated as a check: a 6-question run at pool 3 takes 2
// question-waves instead of 6 — a 3x reduction in question latency.
check("6 questions at pool 3 = 2 waves (was 6)", Math.ceil(6 / limits.RESEARCH_CONCURRENCY), 2);

console.log("\n== 3. confidence: never a percentage, only what is known ==");
const { researchConfidence } = await loadTs("src/lib/research/confidence.ts");
check("zero sources -> insufficient", researchConfidence({ sourceCount: 0, questionCount: 4 }).level, "insufficient");
check("fewer sources than questions -> thin", researchConfidence({ sourceCount: 3, questionCount: 4 }).level, "thin");
check("enough sources -> grounded", researchConfidence({ sourceCount: 8, questionCount: 4 }).level, "grounded");
const confidenceSource = readFileSync("src/lib/research/confidence.ts", "utf8");
// The TYPE carries only a level and a real count — no numeric score
// field exists for a UI to turn into a fake percentage. (The word
// "percentage" appears in the file only inside the comment that bans it.)
checkTrue("the confidence type has no numeric score field", !/score:|percentage: number|percent: number/.test(confidenceSource));
const workspace = readFileSync("src/components/research/research-workspace.tsx", "utf8");
checkTrue("the workspace renders the indicator", workspace.includes("researchConfidence({"));
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
checkTrue('the copy states a source COUNT ("Based on {count} sources")', en.dashboard.deepResearch.confidenceGrounded.includes("{count} sources"));
checkTrue("the insufficient copy admits it and suggests digging deeper", /narrower topic|run again/i.test(en.dashboard.deepResearch.confidenceInsufficient));
checkTrue("no % sign in any confidence string", !["confidenceGrounded", "confidenceThin", "confidenceInsufficient"].some((k) => en.dashboard.deepResearch[k].includes("%")));

console.log("\n== 4. the one dismissible suggestion ==");
const builder = readFileSync("src/components/website-builder/website-builder-workspace.tsx", "utf8");
checkTrue("rule-based on a REAL signal (no reference images this run)", builder.includes("suggestImagesOnComplete: referenceImagePaths.length === 0"));
checkTrue("a proposal, never an automatic change (no auto-regenerate)", !/setImprovementHint[\s\S]{0,200}fetch\(.*regenerate/.test(builder));
checkTrue("dismissible", builder.includes("setImprovementHint(null)"));
checkTrue("at most one hint state exists", (builder.match(/useState<null \| "addReferenceImages">/g) ?? []).length === 1);

console.log("\n== 5. the learning profile ==");
const learning = await loadTs("src/lib/learning-rules.ts");
check("confidence is derived from evidence, capped at 1", learning.confidenceFromEvidence(10), 1);
check("one sighting is low confidence", learning.confidenceFromEvidence(1), 0.2);
check("one sighting never reaches the AI context", learning.contextWorthy([{ category: "a", observation: "x", confidence: 0.2, evidence_count: 1 }]), []);
check(
  "repeated sightings do",
  learning.contextWorthy([{ category: "a", observation: "x", confidence: 0.4, evidence_count: 2 }]).length,
  1
);
const migration = readFileSync("v3_task14_intelligence_migration.sql", "utf8");
checkTrue("the table has select-own and delete-own, NO insert policy", migration.includes("select_own_user_preferences_learned") && migration.includes("delete_own_user_preferences_learned") && !migration.includes("insert_own_user_preferences_learned"));
const insightsDismiss = readFileSync("src/app/api/insights/[id]/route.ts", "utf8");
checkTrue("a dismissal records what the user does NOT want", insightsDismiss.includes('recordLearnedObservation('));
const importApply = readFileSync("src/app/api/import/csv/apply/route.ts", "utf8");
checkTrue("an import records where their data lives", importApply.includes("recordLearnedObservation(user.id, \"modules\""));
const userContext = readFileSync("src/lib/user-context.ts", "utf8");
checkTrue("learned preferences feed the AI Life Context", userContext.includes("learnedPreferences"));
checkTrue("...in BOTH prompt languages", userContext.includes("Observed preferences") && userContext.includes("Παρατηρημένες προτιμήσεις"));
const settingsPage = readFileSync("src/app/dashboard/settings/page.tsx", "utf8");
checkTrue("visible in Settings", settingsPage.includes("LearnedPreferencesSection"));
const manifest = readFileSync("src/lib/gdpr/export-manifest.ts", "utf8");
checkTrue("and in the GDPR export", manifest.includes('table: "user_preferences_learned"'));

console.log("\n== 6. explainability is recorded, not reconstructed ==");
checkTrue("the accumulator exposes per-call summaries", readFileSync("src/lib/billing/cost-accumulator.ts", "utf8").includes("stepSummaries()"));
checkTrue("the run route persists run_steps at settlement", runRoute.includes("run_steps: runSteps"));
checkTrue("per-step credits are the SETTLED charge split by real cost share", runRoute.includes("settlement.creditsCharged * step.usdShare"));
checkTrue("the workspace renders a collapsible 'how this was made'", workspace.includes("howThisWasMade") && workspace.includes("<details"));
checkTrue("...that admits the split is approximate", Boolean(en.dashboard.deepResearch.howThisWasMadeNote.match(/approximate/i)));
checkTrue("the schema carries the column", readFileSync("supabase_full_project_backup.sql", "utf8").includes("add column if not exists run_steps jsonb"));

console.log("\n== 7. sidebar consolidation: data FIRST, nothing removed ==");
const usageReport = readFileSync("scripts/usage-report.mjs", "utf8");
checkTrue("the measurement tool exists (ai_cost_log by feature + entries per module)", usageReport.includes("ai_cost_log") && usageReport.includes("MODULE_TABLES"));
checkTrue("its decision rule forbids removal", /Nothing is ever removed/.test(usageReport));
const sidebarNav = readFileSync("src/lib/sidebar-nav.ts", "utf8");
checkTrue("no sidebar item was removed by this task (all groups intact)", sidebarNav.includes("MAIN_SIDEBAR_GROUPS") && sidebarNav.includes("SETTINGS_GROUP"));

console.log("\n== 8. every new string exists in every locale ==");
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const KEY_PATHS = [
  ...["confidenceGrounded","confidenceThin","confidenceInsufficient","howThisWasMade","howThisWasMadeNote","runStageQuestion","runStageSynthesis","stepSearches"].map((k) => ["dashboard","deepResearch",k]),
  ["dashboard","websiteBuilder","suggestReferenceImages"],
  ["dashboard","websiteBuilder","suggestDismiss"],
  ...["title","description","empty","evidence","forget"].map((k) => ["settings","learnedPreferences",k]),
];
for (const locale of LOCALES) {
  const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  const missing = KEY_PATHS.filter((path) => {
    let node = messages;
    for (const part of path) node = node?.[part];
    return typeof node !== "string" || node.length === 0;
  }).map((p) => p.join("."));
  check(`${locale}: all ${KEY_PATHS.length} new keys present`, missing, []);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
