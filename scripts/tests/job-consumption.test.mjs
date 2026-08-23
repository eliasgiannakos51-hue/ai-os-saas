// "I started a build, changed page, came back — and it charged me twice."
//
// THE BUG, precisely. Background jobs already survived the page closing:
// the worker finished and the row recorded the draft. But the only query
// that could lead a returning page back to its work — /api/jobs?kind=… —
// asked for `status in ('queued','running')` and nothing else. A job that
// FINISHED while the user was elsewhere therefore answered "nothing here".
// The draft existed. It was paid for. No screen in the app could reach it.
// The only move left was to ask for the same thing again, and that second
// ask was a second real charge.
//
// The fix is not "return finished jobs too" — on its own that trades a
// double charge for a preview that reappears on every page open for the
// rest of time. It is a record of whether the user has SEEN the result:
// ai_jobs.consumed_at, written the moment a preview renders or is
// discarded, and a 24-hour ceiling on top of it so a day-old draft never
// ambushes anyone.
//
// This checks the rule itself over the FULL cross-product (status ×
// seen × age — 90 combinations, not a sample), then checks that the four
// places which can put a result on a screen actually mark it.
//
// Run: node scripts/tests/job-consumption.test.mjs
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
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const { loadTs } = await import("./load-ts.mjs");
const r = await loadTs("src/lib/jobs/resumable.ts");

const listSrc = readFileSync("src/app/api/jobs/route.ts", "utf8");
const consumeSrc = readFileSync("src/app/api/jobs/[id]/consume/route.ts", "utf8");
const clientSrc = readFileSync("src/lib/jobs/consume.ts", "utf8");
const seenSrc = readFileSync("src/components/jobs/job-seen.tsx", "utf8");
const agentsUi = readFileSync("src/components/agents/agents-workspace.tsx", "utf8");
const filesUi = readFileSync("src/components/files/files-workspace.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260814_job_consumed_at.sql", "utf8");

const NOW = new Date("2026-08-14T12:00:00.000Z");
const at = (msAgo) => new Date(NOW.getTime() - msAgo).toISOString();

// ---------------------------------------------------------------------
console.log("== 1. the window is a day, and it is stated once ==");
eq("24 hours in milliseconds", r.JOB_RESULT_WINDOW_MS, 24 * 60 * 60 * 1000);

console.log("\n== 2. THE CROSS-PRODUCT: status × seen × age ==");
// Not a sample. Every combination the row can actually be in, each with
// its expectation written out independently of the implementation.
const STATUSES = ["queued", "running", "done", "failed", "cancelled"];
const SEEN = [
  ["never seen", null],
  ["seen", "2026-08-14T11:59:00.000Z"],
];
const AGES = [
  ["just now", 0],
  ["1 minute", 60_000],
  ["1 hour", 3_600_000],
  ["23h59m", 24 * 3_600_000 - 60_000],
  ["exactly 24h", 24 * 3_600_000],
  ["24h + 1ms", 24 * 3_600_000 + 1],
  ["25 hours", 25 * 3_600_000],
  ["7 days", 7 * 24 * 3_600_000],
  ["dated in the FUTURE (clock skew)", -60_000],
];

let combos = 0;
const wrong = [];
for (const status of STATUSES) {
  for (const [seenLabel, consumed] of SEEN) {
    for (const [ageLabel, ageMs] of AGES) {
      combos++;
      const row = {
        status,
        consumed_at: consumed,
        finished_at: at(ageMs),
        created_at: at(ageMs + 1000),
      };
      // The rule, restated here rather than imported: a finished job, not
      // yet seen, no older than the window. Anything else is not offered.
      const expected = status === "done" && consumed === null && ageMs <= 24 * 3_600_000;
      const actual = r.isResumableRow(row, NOW);
      if (actual !== expected) {
        wrong.push(`${status}/${seenLabel}/${ageLabel}: expected ${expected}, got ${actual}`);
      }
    }
  }
}
check(`all ${combos} combinations agree with the rule`, wrong.length === 0, wrong.slice(0, 8).join("\n        "));

