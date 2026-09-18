// ONCE A HOLD IS TAKEN, EVERY EXIT HAS TO END IT.
//
// A credit reservation is a promise with two legal endings: SETTLE (the
// action happened; charge the measured cost and give the rest back) or
// RELEASE (it did not; give it all back). There is no third ending, and
// the expensive failures in this codebase have all been a route that
// found one anyway.
//
// WHAT THIS ROUND FOUND, on 2026-09-18, reading the 23 multi-write routes
// the first pass had not reached:
//
//   settling a zero is not releasing.  api/import/paste,
//     api/import/csv/analyse and api/research all settle straight after
//     their AI call and judge the outcome afterwards. That is right when
//     the call RETURNED — all three record usage before they decide the
//     answer is unusable, so an unusable answer is real tokens — and
//     wrong when it threw: the accumulator is empty, and settling it
//     wrote a cost-log row for an action that never ran, a
//     billing:zeroCostSettlement row, a billing:marginBelowTarget row
//     (a null margin is not `< 4`, which is why that alert fires on null)
//     and a margin-alert EMAIL to the owner. Per failed request, during
//     an outage, across every account at once.
//     releaseReservation's own doc comment already stated the rule —
//     "distinct from settling with a zero cost so the cost log doesn't
//     fill with rows for actions that never ran" — and settleReservation,
//     ten lines above it in the same file, did the opposite.
//
//   the charge landed before the result did.  api/data-analysis/[id]/analyse
//     settled, then wrote the findings and only LOGGED a failed write.
//     The findings were in the response, so the screen looked right; they
//     were nowhere in the database, so a refresh showed an unanalysed
//     file on an account that had just paid to analyse it.
//
// WHERE THE FIX WENT, and why it is a helper rather than a rule for
// authors to remember: settleReservation is the ONE function all forty
// call sites reach, so the case "no call completed" is decided there,
// once. The routes above needed no change and the forty-first will not
// either.
//
// WHAT THIS FILE DOES NOT CLAIM. It does not prove every reservation is
// correctly ended on every path — that needs control flow this cannot
// see. It holds the helper's default, the population the question is
// asked of, and a register of every file that reserves without releasing
// in its own source, each carrying the mechanism that ends its holds and
// a check that the mechanism is really there.
//
// Run: node scripts/tests/reservation-lifecycle.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let pass = 0,
  fail = 0;
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith(".ts")) files.push(full.replace(/\\/g, "/"));
  }
})("src");

// Comments stripped everywhere. This file's subject is prose-heavy —
// several routes explain their settlement in paragraphs that name both
// functions — and an unstripped scan reads the explanation as the code.
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SRC = new Map(files.map((f) => [f, strip(readFileSync(f, "utf8"))]));

const RESERVATIONS = "src/lib/billing/reservations.ts";
const reservations = SRC.get(RESERVATIONS) ?? "";
check(`${RESERVATIONS} was read`, reservations.length > 1000, "the path moved — nothing below means anything");

