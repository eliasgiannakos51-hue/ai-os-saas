// A WEBSITE GENERATION SHOWS ITS REAL PHASES, AND OUR COST NEVER REACHES
// THE BROWSER.
//
// V6.2 2.1, slice 5 (docs/QUEUE.md 0.1). The builder showed four rotating
// sentences on a 17-second timer, tied to nothing. The worker
// (src/app/api/websites/generate/process/route.ts) now writes the five
// phases it really passes through to user_websites.timeline, and
// src/lib/websites/website-timeline.ts turns them into steps. Held here by
// running it: the phases come back in order with their real durations;
// the credits per phase add up to the charge and appear only once the
// generation is finished; a failed or pre-migration generation shows
// nothing rather than something invented; and the stored column carries
// shares, never dollars, because every route selects `*`.
//
// Run: node scripts/tests/website-timeline.test.mjs
import { existsSync, readFileSync } from "node:fs";
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

const MOD = "src/lib/websites/website-timeline.ts";
const {
  WEBSITE_STEPS,
  startWebsiteStep,
  attachWebsiteEvidence,
  finishWebsiteTimeline,
  websiteTimelineForClient,
  clientWebsiteTimeline,
  restoreWebsiteTimeline,
} = await loadTsLinked(MOD);
const { EVIDENCE_KEYS } = await loadTsLinked("src/lib/jobs/job-timeline.ts");
const sum = (a) => a.reduce((x, y) => x + y, 0);

const t0 = Date.parse("2026-10-08T09:00:00Z");
const at = (s) => new Date(t0 + s * 1000).toISOString();

// What the worker does, in order: each phase starts at the accumulated
// cost of that moment. Preparing spends nothing, writing spends 0.40,
// photos 0.00, checking (the safety review) 0.10, saving nothing.
let tl = [];
const costAt = [];
const mark = (step, s, cost) => {
  const next = startWebsiteStep(tl, step, at(s));
  if (next !== tl) costAt.push(cost);
  tl = next;
};
mark("preparing", 0, 0);
mark("writing", 4, 0);
mark("photos", 94, 0.4);
tl = attachWebsiteEvidence(tl, "photos", { key: "photos", count: 6 });
tl = attachWebsiteEvidence(tl, "writing", { key: "pages", count: 3 });
mark("checking", 100, 0.4);
mark("saving", 130, 0.5);
const STORED = finishWebsiteTimeline(tl, costAt, 0.5, at(133));

console.log("== 1. what is stored ==");
const json = JSON.stringify(STORED);
check("five phases and an end mark", STORED.length === 6 && STORED.at(-1).step === "done", STORED.map((e) => e.step).join());
check("the phases are the five the worker passes, in order", STORED.slice(0, 5).map((e) => e.step).join() === WEBSITE_STEPS.join());
check("no dollar figure is stored — only per-mille shares", !/usd|cost|0\.4|0\.1\b/i.test(json), json);
check("the shares add up to 1000", sum(STORED.slice(0, 5).map((e) => e.weight)) === 1000, STORED.map((e) => e.weight).join("+"));
check("the writing phase carries 800 of them (0.40 of 0.50)", STORED[1].weight === 800, String(STORED[1].weight));
check("every stored entry has only at, step, evidence and weight", STORED.every((e) => Object.keys(e).every((k) => ["at", "step", "evidence", "weight"].includes(k))));
check("a phase started twice keeps the first", startWebsiteStep(tl, "writing", at(999)) === tl);
check("'pages' and 'photos' are known evidence keys, so the screen can word them", EVIDENCE_KEYS.includes("pages") && EVIDENCE_KEYS.includes("photos"));
check("evidence with an unknown key is dropped, not stored", attachWebsiteEvidence(tl, "photos", { key: "usd", count: 3 }) === tl);