// The four that carry the whole feature, named so a regression says which
// one broke rather than "one of ninety".
check("(β) a finished draft nobody has seen is offered", r.isResumableRow({ status: "done", consumed_at: null, finished_at: at(3_600_000) }, NOW));
check("(δ) once seen, it is not offered again", !r.isResumableRow({ status: "done", consumed_at: at(60_000), finished_at: at(3_600_000) }, NOW));
check("(γ) after 24 hours it is not offered, seen or not", !r.isResumableRow({ status: "done", consumed_at: null, finished_at: at(25 * 3_600_000) }, NOW));
check("a FAILED job is never offered — it was already refunded", !r.isResumableRow({ status: "failed", consumed_at: null, finished_at: at(60_000) }, NOW));

console.log("\n== 2b. the timestamps it is allowed not to have ==");
check(
  "finished_at missing falls back to created_at",
  r.isResumableRow({ status: "done", consumed_at: null, finished_at: null, created_at: at(3_600_000) }, NOW)
);
check(
  "and the fallback still respects the window",
  !r.isResumableRow({ status: "done", consumed_at: null, finished_at: null, created_at: at(48 * 3_600_000) }, NOW)
);
// Undateable means un-ageable, and rule (γ) is absolute about the window.
check("no timestamp at all is not offered", !r.isResumableRow({ status: "done", consumed_at: null }, NOW));
check("an unparseable one is not offered", !r.isResumableRow({ status: "done", consumed_at: null, finished_at: "not-a-date" }, NOW));
check("a null row is not offered", !r.isResumableRow(null, NOW));
// consumed_at is tested for truthiness, not for being a valid date: a
// driver or stub answering `true` must not re-offer a seen result.
check("consumed_at = true counts as seen", !r.isResumableRow({ status: "done", consumed_at: true, finished_at: at(60_000) }, NOW));

console.log("\n== 3. which job a returning page adopts (cross-product of pairs) ==");
// updated_at is on every fixture ON PURPOSE. It is the heartbeat, and it is
// what separates a job that is still working from one whose worker the
// platform killed — a distinction this rule did not make, which is how a
// three-day-old corpse outranked a build that had finished an hour ago and
// been paid for.
const CANDIDATES = {
  running: { id: "running", status: "running", consumed_at: null, created_at: at(10 * 60_000), updated_at: at(20_000), finished_at: null },
  queued: { id: "queued", status: "queued", consumed_at: null, created_at: at(9 * 60_000), updated_at: at(15_000), finished_at: null },
  // Still "running" by status, silent for three days. Not spending
  // anything, never going to answer.
  deadRunning: { id: "deadRunning", status: "running", consumed_at: null, created_at: at(72 * 3_600_000), updated_at: at(72 * 3_600_000), finished_at: null },
  // Queued for three days: the kick never landed and never will.
  // 71 hours, not 72: two fixtures sharing a created_at make the tie-break
  // a coin flip and the expectation order-dependent, which tests the
  // engine's sort stability rather than the rule.
  deadQueued: { id: "deadQueued", status: "queued", consumed_at: null, created_at: at(71 * 3_600_000), updated_at: at(71 * 3_600_000), finished_at: null },
  unseen: { id: "unseen", status: "done", consumed_at: null, created_at: at(8 * 60_000), updated_at: at(7 * 60_000), finished_at: at(7 * 60_000) },
  seen: { id: "seen", status: "done", consumed_at: at(60_000), created_at: at(6 * 60_000), updated_at: at(5 * 60_000), finished_at: at(5 * 60_000) },
  stale: { id: "stale", status: "done", consumed_at: null, created_at: at(30 * 3_600_000), updated_at: at(30 * 3_600_000), finished_at: at(30 * 3_600_000) },
  failed: { id: "failed", status: "failed", consumed_at: null, created_at: at(4 * 60_000), updated_at: at(3 * 60_000), finished_at: at(3 * 60_000) },
};
// LIVE (3) beats UNSEEN-FINISHED (2) beats DEAD-ACTIVE (1) beats nothing.
// The dead row is still offered when there is nothing better — adopting it
// is what gets it reaped and the credit hold given back — but it must
// never stand in front of work the user has already paid for.
const RANK = {
  running: 3, queued: 3,
  unseen: 2,
  deadRunning: 1, deadQueued: 1,
  seen: 0, stale: 0, failed: 0,
};
const names = Object.keys(CANDIDATES);
let pairs = 0;
const pairWrong = [];
for (const a of names) {
  for (const b of names) {
    for (const order of [0, 1]) {
      pairs++;
      const rows = order === 0 ? [CANDIDATES[a], CANDIDATES[b]] : [CANDIDATES[b], CANDIDATES[a]];
      const picked = r.pickResumableJob(rows, NOW);
      // Highest rank wins; a tie is broken by created_at (newest first),
      // which is what makes "the one still spending credits" beat "the one
      // that finished a minute ago" whichever order they arrive in.
      const best = Math.max(RANK[a], RANK[b]);
      let expected = null;
      if (best > 0) {
        const contenders = [a, b].filter((n) => RANK[n] === best);
        expected = contenders.sort(
          (x, y) => Date.parse(CANDIDATES[y].created_at) - Date.parse(CANDIDATES[x].created_at)
        )[0];
      }
      const got = picked?.id ?? null;
      if (got !== expected) pairWrong.push(`[${a},${b}] order=${order}: expected ${expected}, got ${got}`);
    }
  }
}
check(`all ${pairs} orderings pick the right job`, pairWrong.length === 0, pairWrong.slice(0, 8).join("\n        "));

