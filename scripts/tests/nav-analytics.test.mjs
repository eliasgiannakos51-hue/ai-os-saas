// NAVIGATION INSTRUMENTATION — the four columns, and everything that
// keeps it to four.
//
// This table exists to make "nobody uses the tracking modules" a
// falsifiable statement. That is worth very little if the table grows a
// fifth column six months from now, or if a search term leaks into the
// href, or if the opt-out is a checkbox the client is trusted to honour.
// So most of this file is about the LIMITS rather than the feature.
//
// Run: node scripts/tests/nav-analytics.test.mjs
import { readFileSync, readdirSync } from "node:fs";
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
function eq(name, actual, expected) {
  check(`${name} (${actual})`, actual === expected, `expected ${expected}, got ${actual}`);
}

const MIGRATION = "supabase/migrations/20260817000004_nav_events.sql";
const migrationSrc = readFileSync(MIGRATION, "utf8");
const stripSqlComments = (s) => s.replace(/^\s*--.*$/gm, "");
// Both of these files EXPLAIN in prose why they do not use the admin
// client and do not filter by user_id — so a check that greps the raw
// text finds the very words it is asserting are absent, and fails on the
// documentation rather than the code. Strip comments first. (The same
// mistake, in SQL, once masked four genuinely missing columns.)
const stripJsComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const migrationSql = stripSqlComments(migrationSrc);

console.log("== 1. FOUR COLUMNS, and the ones deliberately absent ==");
{
  const body = migrationSql.match(/create table if not exists public\.nav_events\s*\(([\s\S]*?)\n\);/);
  check("the create table is there", Boolean(body));
  const columns = (body?.[1] ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\s+/)[0].replace(/,$/, ""));
  eq("exactly four columns", columns.length, 4);
  check("they are id, user_id, href, at",
    JSON.stringify(columns) === JSON.stringify(["id", "user_id", "href", "at"]),
    columns.join(", "));
}

// THE POINT OF THIS SUITE. Each of these is a column somebody could add
// with a straight face — "just for debugging", "only for a week". Named
// individually so the failure says WHICH one appeared, and so adding one
// on purpose means deleting a line here and explaining why.
console.log("\n== 2. the columns that must never appear ==");
for (const forbidden of [
  "ip", "ip_address", "user_agent", "referrer", "referer", "session_id",
  "device_id", "fingerprint", "dwell", "duration", "scroll", "query",
  "search", "utm_source", "variant", "experiment",
]) {
  const re = new RegExp(`^\\s*${forbidden}\\s+`, "im");
  check(`no ${forbidden} column`, !re.test(migrationSql));
}

console.log("\n== 3. RLS: own rows only, and no UPDATE at all ==");
check("row level security is enabled", /alter table public\.nav_events enable row level security/.test(migrationSql));
for (const op of ["insert", "select", "delete"]) {
  check(`there is an own-rows ${op} policy`,
    new RegExp(`create policy "nav_events_${op}_own"[\\s\\S]{0,200}auth\\.uid\\(\\) = user_id`).test(migrationSql));
}
// An event is a record of something that happened. Nobody rewrites when
// or where a navigation went — with no policy, RLS denies it.
check("there is NO update policy (an event is not editable)",
  !/for update/i.test(migrationSql));

console.log("\n== 4. it cascades, so erasure needs no special case ==");
check("user_id references auth.users on delete cascade",
  /user_id uuid not null references auth\.users\(id\) on delete cascade/.test(migrationSql));

console.log("\n== 5. GDPR: classified, exported, not quietly 'just analytics' ==");
{
  const registry = readFileSync("src/lib/gdpr/user-data-registry.ts", "utf8");
  const entry = registry.match(/\{\s*table:\s*"nav_events"[^}]*\}/);
  check("nav_events is in the user-data registry", Boolean(entry), "not classified at all");
  check("...and is NOT classified as non-personal",
    Boolean(entry) && !/not_personal/.test(entry[0]), entry?.[0]);
  check("...so the Article 15 export includes it",
    Boolean(entry) && !/scope:\s*"not_personal"/.test(entry[0]));
}