console.log("\n== 2. a finished generation ==");
const done = websiteTimelineForClient(STORED, { status: "completed", creditsCharged: 25 });
check("five steps, the end mark not among them", done.length === 5 && done.every((s) => s.label !== "done"), done.map((s) => s.label).join());
check("seconds are the real gaps: 4, 90, 6, 30, 3", done.map((s) => s.seconds).join() === "4,90,6,30,3", done.map((s) => s.seconds).join());
check("the credits add up to the charge exactly", sum(done.map((s) => s.credits ?? 0)) === 25, done.map((s) => s.credits).join("+"));
check("the dearer phase gets more credits (writing > checking > photos)", done[1].credits > done[3].credits && done[3].credits > done[2].credits, done.map((s) => s.credits).join(","));
check("the photos phase says how many were placed", done[2].evidence?.key === "photos" && done[2].evidence?.count === 6);
check("the writing phase says how many pages", done[1].evidence?.key === "pages" && done[1].evidence?.count === 3);
check("a flagged site was charged too, so it is priced", sum(websiteTimelineForClient(STORED, { status: "flagged", creditsCharged: 25 }).map((s) => s.credits ?? 0)) === 25);
check("a free generation prices every step at 0, not null", websiteTimelineForClient(STORED, { status: "completed", creditsCharged: 0 }).every((s) => s.credits === 0));
check("a finished site whose charge is unknown shows durations and no credits", websiteTimelineForClient(STORED, { status: "completed", creditsCharged: null }).every((s) => s.credits === null && s.seconds !== null));

console.log("\n== 3. while it runs ==");
const running = websiteTimelineForClient(tl.slice(0, 3), { status: "processing", creditsCharged: null });
check("the phase in flight is the last step", running.length === 3 && running[2].label === "photos");
check("…with no end yet", running[2].seconds === null);
check("…and the ones before it are measured", running[0].seconds === 4 && running[1].seconds === 90);
check("no credits while it runs", running.every((s) => s.credits === null));
check(
  "no credits even with a charge and the shares written, until the end mark is",
  websiteTimelineForClient(STORED.slice(0, 5), { status: "completed", creditsCharged: 25 }).every((s) => s.credits === null)
);
// A flagged site's free regenerate puts the row back to pending with the
// first run's finished timeline still in it, until the worker's first write.
check(
  "a generation in flight is not priced, even over a finished timeline",
  websiteTimelineForClient(STORED, { status: "pending", creditsCharged: 25 }).every((s) => s.credits === null)
);

console.log("\n== 4. nothing invented ==");
check("a failed generation shows nothing", websiteTimelineForClient(STORED, { status: "failed", creditsCharged: null }).length === 0);
check("a row from before the column shows nothing", websiteTimelineForClient(undefined, { status: "completed", creditsCharged: 25 }).length === 0);
check("an empty column shows nothing", websiteTimelineForClient([], { status: "processing", creditsCharged: null }).length === 0);
check(
  "malformed entries are dropped, not guessed at",
  restoreWebsiteTimeline([{ at: "not a date", step: "writing" }, { at: at(0), step: "hacking" }, null, 7, { at: at(0), step: "saving", evidence: null }]).length === 1
);

console.log("\n== 5. what the builder accepts ==");
check("the poll's steps are accepted", clientWebsiteTimeline(done).length === 5);
check("the stored entries a raw row carries are not", clientWebsiteTimeline(STORED).length === 0);
check("anything else is not", clientWebsiteTimeline(null).length === 0 && clientWebsiteTimeline("x").length === 0);
check("one foreign step is enough to reject the lot", clientWebsiteTimeline([...done, { step: 6, startedAt: at(0), label: "done" }]).length === 0);

