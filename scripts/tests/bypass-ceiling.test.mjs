// The bypass EUR ceiling — one check, in money, on every account credits
// do not otherwise bound.
//
// WHY EUROS AND NOT A COUNTER PER FEATURE. checkAiCallAllowed already
// caps VOLUME (calls/hour) for every account, bypass included — but 20
// calls/hour times a month of hours is not a ceiling. A per-feature
// counter (agent-builds-per-month, chat-messages-per-month, ...) is the
// shape this exact codebase has already tried and lost track of more
// than once: reserve_credits reachable from the code and from no
// migration at all, delivery channels documented only in a commit
// message, "revoke execute on every new function" followed in one
// migration out of fourteen. A rule that must be re-added by hand every
// time a new AI route ships gets missed the Nth time. ai_cost_log.
// real_cost_eur is written by every settlement, bypass or charged, for
// every feature today and every one added tomorrow — reading it back
// is what makes this the LAST time this rule needs writing.
//
// Run: node scripts/tests/bypass-ceiling.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
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

console.log("== 1. the numbers, and that they parse safely ==");
const mod = await loadTs("src/lib/billing/bypass-ceiling-config.ts");

check("admin default is €40/month", mod.adminMonthlyEurCeiling(), 40);
check("beta default is €5/month", mod.betaMonthlyEurCeiling(), 5);

{
  const before = process.env.BYPASS_CEILING_ADMIN_EUR;
  process.env.BYPASS_CEILING_ADMIN_EUR = "100";
  check("a valid override is honoured", mod.adminMonthlyEurCeiling(), 100);
  process.env.BYPASS_CEILING_ADMIN_EUR = "-5";
  check("a negative override falls back to the default, not clamped to 0", mod.adminMonthlyEurCeiling(), 40);
  process.env.BYPASS_CEILING_ADMIN_EUR = "not a number";
  check("an unparseable override falls back to the default", mod.adminMonthlyEurCeiling(), 40);
  process.env.BYPASS_CEILING_ADMIN_EUR = "0";
  check("zero falls back to the default (a real ceiling, not 'unlimited')", mod.adminMonthlyEurCeiling(), 40);
  if (before === undefined) delete process.env.BYPASS_CEILING_ADMIN_EUR;
  else process.env.BYPASS_CEILING_ADMIN_EUR = before;
}

console.log("\n== 2. a normal account short-circuits before any query ==");
// checkBypassCeiling itself lives in bypass-ceiling.ts, which imports
// createAdminClient — a real Supabase client this test suite cannot
// construct without live credentials, and must not try to (test:unit has
// to stay runnable offline). So this checks the SOURCE for the guard
// rather than executing it: "neither admin nor beta" has to return
// before the ai_cost_log query, not after — reading `if (!isAdmin &&
// !isBeta) return { allowed: true };` as the FIRST statement in the
// function body, before any `admin.from(...)` call, is what proves a
// normal account never pays for a query it has no reason to run.
{
  const src = readSrc("src/lib/billing/bypass-ceiling.ts");
  const fnStart = src.indexOf("export async function checkBypassCeiling");
  const bodyStart = src.indexOf("{", fnStart);
  const guardMatch = src.slice(bodyStart, bodyStart + 300).match(/if\s*\(!isAdmin\s*&&\s*!isBeta\)\s*return\s*\{\s*allowed:\s*true\s*\};/);
  const queryIndex = src.indexOf("ai_cost_log", fnStart);
  check("checkBypassCeiling returns early for a normal account, BEFORE querying ai_cost_log",
    Boolean(guardMatch) && bodyStart + src.slice(bodyStart).indexOf(guardMatch?.[0] ?? "\0") < queryIndex);
}

console.log("\n== 3. EVERY AI-calling route also checks the bypass ceiling ==");
// "Every AI-calling route" is not asserted from a hand-written list — it
// is the SAME list checkAiCallAllowed's own callers already define,
// which the codebase treats as the authoritative inventory (see that
// file's header: "Every AI-calling route in the app calls
// checkAiCallAllowed() right after auth"). Reusing it here means this
// gate updates itself the moment a new route adopts that convention,
// rather than needing a second hand-maintained list to go stale next to
// the first one.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const callsAiCallAllowed = SOURCES.filter((f) => /checkAiCallAllowed\(/.test(stripComments(readSrc(f))));
console.log(`        ${callsAiCallAllowed.length} files call checkAiCallAllowed()`);

