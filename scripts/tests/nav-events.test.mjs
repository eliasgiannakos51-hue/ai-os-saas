// THE TWO HALVES OF nav_events HAVE TO AGREE, AND NOTHING MAKES THEM.
//
// The instrument is three files that know the same fact separately:
//
//   src/app/dashboard/**          the screens that exist
//   src/lib/nav/nav-path.ts       the screens the normaliser will record
//   the migration's CHECK         the strings the column will accept
//
// Any two of those can drift without an error anywhere. A new screen is
// added and never tracked: nav_screen_usage simply has no row for it, and
// a missing row in this table means "nobody opened it", which is the
// exact sentence a decision to cut it would be based on. A screen is
// deleted and left in the list: nothing breaks, and the stale entry sits
// there looking like a route. The normaliser emits a shape the constraint
// rejects: every navigation to that screen silently fails to record,
// because /api/nav/track fails quiet on purpose.
//
// None of those three failures produces a red anything. This file is the
// red.
//
// Run: node scripts/tests/nav-events.test.mjs
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
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

const { loadTs } = await import("./load-ts.mjs");
const nav = await loadTs("src/lib/nav/nav-path.ts");
const { MODULES } = await loadTs("src/lib/modules.ts");

const MIGRATION = "supabase/migrations/20260915000000_nav_events.sql";
const migration = readFileSync(MIGRATION, "utf8");
const layout = readFileSync("src/app/dashboard/layout.tsx", "utf8");
const trackRoute = readFileSync("src/app/api/nav/track/route.ts", "utf8");
const cronRoute = readFileSync("src/app/api/cron/nav-retention/route.ts", "utf8");
const tracker = readFileSync("src/components/dashboard/nav-tracker.tsx", "utf8");

// Comments are not code. Every claim below about what a file DOES is
// made against the stripped text; the raw text is only used where the
// claim is about a comment.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
function stripSql(src) {
  return src.replace(/--.*$/gm, "");
}
const trackCode = stripComments(trackRoute);
const trackerCode = stripComments(tracker);
const cronCode = stripComments(cronRoute);
const layoutCode = stripComments(layout);
const migrationCode = stripSql(migration);

// ---------------------------------------------------------------------
console.log("== 1. the route list is the app's routes, in both directions ==");

const DASH = "src/app/dashboard";
/** Every literal route directory under /dashboard, with its depth. */
function walkRoutes(dir, depth, out) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    const hasPage = existsSync(path.join(full, "page.tsx"));
    if (hasPage) out.push({ segment: entry, depth, dir: full });
    walkRoutes(full, depth + 1, out);
  }
}
const routes = [];
walkRoutes(DASH, 1, routes);

const firstLevelLiteral = routes
  .filter((r) => r.depth === 1 && !r.segment.startsWith("["))
  .map((r) => r.segment)
  .sort();
const listed = [...nav.NAV_STATIC_SEGMENTS].sort();

check(
  `every screen on disk is in NAV_STATIC_SEGMENTS (${firstLevelLiteral.length} found)`,
  firstLevelLiteral.every((s) => listed.includes(s)),
  `missing: ${firstLevelLiteral.filter((s) => !listed.includes(s)).join(", ")}`
);
check(
  "and every entry in NAV_STATIC_SEGMENTS is a screen on disk — no stale routes",
  listed.every((s) => firstLevelLiteral.includes(s)),
  `stale: ${listed.filter((s) => !firstLevelLiteral.includes(s)).join(", ")}`
);
check("the scan actually found the dashboard", firstLevelLiteral.length >= 30, String(firstLevelLiteral.length));