// The case the ordering exists for, stated on its own: two jobs overlap,
// the SECOND finishes first, and the page must attach to the one still
// spending money rather than to the newer finished row.
const overlapping = r.pickResumableJob(
  [
    // Started 20 minutes ago and wrote 10 seconds ago: alive.
    { id: "still-going", status: "running", created_at: at(20 * 60_000), updated_at: at(10_000), consumed_at: null },
    { id: "finished-later", status: "done", created_at: at(2 * 60_000), finished_at: at(60_000), consumed_at: null },
  ],
  NOW
);
eq("an older LIVE job beats a newer finished one", overlapping?.id, "still-going");

// THE MIRROR, and the bug. Same two rows, except the "running" one has
// written nothing for three days. Preferring it means telling the user
// their build stalled when it actually finished, and charging them again
// for the draft sitting right there.
const masked = r.pickResumableJob(
  [
    { id: "dead-worker", status: "running", created_at: at(72 * 3_600_000), updated_at: at(72 * 3_600_000), consumed_at: null },
    { id: "finished-build", status: "done", created_at: at(2 * 60_000), finished_at: at(60_000), consumed_at: null },
  ],
  NOW
);
eq("a DEAD 'running' job does NOT mask a finished build", masked?.id, "finished-build");

// ...and the same for a job that was queued and never picked up.
const neverStarted = r.pickResumableJob(
  [
    { id: "never-kicked", status: "queued", created_at: at(72 * 3_600_000), updated_at: at(72 * 3_600_000), consumed_at: null },
    { id: "finished-build", status: "done", created_at: at(2 * 60_000), finished_at: at(60_000), consumed_at: null },
  ],
  NOW
);
eq("a job QUEUED three days ago does not either", neverStarted?.id, "finished-build");

// The dead row is not thrown away: with nothing else on offer it is still
// adopted, because adopting it is what reaps it and returns the hold.
const onlyDead = r.pickResumableJob(
  [{ id: "dead-worker", status: "running", created_at: at(72 * 3_600_000), updated_at: at(72 * 3_600_000), consumed_at: null }],
  NOW
);
eq("with nothing better, the dead job IS adopted (so it gets reaped)", onlyDead?.id, "dead-worker");

