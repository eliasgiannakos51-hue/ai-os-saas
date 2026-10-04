// A RESEARCH REPORT SHOWS ITS QUESTIONS AS STEPS, AND OUR COST NEVER
// REACHES THE BROWSER.
//
// V6.2 2.1, slice 4 (docs/QUEUE.md 0.1). src/lib/research/research-timeline.ts
// reads the findings the worker already writes, one per question, as the
// report's timeline. Held here by running it: each answered question is a
// step that says how many sources it found; the credits per step add up to
// the report's charge and appear only once it is finished; a report whose
// findings carry no timestamps gets no timeline rather than an invented
// one. And the second half, found while building the first: GET
// /api/research/[id] returned the whole row, usage_entries included —
// every model id, token count and USD cost — and now does not.
//
// Run: node scripts/tests/research-timeline.test.mjs
import { readFileSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";
import { loadTsLinked } from "./load-ts.mjs";

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

const MOD = "src/lib/research/research-timeline.ts";
const { researchTimeline, researchReportForClient, RESEARCH_WRITING_LABEL, SERVER_ONLY_RESEARCH_COLUMNS } =
  await loadTsLinked(MOD);
const { EVIDENCE_KEYS } = await loadTsLinked("src/lib/jobs/job-timeline.ts");
const sum = (a) => a.reduce((x, y) => x + y, 0);

const t0 = Date.parse("2026-10-04T09:00:00Z");
const at = (s) => new Date(t0 + s * 1000).toISOString();
const usage = (usd) => ({
  stage: "research",
  model: "claude-sonnet-4-6",
  usage: {
    inputTokens: 1000,
    outputTokens: 500,
    cacheWriteTokens: 0,
    cacheWrite1hTokens: 0,
    cacheReadTokens: 0,
    webSearches: 3,
    webFetches: 0,
    usdCost: usd,
  },
});
const src = (n) => Array.from({ length: n }, (_, i) => ({ title: `s${i}`, url: `https://example.com/${i}` }));

// Two questions answered (costing 0.10 and 0.30), then the report written
// (0.20). Entry 0 is the plan's own cost, spent before the run started.
const USAGE = [usage(0.05), usage(0.1), usage(0.3), usage(0.2)];
const FINDINGS = [
  { question: "Ποιοι είναι οι ανταγωνιστές;", summary: "a", sources: src(4), finishedAt: at(70), usageCount: 2 },
  { question: "Τι τιμές έχουν;", summary: "b", sources: src(2), finishedAt: at(160), usageCount: 3 },
];
const READY = {
  status: "ready",
  processing_started_at: at(0),
  completed_at: at(220),
  questions_total: 2,
  current_question: null,
  partial_findings: FINDINGS,
  usage_entries: USAGE,
  credits_charged: 30,
};

console.log("== 1. a finished report ==");
const done = researchTimeline(READY);
check("one step per question, then the writing", done.length === 3, JSON.stringify(done.map((s) => s.label)));
check("each question step is labelled with the question itself", done[0]?.label === FINDINGS[0].question && done[1]?.label === FINDINGS[1].question);
check("the last step is the writing, by its key", done[2]?.label === RESEARCH_WRITING_LABEL);
check("each question says how many sources it found", done[0]?.evidence?.key === "sources" && done[0]?.evidence?.count === 4 && done[1]?.evidence?.count === 2);
check("'sources' is a known evidence key, so the screen can word it", EVIDENCE_KEYS.includes("sources"));
check("seconds are the real gaps: 70, 90, 60", done.map((s) => s.seconds).join() === "70,90,60", done.map((s) => s.seconds).join());
check("the credits add up to the charge exactly", sum(done.map((s) => s.credits ?? 0)) === 30, done.map((s) => s.credits).join("+"));
check("the dearer step gets more credits (0.30 > 0.20 > 0.10)", done[1].credits > done[2].credits && done[2].credits > done[0].credits, done.map((s) => s.credits).join(","));

console.log("\n== 2. while it runs ==");
const running = researchTimeline({
  ...READY,
  status: "researching",
  completed_at: null,
  questions_total: 3,
  current_question: "Πού διαφημίζονται;",
  partial_findings: FINDINGS,
});
check("the question in flight is the last step", running.length === 3 && running[2].label === "Πού διαφημίζονται;");
check("…with no end yet", running[2].seconds === null);
check("no credits while it runs", running.every((s) => s.credits === null));
const writing = researchTimeline({ ...READY, status: "synthesising", completed_at: null });
check("while writing, the writing step is open", writing.at(-1)?.label === RESEARCH_WRITING_LABEL && writing.at(-1)?.seconds === null);

console.log("\n== 3. nothing invented ==");
check("a report not started has no timeline", researchTimeline({ ...READY, processing_started_at: null }).length === 0);
const legacy = FINDINGS.map(({ finishedAt, usageCount, ...rest }) => rest);
check("findings written before the stamps give no timeline", researchTimeline({ ...READY, partial_findings: legacy }).length === 0);
check(
  "one unstamped finding is enough to give none",
  researchTimeline({ ...READY, partial_findings: [FINDINGS[0], legacy[1]] }).length === 0
);

console.log("\n== 4. what the browser receives ==");
const row = { ...READY, id: "r1", topic: "x", reservation_id: "res-1", some_later_column: 7 };
const client = researchReportForClient(row);
const json = JSON.stringify(client);
check("usage_entries is not sent", !("usage_entries" in client));
check("reservation_id is not sent", !("reservation_id" in client));
check("no USD figure anywhere in the payload", !/usdCost|costUsd/.test(json));
check("no model id anywhere in the payload", !json.includes("claude-sonnet"));
check("a column this file does not know still reaches the screen", client.some_later_column === 7 && client.topic === "x");
check("the timeline rides along", Array.isArray(client.timeline) && client.timeline.length === 3);
check("the row itself is not mutated", "usage_entries" in row);
check("the removed columns are exactly the two named", SERVER_ONLY_RESEARCH_COLUMNS.join() === "usage_entries,reservation_id");

console.log("\n== 5. the code that writes and serves it ==");
const ROUTE = stripComments(readFileSync("src/app/api/research/[id]/route.ts", "utf8"));
const returns = ROUTE.match(/report:\s*[^}]+/g) ?? [];
check("the route returns reports in three places", returns.length === 3, returns.join(" | "));
check(
  "every one goes through researchReportForClient",
  returns.every((r) => /researchReportForClient\(/.test(r)),
  returns.join(" | ")
);
const RUN = stripComments(readFileSync("src/lib/research/run-research.ts", "utf8"));
check(
  "an answered question is stored with when it finished and the cost count",
  /findings\.push\(\{\s*\.\.\.result\.finding,\s*finishedAt:\s*new Date\(\)\.toISOString\(\),\s*usageCount:\s*costs\.snapshot\(\)\.length\s*\}\)/.test(RUN)
);
const UI = stripComments(readFileSync("src/components/research/research-workspace.tsx", "utf8"));
check("the report card mounts the timeline", /<AiJobTimeline\b[^>]*timeline:\s*report\.timeline/.test(UI));
check("the writing step is translated, not shown as a key", /RESEARCH_WRITING_LABEL/.test(UI) && /timeline\.writing/.test(UI));

const locales = ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"];
for (const l of locales) {
  const m = JSON.parse(readFileSync(`messages/${l}.json`, "utf8"));
  const ev = m?.aiSteps?.timeline?.evidence?.sources;
  const wr = m?.aiSteps?.timeline?.writing;
  check(`${l}: sources and writing are worded, with the count`, typeof ev === "string" && ev.includes("#") && typeof wr === "string" && wr.length > 0);
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