// THE DYNAMIC ROUTE IS NOT LISTED, IT IS READ. /dashboard/[module] serves
// the twelve records modules; naming them here would be a copy that goes
// stale the day a thirteenth is added.
check(
  "/dashboard/[module] exists and is the reason the module slugs are not hard-coded",
  routes.some((r) => r.depth === 1 && r.segment === "[module]")
);
check(
  `navModuleSegments() is MODULES, not a copy (${MODULES.length} modules)`,
  JSON.stringify(nav.navModuleSegments().slice().sort()) ===
    JSON.stringify(MODULES.map((m) => m.slug).sort())
);
check("no module slug is duplicated in the static list",
  nav.NAV_STATIC_SEGMENTS.every((s) => !MODULES.some((m) => m.slug === s)),
  nav.NAV_STATIC_SEGMENTS.filter((s) => MODULES.some((m) => m.slug === s)).join(", "));

// ---------------------------------------------------------------------
console.log("\n== 2. nothing on disk is deeper than the normaliser can express ==");
const deeper = routes.filter((r) => r.depth >= 2);
const nestedParents = [
  ...new Set(deeper.map((r) => path.basename(path.dirname(r.dir)))),
].sort();
check(
  `every two-deep route's parent is in NAV_NESTED_DYNAMIC (found: ${nestedParents.join(", ") || "none"})`,
  nestedParents.every((p) => nav.NAV_NESTED_DYNAMIC.includes(p)),
  `unlisted: ${nestedParents.filter((p) => !nav.NAV_NESTED_DYNAMIC.includes(p)).join(", ")}`
);
check(
  "and every NAV_NESTED_DYNAMIC entry really has a child route",
  nav.NAV_NESTED_DYNAMIC.every((p) => nestedParents.includes(p)),
  `stale: ${nav.NAV_NESTED_DYNAMIC.filter((p) => !nestedParents.includes(p)).join(", ")}`
);
// A THREE-DEEP ROUTE WOULD BE SILENTLY FILED UNDER :unknown, which reads
// in the view as "a dead link somebody keeps hitting".
check(
  "no route is three levels deep — the normaliser would file it as :unknown",
  routes.every((r) => r.depth <= 2),
  routes.filter((r) => r.depth > 2).map((r) => r.dir).join(", ")
);
check(
  "every two-deep route is dynamic; a LITERAL one would be recorded as :id",
  deeper.every((r) => r.segment.startsWith("[")),
  deeper.filter((r) => !r.segment.startsWith("[")).map((r) => r.dir).join(", ")
);

// ---------------------------------------------------------------------
console.log("\n== 3. what the normaliser does to a real URL ==");
const cases = [
  ["/dashboard", "/dashboard"],
  ["/dashboard/", "/dashboard"],
  ["/dashboard/finance", "/dashboard/finance"],
  ["/dashboard/settings", "/dashboard/settings"],
  // The deep links scripts/tests/deep-links.test.mjs protects — every one
  // of them carries an identifier, and not one of them may be stored.
  ["/dashboard/finance?record=8f14e45f-ceea-467a-9575-1b1f0d4b7f19", "/dashboard/finance"],
  ["/dashboard/mission?mission=abc", "/dashboard/mission"],
  ["/dashboard/agents?agent=abc", "/dashboard/agents"],
  ["/dashboard/settings?checkout=success", "/dashboard/settings"],
  ["/dashboard/chat#anchor", "/dashboard/chat"],
  ["/dashboard/documents/8f14e45f-ceea-467a-9575-1b1f0d4b7f19", "/dashboard/documents/:id"],
  ["/dashboard/documents", "/dashboard/documents"],
  // Not a route.
  ["/dashboard/nope", "/dashboard/:unknown"],
  ["/dashboard/finance/extra", "/dashboard/:unknown"],
  ["/dashboard/nope/deeper/still", "/dashboard/:unknown"],
  // Not tracked at all.
  ["/login", null],
  ["/pricing", null],
  ["/", null],
  ["", null],
  ["https://example.com/dashboard/finance", null],
  [null, null],
  [undefined, null],
  [42, null],
  [{ toString: () => "/dashboard" }, null],
];
for (const [input, expected] of cases) {
  const got = nav.normaliseNavPath(input);
  check(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, got === expected, `got ${JSON.stringify(got)}`);
}
check("a 3KB path is refused before it is parsed", nav.normaliseNavPath("/dashboard/" + "a".repeat(3000)) === null);

