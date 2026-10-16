// THE MONTHLY RESEARCH ALLOWANCE IS COUNTED FROM A LEDGER NOBODY CAN
// DELETE FROM.
//
// WHAT WAS WRONG. The cap — "your plan includes N research reports a
// month" — was enforced by counting rows in `research_reports` created
// since the 1st, and api/research/[id] DELETE is a hard delete. Delete a
// finished report and the count went down; the allowance came back. The
// route's own comment said the cap "fails CLOSED" because a counting
// error must not be the way around it, and a deletion was, on every
// paid plan, with no error anywhere.
//
// Deep Research is the most expensive single action in the product (one
// planning call, up to six search-enabled calls, one synthesis), so the
// cap is not decoration — it is the per-account ceiling on real
// Anthropic spend that credits alone do not bound tightly.
//
// WHAT HOLDS NOW, and all four are checked here:
//   1. the counter reads ai_cost_log, scoped to the account, the
//      research_plan feature and a usable plan, since the 1st
//   2. a count that could not be taken is null, never zero
//   3. nothing anywhere counts an allowance out of research_reports
//   4. the screen and the route call the SAME function, so the number
//      shown is the number enforced
//
// Run: node scripts/tests/research-monthly-cap.test.mjs
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail === undefined ? "" : "\n        " + detail}`); }
}

const ROUTE = "src/app/api/research/route.ts";
const PAGE = "src/app/dashboard/deep-research/page.tsx";
const COUNTER = "src/lib/research/research-usage.ts";

// ---------------------------------------------------------------------
console.log("== 1. the counter, driven with the database stood in ==");
// ---------------------------------------------------------------------
// The query is RECORDED rather than read out of the source: a filter
// that is written but never sent would pass a grep and let the count
// through.
// THE BUILDER IS CHAINABLE AND THENABLE, like the real one: filters go
// on in any order and the query runs when it is awaited. A stand-in
// whose .gte() returned a promise could not model `.gte(...).eq(...)`
// at all, and the first version of this harness could not.
const standIn = `
globalThis.__queries = [];
const createAdminClient = () => ({
  from: (table) => {
    const q = { table, eq: {}, gte: null, head: null };
    globalThis.__queries.push(q);
    const builder = {
      select: (cols, opts) => { q.select = cols; q.head = opts; return builder; },
      eq: (col, value) => { q.eq[col] = value; return builder; },
      gte: (col, value) => { q.gte = [col, value]; return builder; },
      then: (resolve, reject) =>
        Promise.resolve(globalThis.__answerFor(q)).then(resolve, reject),
    };
    return builder;
  },
});
const logApiError = (...args) => { globalThis.__logged = args; };
`;
const src = readFileSync(COUNTER, "utf8");
const runnable =
  standIn +
  "\n" +
  src
    .replace(/^import\s+"[^"]*";[ \t]*\r?\n/gm, "")
    .replace(/^import\s[\s\S]*?\sfrom\s+"[^"]*";[ \t]*\r?\n/gm, "");
const dir = mkdtempSync(join(tmpdir(), "research-cap-"));
writeFileSync(join(dir, "research-usage.ts"), runnable);
const { countResearchRunsThisMonth } = await loadTs(join(dir, "research-usage.ts"));

const USER = "00000000-0000-4000-8000-000000000009";
/** The database's answer, chosen per query so the fallback can be driven. */
let answer = () => ({ count: 3, error: null });
globalThis.__answerFor = (q) => answer(q);
const fresh = () => { globalThis.__queries = []; };
const lastQuery = () => globalThis.__queries[globalThis.__queries.length - 1];

fresh();
const got = await countResearchRunsThisMonth(USER);
const q = lastQuery();
check("it answers with the count", got === 3, String(got));
check("it reads the append-only cost log, not the reports", q.table === "ai_cost_log", q.table);
check("...counting rather than fetching", q.head?.count === "exact" && q.head?.head === true, JSON.stringify(q.head));
check("...for this account only", q.eq.user_id === USER, JSON.stringify(q.eq));
check("...for the research planning call", q.eq.feature === "research_plan", JSON.stringify(q.eq));
check(
  "...and only where a plan actually came back usable",
  q.eq["metadata->>outcome"] === "planned",
  "a topic the model could not break into questions produces no report and must not spend an allowance"
);
// The window, derived here the same way a reader would: the 1st of the
// current UTC month at midnight. Written as an assertion about the value
// SENT, so a 30-day rolling window (which is not what the plan promises)
// would fail it.
const [gteCol, gteValue] = q.gte;
const monthStart = new Date();
monthStart.setUTCDate(1);
monthStart.setUTCHours(0, 0, 0, 0);
check("...since the first of the calendar month", gteCol === "created_at" && gteValue === monthStart.toISOString(),
  `${gteCol} >= ${gteValue}, expected created_at >= ${monthStart.toISOString()}`);

fresh();
answer = () => ({ count: null, error: { message: "nope" } });
const failed = await countResearchRunsThisMonth(USER);
check("a count that could not be taken is null, not zero", failed === null, String(failed));
check("...and it is reported", Array.isArray(globalThis.__logged) && globalThis.__logged.length > 0);

fresh();
answer = () => ({ count: null, error: null });
check("an empty month is zero", (await countResearchRunsThisMonth(USER)) === 0);

// THE FILTER IS TRIED, AND A DATABASE THAT REFUSES IT STILL ANSWERS.
// `metadata->>outcome` has no precedent in this repository, so the
// counter must not turn a rejected filter into a 503 on every research
// request. The fallback over-counts only a plan that produced no
// report, which errs towards the cap.
fresh();
answer = (q) =>
  q.eq["metadata->>outcome"] !== undefined
    ? { count: null, error: { message: 'unexpected "-" expecting letter' } }
    : { count: 4, error: null };
const fellBack = await countResearchRunsThisMonth(USER);
check("a rejected JSON filter falls back instead of refusing", fellBack === 4, String(fellBack));
check("...and the fallback query drops that filter and nothing else",
  lastQuery().eq["metadata->>outcome"] === undefined &&
    lastQuery().eq.feature === "research_plan" &&
    lastQuery().eq.user_id === USER &&
    lastQuery().gte?.[0] === "created_at",
  JSON.stringify(lastQuery()));
check("...and both attempts were made", globalThis.__queries.length === 2, String(globalThis.__queries.length));

fresh();
answer = () => ({ count: null, error: { message: "database is down" } });
check("a database that refuses both is still null, never zero",
  (await countResearchRunsThisMonth(USER)) === null);

answer = () => ({ count: 3, error: null });

// ---------------------------------------------------------------------
console.log("\n== 2. nothing counts an allowance out of the reports that still exist ==");
// ---------------------------------------------------------------------
// THE POPULATION IS THE TREE, not the two files this bug was found in.
// A third screen added next month gets the same answer without anybody
// remembering this file exists.
const FILES = [];
(function walk(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name)) FILES.push(p);
  }
})("src");

// A count taken over research_reports — the shape that made the
// allowance refundable. Pinned both ways below before it is believed.
const COUNTS_REPORTS = (s) =>
  /from\(\s*["'`]research_reports["'`]\s*\)[\s\S]{0,400}?count:\s*["'`]exact["'`]/.test(s);
check("the detector says yes to the shape that was wrong",
  COUNTS_REPORTS('supabase.from("research_reports").select("id", { count: "exact", head: true }).gte("created_at", since)'));
check("...and no to a plain list of the account's reports",
  !COUNTS_REPORTS('supabase.from("research_reports").select(REPORT_COLUMNS).eq("user_id", user.id).limit(100)'));
check("...and no to a count over another table",
  !COUNTS_REPORTS('supabase.from("ai_cost_log").select("id", { count: "exact", head: true })'));

// A FLOOR ON THE WALK. "offenders is empty" is also what a walk that
// found no files prints, and it prints it green.
check(`the tree was walked (${FILES.length} files)`, FILES.length >= 400,
  "an empty walk makes the next check pass on nothing");
const offenders = FILES.filter((f) => COUNTS_REPORTS(readFileSync(f, "utf8")));
check(`no file counts research_reports for an allowance (${FILES.length} files scanned)`,
  offenders.length === 0, offenders.join(", "));

// ---------------------------------------------------------------------
console.log("\n== 3. the screen and the route agree because they are the same call ==");
// ---------------------------------------------------------------------
const route = readFileSync(ROUTE, "utf8");
const page = readFileSync(PAGE, "utf8");
// THE CALL, NOT THE IMPORT. `.includes("countResearchRunsThisMonth(")`
// is satisfied by the import line at the top of either file, so
// deleting the call and leaving the import would pass it — the shape
// credit-grants.test.mjs already carries a warning about. The argument
// is what makes it a call.
for (const [what, text] of [["the route", route], ["the screen", page]]) {
  check(`${what} asks the one counter`, /countResearchRunsThisMonth\(user\.id\)/.test(text), `not called in ${what}`);
}
check("the route refuses when the count could not be taken",
  /if \(used === null\)[\s\S]{0,200}status: 503/.test(route),
  "fails CLOSED: a counting error must not be the way around the cap either");
check("...and refuses at the cap", /if \(used >= monthlyCap\)/.test(route));

// ---------------------------------------------------------------------
console.log("\n== 4. one ledger row per report started, and it is written first ==");
// ---------------------------------------------------------------------
// The counter is only as good as the row it counts. These three say the
// row exists, says "planned", and is written before the report it
// stands for — so a report can never exist without one.
check("the route settles the planning call under the feature the counter reads",
  /feature:\s*"research_plan"/.test(route));
check("...recording whether the plan came back usable",
  /metadata:\s*\{\s*outcome:\s*planned\.ok \?/.test(route));
check("...before the report row is inserted",
  route.indexOf('feature: "research_plan"') < route.indexOf('.from("research_reports")\n      .insert('),
  "a report inserted before its ledger row could be counted as zero");

const reservations = readFileSync("src/lib/billing/reservations.ts", "utf8");
check("a settlement writes the cost-log row whatever the charge",
  /p_feature:\s*feature/.test(reservations) && !/if \(bypassCharge\)\s*return/.test(reservations),
  "an admin or beta account must still leave a row, or its allowance would never be spent");

// The premise of the whole fix, asserted rather than assumed: deleting a
// report really does remove the row the old count was taken over.
const del = readFileSync("src/app/api/research/[id]/route.ts", "utf8");
check("deleting a report really is a hard delete",
  /\.from\("research_reports"\)\s*\.delete\(\)/.test(del),
  "if this ever becomes a tombstone, say so here — the reasoning above depends on it");

console.log(
  failures.length === 0
    ? `\nALL PASS: ${pass} passed, 0 failed`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ` + failures.join("\n  - ")
);
process.exit(failures.length === 0 ? 0 : 1);
