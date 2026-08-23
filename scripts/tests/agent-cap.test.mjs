// The agent activation cap — ACTIVE rows against the plan, total rows
// against a generous multiple of it, checked at every place a row can
// become (or stay) active: create, agent-build's pre-check, and PATCH
// resume.
//
// WHY THIS IS A SOURCE-BASED TEST, not an executed one. checkAgentActivationCap
// (lib/agents/agent-cap.ts) imports "server-only" and createAdminClient —
// a real Supabase client this suite cannot construct offline, and
// test:unit has to stay runnable with no database (see load-ts.mjs:
// loadTsWithDeps would let this file follow that import, but doing so
// here would write a real bundle into node_modules, which
// billing-coverage.test.mjs's "writes nothing into node_modules" check
// exists specifically to catch). So this reads the SOURCE for the
// properties that matter — the ordering of the two checks, the
// multiplier, and that every call site that can move a row into 'active'
// actually calls it — the same shape scripts/tests/bypass-ceiling.test.mjs
// uses for the same reason.
//
// Run: node scripts/tests/agent-cap.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

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

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const SOURCES = walk("src").map((f) => f.split(path.sep).join("/"));
const readSrc = (f) => readFileSync(f, "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const CAP_FILE = "src/lib/agents/agent-cap.ts";
const capSrc = readSrc(CAP_FILE);
const capSrcNoComments = stripComments(capSrc);

console.log("== 1. the function's own math ==");

check("the total-row ceiling is 3x the active cap",
  /TOTAL_ROWS_CEILING_MULTIPLIER\s*=\s*3\b/.test(capSrcNoComments));

{
  // The total ceiling has to be checked BEFORE the active cap: a pile of
  // paused/disabled rows should block on its own terms ("delete some")
  // even when the active count happens to be under cap at this instant.
  // Proven by textual order, not just presence of both branches.
  // Matched with the trailing comma of an actual return object, not the
  // `reason: "active_cap" | "total_ceiling" | "check_failed"` union in the
  // type declaration above the function — the union lists active_cap
  // first regardless of runtime order, which would make this check pass
  // vacuously if it matched that line instead.
  const totalIdx = capSrcNoComments.indexOf('reason: "total_ceiling",');
  const activeIdx = capSrcNoComments.indexOf('reason: "active_cap",');
  check("the total-row ceiling is checked before the active cap",
    totalIdx > -1 && activeIdx > -1 && totalIdx < activeIdx,
    `total_ceiling at ${totalIdx}, active_cap at ${activeIdx}`);
}

check("both counts filter on the caller's own user_id",
  (capSrcNoComments.match(/\.eq\("user_id",\s*userId\)/g) ?? []).length >= 2);

check("the active count also filters status='active'",
  /\.eq\("user_id",\s*userId\)\.eq\("status",\s*"active"\)/.test(capSrcNoComments));

check("a Supabase error on either count fails closed (check_failed), not open",
  /if\s*\(activeResult\.error\s*\|\|\s*totalResult\.error\)/.test(capSrcNoComments) &&
  /reason:\s*"check_failed"/.test(capSrcNoComments));

console.log("\n== 2. the TOCTOU gap is documented, not silently left ==");
check("agent-cap.ts documents the check-then-write race and why it is left unfixed",
  /TOCTOU/.test(capSrc) && /check-then-write/.test(capSrc));

console.log("\n== 3. every place a row can become ACTIVE calls this check ==");
// Three ways a row becomes active: create (api/agents), the agent-build
// pre-check (api/agents/build — before spending on the design call), and
// resuming a paused one (api/agents/[id] PATCH). Enumerated explicitly
// rather than derived, because unlike checkAiCallAllowed there is no
// existing "every AI route calls this" convention to piggyback on — this
// IS that convention's first instance for agent activation.
const EXPECTED_CALL_SITES = [
  "src/app/api/agents/route.ts",
  "src/app/api/agents/build/route.ts",
  "src/app/api/agents/[id]/route.ts",
  // FOUR NOW. Adopting a template creates an ACTIVE agent in one step —
  // no preview, no separate confirm — so it is a fourth way a row
  // becomes active and needs the same cap. This gate is what caught it:
  // the route was written with the check, and the "no OTHER file calls
  // it" assertion below is what proved the inventory had to grow rather
  // than the route being wrong.
  "src/app/api/agents/templates/adopt/route.ts",
];
for (const f of EXPECTED_CALL_SITES) {
  check(`${f} calls checkAgentActivationCap`,
    /checkAgentActivationCap\(/.test(stripComments(readSrc(f))));
}

const allCallers = SOURCES.filter((f) => /checkAgentActivationCap\(/.test(stripComments(readSrc(f))));
check("no OTHER file calls it (the inventory above is exhaustive, not a subset)",
  allCallers.every((f) => EXPECTED_CALL_SITES.includes(f) || f === CAP_FILE),
  allCallers.filter((f) => !EXPECTED_CALL_SITES.includes(f) && f !== CAP_FILE).join("\n        "));

console.log("\n== 4. the PATCH resume only checks on a GENUINE transition into active ==");
// Staying active (no-op edit) or moving to paused never consumes
// capacity and must not be gated — only agent.status !== "active" AND
// the new status === "active" together are a resume.
{
  const patchSrc = stripComments(readSrc("src/app/api/agents/[id]/route.ts"));
  const callIdx = patchSrc.indexOf("checkAgentActivationCap(");
  const guardWindow = patchSrc.slice(Math.max(0, callIdx - 300), callIdx);
  check("the call is guarded by status === \"active\"", /status\s*===\s*"active"/.test(guardWindow));
  check("the call is guarded by agent.status !== \"active\" (i.e. it was NOT already active)",
    /agent\.status\s*!==\s*"active"/.test(guardWindow));
}

console.log("\n== 5. admin accounts are never capped ==");
for (const f of EXPECTED_CALL_SITES) {
  const src = stripComments(readSrc(f));
  const callIdx = src.indexOf("checkAgentActivationCap(");
  const guardWindow = src.slice(Math.max(0, callIdx - 400), callIdx);
  check(`${f}: the call sits inside an isAdmin-false branch`, /isAdmin/.test(guardWindow), guardWindow);
}

console.log("\n== 6. mutation test — the completeness check actually goes red ==");
// Proves check #3 above is not vacuous: a call site that silently drops
// the check must be caught, not waved through because a DIFFERENT file
// still has it.
{
  const patchSrc = readSrc("src/app/api/agents/[id]/route.ts");
  const mutated = patchSrc.replace(
    /const capCheck = await checkAgentActivationCap\(user\.id, cap\);[\s\S]*?\n {8}\}\n {6}\}\n {4}\}/,
    "// mutated out for this test"
  );
  check("the mutation actually removed the call (sanity check on the mutation itself)",
    /checkAgentActivationCap\(/.test(stripComments(patchSrc)) && !/checkAgentActivationCap\(/.test(stripComments(mutated)),
    mutated === patchSrc ? "mutation matched nothing — regex is stale" : undefined);
  check("...and with it removed, the call-site check above would now fail",
    !/checkAgentActivationCap\(/.test(stripComments(mutated)));
}

console.log("\n== the COUNTER shows what the CAP enforces ==");
// THE FOURTH "counter went to 0/100" REPORT. Two separate facts, both
// worth pinning:
//
//   1. 0 after deleting the only agent is CORRECT. Delete is a hard
//      delete and capacity means agents currently scheduled to run.
//   2. What was NOT correct: the UI counted every row (agents.length)
//      while the server caps status='active' rows — so two paused agents
//      on a cap of 2 disabled the create button the server would have
//      allowed, and "2 of 2" was printed next to a limit it did not mean.
{
  const ws = stripComments(readFileSync("src/components/agents/agents-workspace.tsx", "utf8"));
  check(
    "the workspace counts ACTIVE agents",
    /agents\.filter\(\(a\) => a\.status === "active"\)\.length/.test(ws)
  );
  check("the counter renders that count", /agentsUsed", \{ used: activeCount/.test(ws));
  check("and the create button uses it too", /atCapacity = activeCount >= agentCap/.test(ws));
  check("no raw row count is used as capacity", !/atCapacity = agents\.length/.test(ws));
  // The wider ceiling is real and separate, so the total is shown when it
  // differs rather than being folded into the same number.
  check("the total is shown separately when it differs", /agents\.length > activeCount/.test(ws));
  check("with its own label", /agentsTotal", \{ total: agents\.length \}/.test(ws));
  // The server's own rule, restated here so the two cannot drift apart
  // silently: this is the line the UI is now mirroring.
  const capSrc = stripComments(readFileSync("src/lib/agents/agent-cap.ts", "utf8"));
  check(
    "the server still caps on status='active'",
    /\.eq\("status", "active"\)/.test(capSrc)
  );
}

console.log("\n== the monthly EUR ceiling counts a UTC month ==");
{
  const bypass = stripComments(readFileSync("src/lib/billing/bypass-ceiling.ts", "utf8"));
  // The old line built a LOCAL midnight out of UTC year/month, so on a
  // non-UTC host the window started at the wrong hour — which month a
  // spend cap counts must not depend on the deployment's timezone.
  check("the month boundary is built with Date.UTC", /Date\.UTC\(new Date\(\)\.getUTCFullYear\(\)/.test(bypass));
  check("it sums real_cost_eur", /select\("real_cost_eur"\)/.test(bypass));
  check("scoped to the one account", /\.eq\("user_id", userId\)/.test(bypass));
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILED: " + failures.join(" | "));
  process.exit(1);
}