console.log("\n   the referrer, which is not document.referrer");
check("'external' survives", nav.normaliseNavReferrer("external") === "external");
check("an in-app path is normalised like any other", nav.normaliseNavReferrer("/dashboard/chat?x=1") === "/dashboard/chat");
check("somebody else's URL becomes null, never itself",
  nav.normaliseNavReferrer("https://news.ycombinator.com/item?id=1") === null);
check("and so does an unrecognised value — a missing answer is a null, never a guess",
  nav.normaliseNavReferrer("whatever") === null);

// ---------------------------------------------------------------------
console.log("\n== 4. everything the normaliser can emit, the column accepts ==");
// THE JOIN BETWEEN THE TWO HALVES, without a database. The check
// constraint is the last defence and it was wrong once already: its first
// version was a prefix and a length, which accepts
// '/dashboard/finance?record=<uuid>'. This enumerates the ENTIRE output
// range of the normaliser and runs the constraint's own regular
// expression over it.
const constraintMatch = migrationCode.match(/check \(path ~ '([^']+)'\)/);
check("the migration states a regex constraint on path", Boolean(constraintMatch), migrationCode.slice(0, 0));
const pathRe = new RegExp(constraintMatch[1]);
check("and it is not a prefix-and-length bound",
  !/like '\/dashboard%'/.test(migrationCode),
  "the constraint accepts '/dashboard/finance?record=<uuid>' if it is");

const producible = [
  "/dashboard",
  nav.NAV_UNKNOWN_PATH,
  ...nav.NAV_STATIC_SEGMENTS.map((s) => `/dashboard/${s}`),
  ...nav.navModuleSegments().map((s) => `/dashboard/${s}`),
  ...nav.NAV_NESTED_DYNAMIC.map((s) => `/dashboard/${s}/:id`),
];
// ONE EXPRESSION CARRYING BOTH FACTS, and this is the second version of
// it. The first counted the rejects and then, separately, checked that
// the list had been built:
//
//     const rejected = producible.filter((p) => !pathRe.test(p));
//     check("all of them satisfy the CHECK", rejected.length === 0);
//     check("the range covers every screen", producible.length === 51);
//
// nav-events.mutation.mjs replaced the FIRST line's `producible` with
// `[]` and the gate stayed green: nothing was tested, nothing was
// rejected, and the second check still found a fully built array sitting
// beside the test that had ignored it. That is a guard measuring STATE
// where the failure is in the BEHAVIOUR — the same shape as the #17
// sidebar gate that read 585px in both scenarios. Counting the paths that
// actually PASSED, and requiring that number to equal the whole range,
// cannot be satisfied by a test that ran over nothing.
const expected = 2 + nav.NAV_STATIC_SEGMENTS.length + MODULES.length + nav.NAV_NESTED_DYNAMIC.length;
// A floor on the expectation itself. `accepted === expected` is a real
// assertion only while `expected` comes from something other than the
// list being tested; if it were ever rewritten as `producible.length`,
// emptying the range would satisfy it as 0 === 0. Forty-five is under
// today's fifty-one and above any plausible shrinkage of the app.
check(`the expected range is the whole app, not whatever was handed in (${expected})`, expected >= 45);
const accepted = producible.filter((p) => pathRe.test(p)).length;
check(
  `all ${expected} paths the normaliser can produce satisfy the CHECK`,
  accepted === expected,
  `${accepted} of ${producible.length} passed; rejected: ${producible.filter((p) => !pathRe.test(p)).join(", ")}`
);

const referrerMatch = migrationCode.match(/or referrer ~ '([^']+)'/);
check("the referrer column has the same shape rule", Boolean(referrerMatch));
const refRe = new RegExp(referrerMatch[1]);
check("every producible referrer satisfies it", producible.every((p) => refRe.test(p)));
check("and 'external' is allowed by its own clause, not by the regex",
  !refRe.test("external") && /or referrer = 'external'/.test(migrationCode));