// ---------------------------------------------------------------------
// 1. THE HELPER DOES THE RIGHT THING BY DEFAULT.
// ---------------------------------------------------------------------
const settleAt = reservations.indexOf("export async function settleReservation");
const rpcAt = reservations.indexOf('admin.rpc("settle_reservation"', settleAt);
const releaseBranchAt = reservations.indexOf("if (costs.callCount === 0) {", settleAt);
check(
  "settleReservation and its RPC were located",
  settleAt !== -1 && rpcAt > settleAt,
  "re-anchor before trusting the two checks below"
);
check(
  "a settlement that measured no call releases instead",
  releaseBranchAt > settleAt &&
    /if \(costs\.callCount === 0\) \{[\s\S]{0,200}await releaseReservation\(userId, reservationId\)/.test(
      reservations.slice(releaseBranchAt)
    ),
  "without this, a thrown AI call settles a zero: a cost-log row for an action that never ran, two production_errors rows, and a margin-alert email to the owner, per request, during an outage"
);
check(
  "…and it does so BEFORE the RPC, not after",
  releaseBranchAt !== -1 && releaseBranchAt < rpcAt,
  "the row is written by the RPC, so a release that happens after it does not stop the row from existing — which is the whole defect"
);
check(
  "…and says so in its result, so a caller can tell it from a failed RPC",
  /nothingMeasured: true/.test(reservations) && /nothingMeasured: boolean/.test(reservations),
  "settled:false already means 'the RPC failed'. Reusing it for 'nothing should have been charged' makes an error and a correct outcome indistinguishable to every caller."
);
// The sentence this rule was taken from. If it goes, the reason above
// has moved somewhere else and this section needs re-deriving.
check(
  "releaseReservation still states the rule the branch implements",
  /doesn't fill with rows for actions that never ran/.test(readFileSync(RESERVATIONS, "utf8")),
  "the doc comment that says settling a zero is the wrong ending has been removed"
);

// ---------------------------------------------------------------------
// 2. THE POPULATION.
// ---------------------------------------------------------------------
const reserves = files.filter((f) => f !== RESERVATIONS && /\breserveCredits\s*\(/.test(SRC.get(f)));
const releasesItself = (f) => /\breleaseReservation\s*\(/.test(SRC.get(f));
const withoutRelease = reserves.filter((f) => !releasesItself(f));

check(
  `files that take a credit hold (${reserves.length})`,
  reserves.length >= 20,
  "the detector matched almost nothing, so the register below is a register of an empty set"
);
check(
  "…and that is a minority of the tree, not all of it",
  reserves.length < files.length / 4,
  "everything counts as reserving — the detector is matching something it should not"
);

// ---------------------------------------------------------------------
// 3. EVERY FILE THAT RESERVES WITHOUT RELEASING, AND WHAT ENDS ITS HOLDS.
//
// Two mechanisms, both verified below rather than believed.
// ---------------------------------------------------------------------
const REGISTER = {
  "src/app/api/import/csv/analyse/route.ts": {
    mechanism: "settles_unconditionally",
    reason:
      "Every path from the reserve reaches the same settleReservation — proposeMapping records usage before it judges the proposal, so a no_match is a completed call worth charging for, and a call that threw leaves the accumulator empty and is released by the helper.",
  },
  "src/app/api/import/paste/route.ts": {
    mechanism: "settles_unconditionally",
    reason:
      "Same shape as import/csv/analyse: extractFromPaste records usage the moment the model answers, so reason:'invalid' is real tokens and reason:'api_error' never fed the accumulator at all.",
  },
  "src/app/api/insights/generate/route.ts": {
    mechanism: "settles_unconditionally",
    reason:
      "narrateFindings returns per-finding results rather than a failure, so the settle is reached on every path that took a hold.",
  },
  "src/app/api/research/route.ts": {
    mechanism: "settles_unconditionally",
    reason:
      "planResearch records usage before deciding the plan is unusable, so 'no_plan' is a real charge; the throw path is the helper's case.",
  },
  "src/app/api/research/[id]/run/route.ts": {
    mechanism: "handed_on",
    owner: "src/lib/research/run-research.ts",
    reason:
      "The id is written onto research_reports.reservation_id and handed to the chunked runner, which outlives this request — a release here would end a hold the run still needs.",
  },
};

check(
  `files reserving without their own release (${withoutRelease.length})`,
  withoutRelease.length > 0,
  "if this is zero the register is dead weight and should be deleted rather than left to rot"
);

// BOTH WAYS, so an entry cannot outlive the thing it excuses.
for (const f of withoutRelease) {
  check(
    `${f.replace("src/app/", "")} is registered`,
    Object.prototype.hasOwnProperty.call(REGISTER, f),
    "it takes a credit hold and never releases one. Add it with the mechanism that ends its holds, or give it a release."
  );
}
for (const f of Object.keys(REGISTER)) {
  check(
    `register entry ${f.replace("src/app/", "")} is still needed`,
    withoutRelease.includes(f),
    SRC.has(f)
      ? "this file now releases its own holds (or stopped reserving) — delete the entry rather than leaving a reason for something that is no longer true"
      : "the file does not exist"
  );
}

// A reason must be a REASON — the same bar api/route-contract holds its
// register to. A sentence that reassures instead of naming a mechanism
// is how a register becomes a list of things nobody rechecked.
const ASSURANCE = /\b(safe|fine|correct|handled|no (issue|problem)|as (intended|expected)|by design)\b/i;
for (const [f, entry] of Object.entries(REGISTER)) {
  check(
    `${f.replace("src/app/", "")}: the reason names a mechanism`,
    entry.reason.length >= 60 && !ASSURANCE.test(entry.reason),
    `"${entry.reason}" reads as reassurance rather than something a reader can go and check`
  );
}

// MECHANISM 1 — settles unconditionally. Checkable: no exit between the
// line that stores the reservation id and the settle that ends it.
for (const [f, entry] of Object.entries(REGISTER)) {
  if (entry.mechanism !== "settles_unconditionally") continue;
  const src = SRC.get(f) ?? "";
  const takes = src.search(/reservationId\s*=\s*reservation\.reservationId\s*;/);
  const settles = src.search(/settleReservation\s*\(\s*\{/);
  check(
    `${f.replace("src/app/", "")}: the hold and the settle were both located`,
    takes !== -1 && settles > takes,
    "the shape this entry describes is not in the file any more"
  );
  const between = takes === -1 || settles < 0 ? "x return NextResponse" : src.slice(takes, settles);
  check(
    `${f.replace("src/app/", "")}: no exit between taking the hold and settling it`,
    !/return\s+NextResponse/.test(between),
    "a return added in this span leaves the hold outstanding until the daily sweep, and the register entry that excuses this file's missing release stops being true"
  );
}

// MECHANISM 2 — handed on. Checkable: the named owner releases.
for (const [f, entry] of Object.entries(REGISTER)) {
  if (entry.mechanism !== "handed_on") continue;
  const owner = SRC.get(entry.owner);
  check(
    `${f.replace("src/app/", "")}: its named owner ${entry.owner.replace("src/", "")} releases`,
    Boolean(owner) && /\breleaseReservation\s*\(/.test(owner),
    "the file this one hands its reservation to does not release one, so nothing ends the hold before the daily sweep"
  );
}

// ---------------------------------------------------------------------
// 4. THE CHARGE COMES AFTER THE RESULT IS STORED.
//
// Not a general rule — most routes legitimately write state before
// settling, and api/websites/generate/process deliberately writes its
// FINAL status after settlement so the client cannot read a stale
// balance. This holds the two routes where the ordering was the defect.
// ---------------------------------------------------------------------
const ANALYSE = "src/app/api/data-analysis/[id]/analyse/route.ts";
const analyse = SRC.get(ANALYSE) ?? "";
const saveAt = analyse.indexOf('.update({ findings: parsed.findings');
const settleAnalyseAt = analyse.indexOf("settleReservation({");
check(
  `${ANALYSE.replace("src/app/api/", "")}: the findings save was located`,
  saveAt !== -1 && settleAnalyseAt !== -1,
  "re-anchor before trusting the two below"
);
check(
  "the findings are saved BEFORE the charge",
  saveAt !== -1 && settleAnalyseAt !== -1 && saveAt < settleAnalyseAt,
  "settling first is how an account paid for an analysis that a refresh showed as never run"
);
check(
  "…and a save that fails releases the hold rather than logging on",
  /if \(saveError\) \{[\s\S]{0,400}releaseReservation\(user\.id, reservationId\)/.test(analyse),
  "the response carries the findings, so logging-and-continuing looks right on screen and leaves nothing behind"
);
// The route this rule was copied from, which says it in prose.
const PROCESS = "src/app/api/websites/generate/process/route.ts";
check(
  "the route this ordering was taken from still states it",
  readFileSync(PROCESS, "utf8").includes("the AI call succeeded AND the result is durably saved"),
  `${PROCESS} no longer carries the sentence the check above cites as its precedent`
);

// ---------------------------------------------------------------------
// 5. THE AGENT THAT COULD NOT STOP BEING DUE.
//
// Not a reservation, the same disease: a write whose failure nobody
// read, guarding an outcome the comment beside it names.
// ---------------------------------------------------------------------
const AGENT_CRON = "src/app/api/cron/agent-runs/route.ts";
const agentCron = SRC.get(AGENT_CRON) ?? "";
check(
  `${AGENT_CRON.replace("src/app/api/", "")}: rescheduling goes through one checked helper`,
  /async function rescheduleAgent\(/.test(agentCron) &&
    /const \{ error \} = await admin\.from\("user_agents"\)\.update\(patch\)/.test(agentCron),
  "two bare updates wrote next_run_at and neither looked at the result"
);
check(
  "…and the helper ACTS on the error rather than merely destructuring it",
  /const \{ error \} = await admin\.from\("user_agents"\)\.update\(patch\)[\s\S]{0,80}\n\s*if \(error\) \{[\s\S]{0,240}logApiError[\s\S]{0,160}return false;/.test(
    agentCron
  ),
  "`const { error } =` with nothing reading it is the exact shape of the two writes this helper replaced — the result has to reach a log AND the caller, or the count below is always zero"
);
check(
  "…and no bare next_run_at write remains beside it",
  !/\.from\("user_agents"\)\s*\n?\s*\.update\(\{[^}]*next_run_at/.test(agentCron),
  "a second, unchecked path to the same column is how the helper stops covering the case it was written for"
);
check(
  "…and a reschedule that did not land is counted into the response",
  /rescheduleFailures\+\+/.test(agentCron) && /rescheduleFailures,/.test(agentCron),
  "the batch branch has already submitted and charged by the time it reschedules, so an agent left due resubmits and recharges every fifteen minutes — logged is not enough, it has to be visible from the cron's own output"
);

// ---------------------------------------------------------------------
// CONTROLS — driving the detectors rather than restating them.
// ---------------------------------------------------------------------
check("control: the assurance filter rejects reassurance", ASSURANCE.test("this one is safe by design"));
check(
  "control: the assurance filter accepts a mechanism",
  !ASSURANCE.test("the id is written onto research_reports.reservation_id and handed to the chunked runner")
);
check("control: the comment stripper runs", strip('// await releaseReservation(a, b)\nconst x = 1;').indexOf("releaseReservation") === -1);

console.log(
  `\n        ${reserves.length} files take a credit hold · ${withoutRelease.length} never release in their own source · ${Object.keys(REGISTER).length} registered`
);
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
