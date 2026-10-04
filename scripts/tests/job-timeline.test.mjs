// A JOB'S TIMELINE ADDS UP TO ITS CHARGE, NEVER SHOWS OUR COST, AND
// CANNOT BREAK A DATABASE THAT HAS NOT RUN ITS MIGRATION.
//
// V6.2 2.1 (docs/QUEUE.md). src/lib/jobs/job-timeline.ts records each step a
// background job reports and turns it into what the poll returns. Three
// promises are held here, each by running the code: the credits shown per
// step are the job's real charge split, so they sum to it exactly and are
// absent while the job runs; the provider cost stored with each step never
// reaches a client; and the worker writes the column only when the row
// has it, because the migration is applied by hand.
//
// Run: node scripts/tests/job-timeline.test.mjs
import { readFileSync, existsSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";
import { loadTs } from "./load-ts.mjs";

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

const { splitCredits, timelineForClient, appendStep, attachEvidence, restoreTimeline, MAX_TIMELINE_ENTRIES, EVIDENCE_KEYS } = await loadTs(
  "src/lib/jobs/job-timeline.ts"
);
const sum = (a) => a.reduce((x, y) => x + y, 0);

console.log("== 1. the split adds up to the charge ==");
for (const [total, weights] of [
  [7, [1, 1, 1]],
  [10, [0.002, 0.0101, 0.0003]],
  [1, [5, 5]],
  [90, [0.01, 0.4, 0.2, 0.05]],
]) {
  const parts = splitCredits(total, weights);
  check(`${total} over ${weights.length} steps sums to ${total} (${parts.join("+")})`, sum(parts) === total);
}
check("a larger cost gets at least as many credits", (() => {
  const p = splitCredits(20, [1, 3]);
  return p[1] >= p[0] && p[1] === 15;
})());
check("nothing to split gives zeros", sum(splitCredits(0, [1, 2])) === 0 && sum(splitCredits(5, [0, 0])) === 0);

console.log("\n== 2. what the poll returns ==");
const t0 = Date.parse("2026-10-03T10:00:00Z");
const at = (s) => new Date(t0 + s * 1000).toISOString();
const entries = [
  { at: at(0), step: 1, label: "preparing", costUsd: 0, evidence: null },
  { at: at(4), step: 2, label: "working", costUsd: 0.01, evidence: { key: "files", count: 6 } },
  { at: at(30), step: 3, label: "delivering", costUsd: 0.09, evidence: null },
];
// A charge on the row does not make a running job's steps priced: the
// rule is about the STATUS, so the row here carries one on purpose.
const running = timelineForClient(entries, { status: "running", creditsCharged: 13, finishedAt: null, finalCostUsd: 0.09 });
check("while running, no step shows credits", running.every((s) => s.credits === null));
check("while running, the last step has no duration yet", running[2].seconds === null && running[0].seconds === 4 && running[1].seconds === 26);
const done = timelineForClient(entries, { status: "done", creditsCharged: 13, finishedAt: at(41), finalCostUsd: 0.1 });
check(`when done, the steps add up to the charge (${done.map((s) => s.credits).join("+")} = 13)`, sum(done.map((s) => s.credits)) === 13);
check("…weighted by what each step cost", done[1].credits > done[2].credits && done[2].credits >= done[0].credits);
check("the last step ends when the job finished", done[2].seconds === 11);
check("evidence is carried as a key and a number", done[1].evidence?.key === "files" && done[1].evidence?.count === 6);
const json = JSON.stringify(done);
check("no provider cost reaches the client", !/costUsd|usd/i.test(json), json.slice(0, 200));
const unweighable = timelineForClient(
  entries.map((e) => ({ ...e, costUsd: 0 })),
  { status: "done", creditsCharged: 5, finishedAt: at(41), finalCostUsd: 0 }
);
check("a charge with no recorded cost shows no credits rather than wrong ones", unweighable.every((s) => s.credits === null));

console.log("\n== 3. recording ==");
let tl = appendStep([], { at: at(0), step: 1, label: "a", costUsd: 0, evidence: null });
tl = appendStep(tl, { at: at(9), step: 1, label: "b", costUsd: 0.5, evidence: "x" });
check("the same step reported twice is one entry, with its first start time", tl.length === 1 && tl[0].at === at(0) && tl[0].label === "b");
let long = [];
for (let i = 1; i <= MAX_TIMELINE_ENTRIES + 15; i++) long = appendStep(long, { at: at(i), step: i, label: null, costUsd: i, evidence: null });
check(`the row cannot grow past ${MAX_TIMELINE_ENTRIES} entries`, long.length === MAX_TIMELINE_ENTRIES);
check(
  "anything malformed in the column is dropped",
  restoreTimeline([null, 3, { at: "nope", step: 1, costUsd: 0 }, { at: at(1), step: 2, costUsd: 0.1 }]).length === 1 &&
    restoreTimeline("garbage").length === 0
);

console.log("\n== 3b. what a step found is a key and a number, never a sentence ==");
check("an unknown key is dropped", restoreTimeline([{ at: at(1), step: 1, costUsd: 0, evidence: { key: "rumours", count: 3 } }])[0].evidence === null);
check("a sentence is dropped", restoreTimeline([{ at: at(1), step: 1, costUsd: 0, evidence: "6 sources" }])[0].evidence === null);
check("a negative count is dropped", restoreTimeline([{ at: at(1), step: 1, costUsd: 0, evidence: { key: "files", count: -1 } }])[0].evidence === null);
{
  const one = appendStep([], { at: at(0), step: 1, label: "a", costUsd: 0, evidence: null });
  const two = appendStep(one, { at: at(5), step: 2, label: "b", costUsd: 0.1, evidence: null });
  const noted = attachEvidence(two, { key: "planSteps", count: 5 });
  check("evidence attaches to the CURRENT step only", noted[1].evidence?.count === 5 && noted[0].evidence === null);
  check("…and nothing attaches before the first step", attachEvidence([], { key: "files", count: 1 }).length === 0);
}
const panelSrc = stripComments(readFileSync("src/components/ui/ai-job-timeline.tsx", "utf8"));
const panelKeys = [...(panelSrc.match(/EVIDENCE_MESSAGE = \{([\s\S]*?)\}/)?.[1] ?? "").matchAll(/(\w+):/g)].map((m) => m[1]);
check(
  `every evidence key has a message on the screen, and no other (${EVIDENCE_KEYS.length})`,
  panelKeys.length === EVIDENCE_KEYS.length && EVIDENCE_KEYS.every((k) => panelKeys.includes(k)),
  panelKeys.join(", ")
);
for (const locale of ["en", "el", "ar", "ja"]) {
  const m = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  check(`${locale}: every evidence key has words`, EVIDENCE_KEYS.every((k) => typeof m.aiSteps?.timeline?.evidence?.[k] === "string"));
}
const plan = stripComments(readFileSync("src/lib/jobs/handlers/mission-plan.ts", "utf8"));
check(
  "the planner attaches its count with evidence(), which never checks Stop, after the paid work",
  /ctx\.evidence\(\{ key: "planSteps"/.test(plan) && !/ctx\.progress\(2, steps\[1\], \{/.test(plan)
);
const runnerSrc = stripComments(readFileSync("src/lib/jobs/run-job.ts", "utf8"));
const evidenceFn = runnerSrc.slice(runnerSrc.indexOf("evidence: async (evidence)"), runnerSrc.indexOf("evidence: async (evidence)") + 400);
check("evidence() writes the timeline and does not check Stop", /attachEvidence/.test(evidenceFn) && !/isStopRequested|StoppedByUserError/.test(evidenceFn));

console.log("\n== 4. the worker, the poll and the screen ==");
const runner = stripComments(readFileSync("src/lib/jobs/run-job.ts", "utf8"));
check(
  "the worker writes the timeline only when the row has the column",
  /recordsTimeline\s*=\s*Object\.prototype\.hasOwnProperty\.call\(raw,\s*"timeline"\)/.test(runner) &&
    /\.\.\.\(recordsTimeline \? \{ timeline \} : \{\}\)/.test(runner)
);
check("…and records the cost so far with each step", /costUsd:\s*costs\.totalUsdCost/.test(runner));
const route = stripComments(readFileSync("src/app/api/jobs/[id]/route.ts", "utf8"));
check("the poll returns the timeline through timelineForClient", /timeline:\s*timelineForClient\(restoreTimeline\(job\.timeline\)/.test(route));
check("the poll never returns the stored entries or the usage", !/timeline:\s*job\.timeline/.test(route) && !/usageEntries|usage_entries:\s*job/.test(route));
const panel = stripComments(readFileSync("src/components/ui/ai-job-timeline.tsx", "utf8"));
check("the screen shows credits with the shared plural string", /useTranslations\("settings\.billing"\)/.test(panel) && /tBilling\("creditsAmount"/.test(panel));
const agentsSrc = stripComments(readFileSync("src/components/agents/agents-workspace.tsx", "utf8"));
check("the agent run shows its timeline, while running and after", (agentsSrc.match(/<AiJobTimeline job=\{runJob\}/g) ?? []).length >= 2);
check("the agent build shows its timeline while it runs", /<AiJobTimeline job=\{job\}/.test(agentsSrc));
check("the mission planner shows its timeline", /<AiJobTimeline job=\{displayJob\}/.test(stripComments(readFileSync("src/components/mission/mission-form.tsx", "utf8"))));
const MIG = "supabase/migrations/20261004200000_ai_jobs_timeline.sql";
check("the migration adds the column", existsSync(MIG) && /add column if not exists timeline jsonb/.test(readFileSync(MIG, "utf8")));

console.log(
  failures.length === 0
    ? `\nALL PASS: ${pass} passed, 0 failed`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed`,
);
process.exit(failures.length === 0 ? 0 : 1);