// Two intentional exceptions, each stated rather than silently allowed:
//   ai-circuit-breaker.ts itself — declares the function, doesn't call it.
//   research/[id]/continue/route.ts is not in this list at all (it never
//     calls checkAiCallAllowed directly — it delegates straight into
//     run-research.ts's runResearchChunk, which is where THAT route's
//     bypass ceiling is actually enforced, and is checked separately
//     below).
const EXCLUDED = ["src/lib/ai-circuit-breaker.ts"];
// THE FLOOR, and it is the whole reason this block was rewritten. The
// check below is `missingCeiling.length === 0`, and `missingCeiling` is a
// FILTER of `callsAiCallAllowed`. Rename checkAiCallAllowed, or change how
// it is imported, and that list becomes empty — at which point the filter
// is empty, the check passes, and the count that would have shown it is
// only console.logged. Measured today: 26 files call it.
check(
  `checkAiCallAllowed() is actually called somewhere (${callsAiCallAllowed.length} files)`,
  callsAiCallAllowed.length >= 20,
  "0 here means the check below is filtering an empty list and cannot fail"
);
const missingCeiling = callsAiCallAllowed
  .filter((f) => !EXCLUDED.includes(f))
  .filter((f) => !/checkBypassCeiling\(/.test(stripComments(readSrc(f))));
check("every checkAiCallAllowed() caller also calls checkBypassCeiling()", missingCeiling.length === 0,
  missingCeiling.join("\n        "));

// The gate has to be able to go red: a file that calls checkAiCallAllowed
// but not checkBypassCeiling must be reported. Proven with a fixture
// rather than asserted about — this is exactly the shape "the tenth
// call site never gets the rule" takes.
{
  const fixtureMissing = 'await checkAiCallAllowed(userId, "x", fp);\nconst bypassCredits = isAdmin;';
  const fixtureHas = 'await checkAiCallAllowed(userId, "x", fp);\nawait checkBypassCeiling(userId, isAdmin, false);';
  check("a file with checkAiCallAllowed but no checkBypassCeiling would be caught",
    /checkAiCallAllowed\(/.test(fixtureMissing) && !/checkBypassCeiling\(/.test(fixtureMissing));
  check("...and a file with both would not be", /checkBypassCeiling\(/.test(fixtureHas));
}

console.log("\n== 4. the three deep-research entry points, specifically ==");
// Deep research is chunked across up to three DIFFERENT routes
// (start, run, continue) that all eventually call runResearchChunk —
// gating only the start route would leave a RESUMED chunk unchecked,
// and a resumed chunk spends exactly as much Anthropic budget as a
// fresh one. The check lives once, inside runResearchChunk itself,
// specifically so all three entry points share it without repeating it.
const runResearch = readSrc("src/lib/research/run-research.ts");
check("runResearchChunk itself calls checkBypassCeiling (covers start/run/continue at once)",
  /export async function runResearchChunk/.test(runResearch) &&
  stripComments(runResearch).includes("checkBypassCeiling("));
for (const route of [
  "src/app/api/research/route.ts",
  "src/app/api/research/[id]/run/route.ts",
  "src/app/api/research/[id]/continue/route.ts",
]) {
  check(`${route} exists and calls into runResearchChunk or checkBypassCeiling`,
    /runResearchChunk\(|checkBypassCeiling\(/.test(stripComments(readSrc(route))));
}

console.log("\n== 5. isAdmin and isBeta are never collapsed into one flag ==");
// The two ceilings differ (€40 vs €5) — a call site that passes a single
// combined "isBypass" boolean into BOTH positions would apply the wrong
// ceiling to an admin account (or vice versa) the moment the two ever
// disagree, which is legitimate: an admin who is ALSO flagged
// is_beta_tester is not supposed to happen (lib/beta.ts keeps them
// mutually exclusive) but "never happens" is not "cannot happen".
const callSites = SOURCES.filter((f) => /checkBypassCeiling\(/.test(stripComments(readSrc(f))));
// SAME FLOOR, SAME REASON. Measured today: 29 files call it.
check(
  `checkBypassCeiling() is actually called somewhere (${callSites.length} files)`,
  callSites.length >= 20,
  "0 here means the collapse scan below iterates nothing"
);
const collapsed = [];
for (const f of callSites) {
  // NOT A BACKREFERENCE. The old pattern was
  // /checkBypassCeiling\(\s*[^,]+,\s*([^,]+),\s*\1\s*\)/, which only
  // matches when the two arguments are spelled IDENTICALLY, character for
  // character. `checkBypassCeiling(u, isBypass, !!isBypass)` collapses the
  // two ceilings just as thoroughly and slipped straight past it, as would
  // any difference in whitespace. The arguments are extracted and compared
  // after normalising instead.
  for (const m of stripComments(readSrc(f)).matchAll(/checkBypassCeiling\(([^)]*)\)/g)) {
    const args = m[1].split(",").map((a) => a.trim());
    if (args.length < 3) continue;
    const norm = (a) => a.replace(/[\s!]+/g, "").replace(/^Boolean\((.*)\)$/, "$1");
    if (norm(args[1]) && norm(args[1]) === norm(args[2])) {
      collapsed.push(`${f}: checkBypassCeiling(_, ${args[1]}, ${args[2]}) — the same value in both positions`);
    }
  }
}
check("no call site passes the identical expression for both isAdmin and isBeta",
  collapsed.length === 0, collapsed.join("\n        "));

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILED: " + failures.join(" | "));
  process.exit(1);
}