// The constraint must REJECT what the normaliser exists to strip. A regex
// that accepts everything would pass every check above.
for (const bad of [
  "/dashboard/finance?record=1",
  "/dashboard/chat#top",
  "/dashboard/Finance",
  "/dashboard/a/b/c",
  "/login",
  "/dashboard/finance ",
  "'; drop table nav_events; --",
]) {
  check(`the CHECK rejects ${JSON.stringify(bad)}`, !pathRe.test(bad));
}

// ---------------------------------------------------------------------
console.log("\n== 5. the write path actually writes, from the one place it can ==");
check("NavTracker is mounted in the dashboard layout", /<NavTracker \/>/.test(layoutCode));
check("exactly once", (layoutCode.match(/<NavTracker \/>/g) || []).length === 1);
check("and imported from components/dashboard/nav-tracker",
  /import \{ NavTracker \} from "@\/components\/dashboard\/nav-tracker"/.test(layoutCode));
// A tracker inside a page records the arrival and never the departure.
// A FLOOR ON THE SCAN, ON THE SAME VARIABLE THE EMPTINESS IS ASSERTED
// OVER. "No other file mounts it" and "no file was read" produce the
// same empty array; a floor on a SEPARATE count would say the directory
// has files without saying these are the files that were searched, which
// is the state-instead-of-behaviour shape again. gate-vacuity.test.mjs
// follows the assignment chain for exactly this reason.
const dashboardTsx = readdirSync("src/app/dashboard", { recursive: true })
  .filter((f) => typeof f === "string" && f.endsWith(".tsx") && f !== "layout.tsx");
check(`the scan read the dashboard's own files (${dashboardTsx.length})`,
  dashboardTsx.length >= 30, String(dashboardTsx.length));
const otherMounts = dashboardTsx.filter((f) =>
  readFileSync(path.join("src/app/dashboard", f), "utf8").includes("<NavTracker")
);
check("and nowhere else under /dashboard", otherMounts.length === 0, otherMounts.join(", "));

check("the tracker reads the pathname from next/navigation", /usePathname\(\)/.test(trackerCode));
check("it posts to /api/nav/track", /"\/api\/nav\/track"/.test(trackerCode));
check("with keepalive, so the last navigation of a session is recorded",
  /keepalive:\s*true/.test(trackerCode));
check("it sends the previous path as the referrer", /referrer/.test(trackerCode));
// THE SPECIFIC BUG THE COMMENT WARNS ABOUT. A useRef is recreated when
// React remounts the tree, which StrictMode does deliberately — every
// count in nav_screen_usage would be inflated, silently and only in some
// environments.
check("the dedupe key is a module variable, not a ref",
  /^let lastTrackedPath/m.test(trackerCode) && !/useRef/.test(trackerCode),
  /useRef/.test(trackerCode) ? "it uses useRef" : "no module-level key found");
check("and it is set BEFORE the fetch, not in a .then()",
  trackerCode.indexOf("lastTrackedPath = pathname") < trackerCode.indexOf("fetch("));

// ---------------------------------------------------------------------
console.log("\n== 6. the route trusts nothing the browser sent ==");
check("the API route normalises the path SERVER-SIDE",
  /normaliseNavPath\(\s*body\?\.path\s*\)/.test(trackCode));
check("and the referrer", /normaliseNavReferrer\(\s*body\?\.referrer\s*\)/.test(trackCode));
check("user_id comes from auth.getUser(), never from the body",
  /auth\.getUser\(\)/.test(trackCode) && /user_id:\s*user\.id/.test(trackCode) &&
  !/user_id:\s*body/.test(trackCode));
check("it writes through the caller's own client, so RLS scopes the insert",
  /createClient\b/.test(trackCode) && !/createAdminClient/.test(trackCode));
check("a path it cannot normalise is refused, not stored as-is",
  /if \(!path\)/.test(trackCode) && /status: 400/.test(trackCode));