console.log("\n== 6. the href validator is the boundary, not the client ==");
const { isRecordableHref, hasOptedOutOfNavAnalytics, MAX_HREF_LENGTH } =
  await loadTs("src/lib/nav-analytics.ts");

for (const good of [
  "/dashboard", "/dashboard/agents", "/dashboard/website-builder",
  "/dashboard/deep-research", "/dashboard/trading-workflow", "/help",
]) {
  check(`accepts a real route: ${good}`, isRecordableHref(good) === true);
}

// EVERY ONE OF THESE IS A WAY THE USER'S OWN WORDS OR RECORDS REACH A
// TELEMETRY TABLE. They are the reason this function exists.
for (const [bad, why] of [
  ["/dashboard/timeline?q=my+secret+search", "a query string carries what they searched for"],
  ["/dashboard/ideas/3f2504e0-4f89-41d3-9a0c-0305e82c3301", "a uuid is one specific record"],
  ["/dashboard/agents#section", "a fragment is still user-chosen text"],
  ["//evil.example/path", "protocol-relative — a different origin entirely"],
  ["https://evil.example/path", "an absolute URL to somewhere else"],
  ["/\\evil.example", "some browsers normalise this to protocol-relative"],
  ["dashboard/agents", "not absolute"],
  ["", "empty"],
  ["/dashboard/" + "x".repeat(40), "an over-long segment is an opaque token, not a page"],
  ["/dashboard/a b", "whitespace does not belong in a path"],
]) {
  check(`rejects ${JSON.stringify(bad).slice(0, 46)} — ${why}`, isRecordableHref(bad) === false);
}
check("rejects a non-string", isRecordableHref(undefined) === false && isRecordableHref(42) === false);
check(`rejects anything longer than ${MAX_HREF_LENGTH}`,
  isRecordableHref("/" + "a".repeat(MAX_HREF_LENGTH)) === false);

console.log("\n== 7. EVERY sidebar href this app has actually passes the validator ==");
// A validator that rejects the app's own routes would silently record
// nothing and look like "nobody clicks anything" — the exact wrong
// answer, arrived at invisibly. Derived from the real nav config, so a
// route added later is checked too.
const sidebarSrc = readFileSync("src/lib/sidebar-nav.ts", "utf8");
const sidebarHrefs = [...new Set([...sidebarSrc.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]))].sort();
console.log(`        ${sidebarHrefs.length} sidebar destinations`);
const rejected = sidebarHrefs.filter((h) => !isRecordableHref(h));
check("every sidebar href is recordable", rejected.length === 0, rejected.join(", "));