console.log("\n== 6. the code that writes, serves and shows it ==");
const WORKER = stripComments(readFileSync("src/app/api/websites/generate/process/route.ts", "utf8"));
const marks = [...WORKER.matchAll(/await markStep\("(\w+)"\)/g)].map((m) => m[1]);
check("the worker marks the five phases, in order", marks.join() === WEBSITE_STEPS.join(), marks.join());
check(
  "the timeline is its own update, so a missing column cannot fail a generation",
  /\.update\(\{ timeline \}\)/.test(WORKER) && !/update\(\{[^}]*status[^}]*timeline|update\(\{[^}]*timeline[^}]*status/.test(WORKER)
);
check(
  "the end mark is written before the final status",
  WORKER.indexOf("finishWebsiteTimeline(") > -1 &&
    WORKER.indexOf("finishWebsiteTimeline(") < WORKER.indexOf('update({ status: isFlagged ? "flagged" : "completed" })')
);
check(
  "a cost mark is pushed only for a phase that was added",
  /if \(next === timeline\) return;\s*costAtStepStart\.push/.test(WORKER)
);
const STATUS = stripComments(readFileSync("src/app/api/websites/status/route.ts", "utf8"));
const returns = STATUS.match(/record:\s*[^,}]+(?:\([^)]*\))?/g) ?? [];
check("the status route returns the row in three places", returns.length === 3, returns.join(" | "));
check("every one goes through withClientTimeline", returns.every((r) => /withClientTimeline\(/.test(r)), returns.join(" | "));
check("the finished row is priced from its real charge", /withClientTimeline\(record,\s*usage\?\.creditsCharged \?\? null\)/.test(STATUS));
const UI = stripComments(readFileSync("src/components/website-builder/website-builder-workspace.tsx", "utf8"));
check("the preview mounts the timeline", /<AiJobTimeline\b[\s\S]{0,80}kind:\s*"website",\s*timeline:\s*previewTimeline/.test(UI));
check("the poll keeps the steps it is given, through the guard", /setTimelines\(\(prev\) => \(\{ \.\.\.prev, \[id\]: clientWebsiteTimeline\(record\.timeline\) \}\)\)/.test(UI));
check("the live line names the real phase before any rotating message", /\{liveStepText \?\? t\(PROGRESS_MESSAGE_KEYS\[progressMessageIndex\]\)\}/.test(UI));
check("the phases are translated, not shown as keys", /labelFor=\{\(label\) => \(isWebsiteStep\(label\) \? tSteps\(WEBSITE_STEP_MESSAGE\[label\]\) : null\)\}/.test(UI));
const CARD = stripComments(readFileSync("src/components/ui/ai-job-timeline.tsx", "utf8"));
check("the card words every evidence key", EVIDENCE_KEYS.every((k) => new RegExp(`\\b${k}: "timeline\\.evidence\\.${k}"`).test(CARD)));

console.log("\n== 7. the column, and the probe that says when it is missing ==");
const MIG = "supabase/migrations/20261008000000_website_timeline.sql";
const migSql = existsSync(MIG) ? stripComments(readFileSync(MIG, "utf8")) : "";
check("the migration adds user_websites.timeline, safe to run twice", /alter table public\.user_websites\s+add column if not exists timeline jsonb/i.test(migSql));
const CANARIES = stripComments(readFileSync("src/lib/health/schema-canaries.ts", "utf8"));
check(
  "/api/health has a canary for it",
  /table:\s*"user_websites",\s*column:\s*"timeline",\s*migration:\s*"20261008000000_website_timeline\.sql"/.test(CANARIES)
);

const locales = ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"];
for (const l of locales) {
  const m = JSON.parse(readFileSync(`messages/${l}.json`, "utf8"));
  const steps = m?.aiSteps?.website ?? {};
  const ev = m?.aiSteps?.timeline?.evidence ?? {};
  check(
    `${l}: the five phases are worded, and pages and photos carry the count`,
    WEBSITE_STEPS.every((s) => typeof steps[s] === "string" && steps[s].length > 0) &&
      ["pages", "photos"].every((k) => typeof ev[k] === "string" && ev[k].includes("#"))
  );
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