check("no session is a 401", /status: 401/.test(trackCode));
check("a failed insert does not become an error on a page that rendered fine",
  /logApiError\("\/api\/nav\/track"/.test(trackCode) && /\{ ok: false \}, \{ status: 200 \}/.test(trackCode));

// ---------------------------------------------------------------------
console.log("\n== 7. retention runs, on a schedule, with the same number ==");
check("NAV_RETENTION_DAYS is 90", nav.NAV_RETENTION_DAYS === 90);
check("the migration's default is the same number",
  new RegExp(`prune_nav_events\\(p_days integer default ${nav.NAV_RETENTION_DAYS}\\)`).test(migrationCode),
  migrationCode.match(/prune_nav_events\(p_days[^)]*\)/)?.[0]);
check("the cron route passes it rather than a literal",
  /p_days:\s*NAV_RETENTION_DAYS/.test(cronCode));
check("it calls the function, not a DELETE of its own",
  /rpc\("prune_nav_events"/.test(cronCode) && !/\.delete\(\)/.test(cronCode));
check("behind CRON_SECRET, fail-closed", /checkCronAuth\(request\)/.test(cronCode));
// A BAD ARGUMENT FALLS BACK TO THE DEFAULT, NOT TO THE FLOOR. The
// behaviour is measured against a real Postgres in
// nav-events.dbtest.mjs section 5; this is the shape, so that a migration
// edited back to greatest(...,1) — which turns a stray 0 into "delete
// eighty-nine days of history" — goes red without a database.
check("a null, zero or negative day count becomes 90, not 1",
  /when p_days is null or p_days < 1 then 90/.test(migrationCode),
  migrationCode.match(/v_days integer :=[\s\S]{0,120}/)?.[0]);
check("and there is no greatest(...) floor left in it",
  !/greatest\s*\(/.test(migrationCode));
check("and it reports how many rows went, so a dead sweep is visible",
  /deleted/.test(cronCode));

const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
const entry = vercel.crons.find((c) => c.path === "/api/cron/nav-retention");
check("the sweep is registered in vercel.json — a cron route nothing calls is not retention",
  Boolean(entry), JSON.stringify(vercel.crons.map((c) => c.path)));
check("daily", /^\S+ \S+ \* \* \*$/.test(entry?.schedule ?? ""), entry?.schedule);

// ---------------------------------------------------------------------
console.log("\n== 8. the migration obeys the rules every migration here obeys ==");
check("no DROP TABLE", !/drop\s+table/i.test(migrationCode));
check("no TRUNCATE", !/truncate/i.test(migrationCode));
const deletes = [...migrationCode.matchAll(/delete\s+from\s+[^;]*/gi)].map((m) => m[0]);
check(`every DELETE is qualified (${deletes.length} found)`,
  deletes.length > 0 && deletes.every((d) => /\bwhere\b/i.test(d)),
  deletes.join(" | "));
check("RLS is enabled on the table", /enable row level security/i.test(migrationCode));
check("anon is revoked from the table", /revoke all on public\.nav_events from anon/i.test(migrationCode));
check("and from the identity sequence", /revoke all on sequence/i.test(migrationCode));
check("the cleanup function is revoked from anon AND authenticated",
  /revoke all on function public\.prune_nav_events\(integer\) from anon/.test(migrationCode) &&
  /revoke all on function public\.prune_nav_events\(integer\) from authenticated/.test(migrationCode));
check("its search_path is pinned", /set search_path = public, pg_catalog/.test(migrationCode));
check("both views are security_invoker",
  (migrationCode.match(/with \(security_invoker = true\)/g) || []).length === 2);
check("and neither is granted to anon or authenticated",
  !/grant select on public\.nav_(screen_usage|user_breadth) to (anon|authenticated)/.test(migrationCode));
// A GRANT AND A POLICY ARE TWO HALVES; grants-vs-policies.dbtest.mjs is
// what checks the whole schema. This is only the pair added here.
check("authenticated is granted exactly select and insert",
  /grant select, insert on public\.nav_events to authenticated/.test(migrationCode) &&
  /revoke update, delete on public\.nav_events from authenticated/.test(migrationCode));

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`${pass} checks passed. The routes, the normaliser and the column agree.`);