console.log("\n== 8. the opt-out is honoured on the SERVER ==");
eq("absent metadata means recording (opt-OUT, not opt-in)", hasOptedOutOfNavAnalytics({}), false);
eq("null metadata does not throw", hasOptedOutOfNavAnalytics(null), false);
eq("the flag set to true means opted out", hasOptedOutOfNavAnalytics({ nav_analytics_opt_out: true }), true);
eq("a truthy non-true value does NOT count as opted out",
  hasOptedOutOfNavAnalytics({ nav_analytics_opt_out: "yes" }), false);
{
  // A preference the browser is trusted to honour is not a preference:
  // the route has to check it too, before it writes anything.
  const route = readFileSync("src/app/api/nav-events/route.ts", "utf8");
  const optOutAt = route.indexOf("hasOptedOutOfNavAnalytics");
  const insertAt = route.indexOf('.from("nav_events").insert');
  check("the route checks the opt-out", optOutAt > -1);
  check("...before it inserts", optOutAt > -1 && insertAt > -1 && optOutAt < insertAt);
  check("the route validates the href server-side", /isRecordableHref\(/.test(route));
  check("user_id comes from the session, never the body",
    /user_id: user\.id/.test(route) && !/user_id: body/.test(route));
  const routeCode = stripJsComments(route);
  check("it uses the user-scoped client, so RLS applies",
    /createClient\(/.test(routeCode) && !/createAdminClient/.test(routeCode));
}

console.log("\n== 9. retention: 90 days, by a cron that is actually scheduled ==");
{
  const cron = readFileSync("src/app/api/cron/prune-nav-events/route.ts", "utf8");
  check("RETENTION_DAYS is 90", /RETENTION_DAYS = 90\b/.test(cron));
  check("it authenticates as a cron", /checkCronAuth\(/.test(cron));
  check("it deletes by age", /\.lt\("at", cutoff\)/.test(cron));
  // No user_id in the query: there is no shape of this that targets one
  // person.
  check("...and singles nobody out", !/user_id/.test(stripJsComments(cron)));

  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  const job = (vercel.crons ?? []).find((c) => c.path === "/api/cron/prune-nav-events");
  check("it is scheduled in vercel.json", Boolean(job), "a retention policy nothing runs is not a policy");
  check("...daily", Boolean(job) && /^\d+ \d+ \* \* \*$/.test(job.schedule), job?.schedule);
}

console.log("\n== 10. the analysis queries have not drifted from the sidebar ==");
// Question 1 LEFT JOINs against a hardcoded href list, because the
// database does not know what the sidebar offers. A stale list answers
// "which items are unused" by omitting them, which is the failure mode
// that question exists to avoid.
{
  const sql = readFileSync("scripts/db/nav-analysis.sql", "utf8");
  const listed = [...sql.matchAll(/^\s*'(\/[a-z0-9/-]*)',?$/gim)].map((m) => m[1]);
  const missing = sidebarHrefs.filter((h) => !listed.includes(h));
  const extra = listed.filter((h) => !sidebarHrefs.includes(h));
  check("every sidebar href appears in the analysis query", missing.length === 0, missing.join(", "));
  check("...and it lists nothing the sidebar no longer has", extra.length === 0, extra.join(", "));
  check("the query LEFT JOINs, so zero-click items are rows not absences",
    /left join clicks/i.test(sql));
  check("question 2 exists (time from sign-in to first navigation)",
    /last_sign_in_at/.test(sql));
  check("question 3 exists (distinct items per person per week)",
    /count\(distinct href\)/.test(sql) && /date_trunc\('week'/.test(sql));
}

console.log("\n== 11. it is recorded in exactly one place ==");
{
  const sidebar = readFileSync("src/components/dashboard/sidebar.tsx", "utf8");
  check("the sidebar records nav events", /recordNavEvent\(item\.href\)/.test(sidebar));
  eq("exactly one call site in the sidebar",
    (sidebar.match(/recordNavEvent\(/g) ?? []).length, 1);

  // Nothing else in src/ may record — a second surface writing into the
  // same table makes "never clicked" ambiguous between "this row is
  // unused" and "this destination is unreachable".
  const callers = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(p) && /recordNavEvent\(/.test(readFileSync(p, "utf8"))) callers.push(p);
    }
  };
  walk("src");
  const unexpected = callers.filter(
    (f) => !["src/components/dashboard/sidebar.tsx", "src/lib/nav-analytics-client.ts"].includes(f)
  );
  check("no other surface records navigation", unexpected.length === 0, unexpected.join(", "));
}

console.log("\n== 12. mutation test — section 2 can actually go red ==");
// Proves the forbidden-column check is not vacuous: the whole value of
// this suite is that it fails when the table grows.
{
  const mutated = migrationSql.replace(
    /(\n\s*href text not null,)/,
    "$1\n  user_agent text,"
  );
  check("the mutation added a column (sanity check on the mutation itself)",
    mutated !== migrationSql);
  check("...and a user_agent column would now be caught",
    /^\s*user_agent\s+/im.test(mutated) && !/^\s*user_agent\s+/im.test(migrationSql));
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILED: " + failures.join(" | "));
  process.exit(1);
}