// One definition of "dead", shared with the reaper. Two would drift, and a
// row this rule called alive while the reaper called it dead is exactly
// the row that masks a finished build forever.
check(
  "staleness comes from isJobStale, not a second copy of the rule",
  /import \{ isJobStale \} from "@\/lib\/jobs\/job-types"/.test(
    readFileSync("src/lib/jobs/resumable.ts", "utf8")
  )
);
{
  const jt = await loadTs("src/lib/jobs/job-types.ts");
  const boundary = jt.JOB_STALE_MS;
  const justAlive = { id: "x", status: "running", created_at: at(boundary + 60_000), updated_at: at(boundary - 1000), consumed_at: null };
  const justDead = { id: "x", status: "running", created_at: at(boundary + 60_000), updated_at: at(boundary + 1000), consumed_at: null };
  check(`a heartbeat ${Math.round(boundary / 60000)}m-1s old is alive`, r.isLiveRow(justAlive, NOW) === true);
  check(`a heartbeat ${Math.round(boundary / 60000)}m+1s old is dead`, r.isLiveRow(justDead, NOW) === false);
  check("a finished row is never 'live'", r.isLiveRow(CANDIDATES.unseen, NOW) === false);
}

check("nothing to resume returns null", r.pickResumableJob([], NOW) === null);
check("all-null candidates return null", r.pickResumableJob([null, undefined], NOW) === null);
// Two rows with no usable created_at must not produce a NaN comparator,
// which leaves the array in whatever order the engine happened to reach.
const undateable = r.pickResumableJob(
  [
    { id: "a", status: "done", consumed_at: null, finished_at: at(60_000) },
    { id: "b", status: "done", consumed_at: null, finished_at: at(120_000) },
  ],
  NOW
);
check("undateable rows still resolve to one of them, not to undefined", undateable !== null && ["a", "b"].includes(undateable.id));

console.log("\n== 3b. the list route reaps the corpse instead of serving it ==");
// The rule above stops a dead row masking a finished build. This is the
// other half: the dead row still holds credits, and until something polls
// it nothing gives them back. api/jobs/[id] reaps, but only for a job the
// page ADOPTED — and now that a finished build outranks the corpse, the
// corpse would never be adopted at all.
check("the list route imports the reaper", /import \{ reapJob \}/.test(listSrc));
check("...and asks whether the active row is stale", /isJobStale\(/.test(listSrc));
check(
  "...reaping it before the pick, not after",
  listSrc.indexOf("reapJob({") > 0 && listSrc.indexOf("reapJob({") < listSrc.indexOf("pickResumableJob(")
);
check(
  "...and marks the reaped row failed, so it cannot be picked",
  /status: "failed", error: "stalled", credits_charged: 0/.test(listSrc)
);

console.log("\n== 4. /api/jobs asks both questions ==");
check("it still returns work in flight", /\.in\("status", \["queued", "running"\]\)/.test(listSrc));
check("AND finished work that has never been seen", /\.eq\("status", "done"\)[\s\S]{0,80}\.is\("consumed_at", null\)/.test(listSrc));
check("the choice between them is the tested rule, not an inline condition", /pickResumableJob\(/.test(listSrc));
check("read through the user's own client, so RLS scopes it", /createClient\(\)/.test(listSrc) && !/createAdminClient/.test(listSrc));
// A page resuming a finished build has to restore what was ASKED as well
// as what came back, or answering the builder's clarifying questions
// sends the answers with no question attached to them.
check("the row carries the original input back", /input: row\.input/.test(listSrc));
check("and whether it has been seen", /consumedAt: row\.consumed_at/.test(listSrc));
// PostgREST fails the WHOLE query when a filtered column does not exist.
// One clever or=() would therefore 500 every page open on a deployment
// that shipped before the SQL was applied.
check("the new column is named in its own query, not merged into one", /TWO NARROW QUERIES/.test(listSrc));
check("and a missing column degrades instead of failing the page", /42703/.test(listSrc));
check("with the migration named in the log, so the fix is obvious", /20260814_job_consumed_at\.sql/.test(listSrc));

console.log("\n== 5. marking a result seen is owner-checked ==");
check("ownership is decided by RLS, not by an admin read", /const \{ data: job, error \} = await supabase[\s\S]{0,120}\.from\("ai_jobs"\)/.test(consumeSrc));
check("a job that is not yours is 404, not 403", /status: 404/.test(consumeSrc) && !/status: 403/.test(consumeSrc));
check("no session is 401", /status: 401/.test(consumeSrc));
check("the write goes through the admin client — ai_jobs has no update policy", /createAdminClient\(\)/.test(consumeSrc));
check("and only ever touches consumed_at", /\.update\(\{ consumed_at: consumedAt \}\)/.test(consumeSrc));
check("conditioned on it still being null, so the FIRST sighting is the one recorded", /\.is\("consumed_at", null\)/.test(consumeSrc));
check("marking twice is a success, not an error", /alreadyConsumed/.test(consumeSrc));
// It is a mark, not a delete: the result, the credits and the GDPR export
// all stay exactly as they were.
check("nothing is deleted", !/\.delete\(/.test(consumeSrc));
// The update object itself, not "somewhere later in the file" — the first
// version of this assertion sliced to the end and tripped over the 500
// reply's `status:`, which proved nothing about the write.
const updateObjects = [...consumeSrc.matchAll(/\.update\(\{([^}]*)\}\)/g)].map((m) => m[1].trim());
check(
  `the only write is consumed_at (${updateObjects.length} update call)`,
  updateObjects.length === 1 && updateObjects[0] === "consumed_at: consumedAt",
  JSON.stringify(updateObjects)
);

console.log("\n== 6. the client marks it exactly where the user sees it ==");
check("JobSeen renders nothing", /return null;/.test(seenSrc));
check("and reports on mount", /useEffect\(\(\) => \{[\s\S]{0,80}markJobConsumed/.test(seenSrc));
check("a duplicate mark is suppressed in-page", /reported\.has\(jobId\)/.test(clientSrc));
check("but a FAILED mark is retried rather than remembered", /reported\.delete\(jobId\)/.test(clientSrc));
check("and a non-2xx counts as failed", /response\.ok/.test(clientSrc));
check("the request survives the page being left", /keepalive: true/.test(clientSrc));

console.log("\n== 7. every screen that can show a result marks it ==");
// agent_build — the draft, which is the one that was costing money twice.
check("the agents preview carries JobSeen INSIDE it", /THE MOMENT THE USER SEES IT[\s\S]{0,200}<JobSeen jobId=\{resultJobId\}/.test(agentsUi));
check("so do the clarifying questions", /<JobSeen jobId=\{resultJobId\} \/>[\s\S]{0,200}<ClarificationQuestions/.test(agentsUi));
check("(δ) Discard marks it immediately", /Explicit discard[\s\S]{0,200}markJobConsumed\(resultJobId\)/.test(agentsUi));
check("closing the create panel does too", /function resetCreate\(\) \{[\s\S]{0,120}markJobConsumed\(resultJobId\)/.test(agentsUi));
check("a completed build with nothing to render is marked, or it returns forever", /addToast\(result\.error \?\? t\("buildError"\), "error"\);[\s\S]{0,80}markJobConsumed\(job\.id\)/.test(agentsUi));
check("agent_run's outcome is marked when it is announced", /markJobConsumed\(runJob\.id\)/.test(agentsUi));
// file_ask — the answer, lost the same way for the same reason.
check("the files answer carries JobSeen", /<JobSeen jobId=\{answer\.jobId\} \/>/.test(filesUi));
check("and the files page resumes an answer it never showed", /kind=file_ask/.test(filesUi));
check("attaching to one still running rather than starting a second", /watchJob\(String\(job\.id\)/.test(filesUi));
check("the resumed answer is built by the same function as the inline one", /answerFromResult\(/.test(filesUi) && (filesUi.match(/answerFromResult\(/g) ?? []).length >= 3);
// The agents page must restore the sentence that was typed, or a resumed
// clarification round answers a question that is no longer attached to
// anything.
check("a resumed build restores what was asked", /input as \{ request\?: unknown \}/.test(agentsUi));

console.log("\n== 8. the migration ==");
check("the column is added if not exists", /add column if not exists consumed_at timestamptz/.test(migration));
check("the resume query has an index", /create index if not exists ai_jobs_unconsumed_idx/.test(migration));
check("partial, so it stays small as finished jobs pile up", /where consumed_at is null and status = 'done'/.test(migration));
check("the column is documented on the table itself", /comment on column public\.ai_jobs\.consumed_at/.test(migration));
// The rule this repository learned the hard way.
check("no DROP TABLE", !/drop\s+table/i.test(migration));
check("no TRUNCATE", !/truncate/i.test(migration));
check("no unqualified DELETE", !/delete\s+from/i.test(migration));
check("no new write policy for the browser", !/for update/i.test(migration) && !/for insert/i.test(migration));

console.log("\n== 9. nobody still reads a job's answer off the HTTP response ==");
// THE SECOND DOUBLE CHARGE, found by reading rather than from the list.
//
// When mission planning moved into a background job, /api/mission/plan
// stopped answering `{ planned: true, mission }` and started answering
// 202 `{ jobId }`. Two callers were never updated and kept testing
// `data.planned`, which is now never present — so BOTH reported "Could
// not create a plan." on every single press, while the worker went on to
// plan the mission and charge for it. A user told it failed presses it
// again. That is a second real charge for a plan they already own, and it
// happened every time, not in a race.
//
// The rule, checked structurally so it cannot come back: a component that
// names one of these routes must treat the reply as a JOB.
const CONVERTED_ROUTES = ["/api/mission/plan", "/api/create", "/api/files/ask", "/api/agents/build"];
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = `${dir}/${entry}`;
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const stale = [];
let callerCount = 0;
for (const file of walk("src")) {
  if (file.startsWith("src/app/api/")) continue;
  const src = stripComments(readFileSync(file, "utf8"));
  for (const route of CONVERTED_ROUTES) {
    if (!src.includes(`"${route}"`)) continue;
    callerCount++;
    // Either it awaits the job (startAndWatchJob/watchJob) or it takes the
    // job id and watches the row itself. Reading `.planned`/`.built` off
    // the 202 is neither.
    const treatsAsJob = /startAndWatchJob\(/.test(src) || /jobId/.test(src);
    if (!treatsAsJob) stale.push(`${file} calls ${route} but reads the reply as if it were the answer`);
  }
}
check(`all ${callerCount} callers of a converted route treat it as a job`, stale.length === 0, stale.join("\n        "));
// The two that were wrong, named individually so a regression says which.
const tradingBtn = readFileSync("src/components/trading-workflow/trading-mission-button.tsx", "utf8");
const studioHook = readFileSync("src/lib/create-studio/use-create-studio.ts", "utf8");
check("the Trading Workflow mission button awaits the job", /startAndWatchJob\("\/api\/mission\/plan"/.test(tradingBtn));
check("and no longer calls the route with a bare fetch", !/fetch\("\/api\/mission\/plan"/.test(stripComments(tradingBtn)));
check("Create Studio's mission branch awaits the job", /startAndWatchJob\("\/api\/mission\/plan"/.test(studioHook));
check("and no longer calls the route with fetchWithAuthRetry", !/fetchWithAuthRetry\("\/api\/mission\/plan"/.test(stripComments(studioHook)));
// "Still running" is the worker being fine and the page having stopped
// watching. Reporting it as a failure is what invites the duplicate press.
check("a 'still running' outcome is not reported as a failure", /still_running/.test(tradingBtn) && /still_running/.test(studioHook));

console.log("\n== 10. website generation: checked, and it does NOT have this bug ==");
// The brief asked for every background action with a result to be
// checked, website generation included. It works differently and is
// already safe, so nothing was changed — and that claim is asserted here
// rather than left as a sentence in a report.
const websiteUi = readFileSync("src/components/website-builder/website-builder-workspace.tsx", "utf8");
check(
  "a generation still in flight when the page loads is picked back up",
  /website\.status === "pending" \|\| website\.status === "processing"/.test(websiteUi) &&
    /pollWebsiteStatus\(website\.id\)/.test(websiteUi)
);
check(
  "and a FINISHED one cannot be lost, because it is a row in the server-rendered list",
  /initialWebsites/.test(websiteUi)
);
check("a fast double-submit resolves to the same row instead of a second charge", /duplicateSuppressed/.test(websiteUi));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
