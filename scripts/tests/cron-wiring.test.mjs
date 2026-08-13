// Every cron route is actually scheduled.
//
// WHAT WAS WRONG. /api/cron/reset-credits and /api/weekly-digest both
// existed, both were auth-guarded, both were complete — and neither was in
// vercel.json. They said "PLACEHOLDER — not wired to any scheduler yet" in a
// comment nobody reads. The visible consequence: a Free account got its 100
// credits at signup and never again, because the only thing that would have
// given them back was a route no scheduler ever called.
//
// Nothing structural stopped that, and nothing stops the next one. This is
// the gate: a route under api/cron/ (or any route the app relies on a
// scheduler to call) has to appear in vercel.json.
//
// Run: node scripts/tests/cron-wiring.test.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

console.log("cron-wiring");

const vercel = JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const scheduled = new Map((vercel.crons ?? []).map((c) => [c.path, c.schedule]));

// ---------------------------------------------------------------------
console.log("\n== 1. every scheduler-triggered route is scheduled ==");
// ---------------------------------------------------------------------
// Discovered from the filesystem, not from a list — a new cron route added
// next month is covered without anyone remembering to add it here.
const cronDir = path.join(ROOT, "src/app/api/cron");
const discovered = readdirSync(cronDir)
  .filter((name) => existsSync(path.join(cronDir, name, "route.ts")))
  .map((name) => `/api/cron/${name}`);

// weekly-digest lives outside api/cron/ for historical reasons but is just
// as much a scheduled route: it uses the same checkCronAuth guard. That
// guard is the real signal, so it is what identifies the route here.
const outsideCronDir = ["/api/weekly-digest"].filter((route) =>
  readFileSync(path.join(ROOT, "src/app", route.replace(/^\//, ""), "route.ts"), "utf8").includes("checkCronAuth")
);

const expected = [...discovered, ...outsideCronDir].sort();
console.log(`  ....  found ${expected.length} scheduler-triggered routes`);

const unscheduled = expected.filter((route) => !scheduled.has(route));
check("no scheduler-triggered route is left unwired", unscheduled, []);

// The other direction: a schedule pointing at a route that no longer exists
// would silently 404 once a day forever.
const orphans = [...scheduled.keys()].filter((route) => {
  const file = path.join(ROOT, "src/app", route.replace(/^\//, ""), "route.ts");
  return !existsSync(file);
});
check("no schedule points at a route that does not exist", orphans, []);

// ---------------------------------------------------------------------
console.log("\n== 2. the schedules are the ones intended ==");
// ---------------------------------------------------------------------
check("reset-credits runs monthly, on the 1st", scheduled.get("/api/cron/reset-credits"), "0 3 1 * *");
check("weekly-digest runs weekly, on a Monday", scheduled.get("/api/weekly-digest"), "0 8 * * 1");

// Cron fields, checked rather than eyeballed: minute hour day month weekday.
for (const [route, schedule] of scheduled) {
  const fields = schedule.trim().split(/\s+/);
  check(`${route}: five cron fields`, fields.length, 5);
}
{
  const [, , dom, , dow] = scheduled.get("/api/cron/reset-credits").split(/\s+/);
  check("reset-credits fires on day 1 of every month", `${dom}|${dow}`, "1|*");
}
{
  const [, , dom, , dow] = scheduled.get("/api/weekly-digest").split(/\s+/);
  check("weekly-digest fires on Mondays, any date", `${dom}|${dow}`, "*|1");
}

// ---------------------------------------------------------------------
console.log("\n== 3. no route still calls itself a placeholder ==");
// ---------------------------------------------------------------------
// The comment was the only record that these did not run. Now that they do,
// a stale "PLACEHOLDER" would be a lie sitting in the file that the next
// reader believes.
const stillPlaceholder = expected.filter((route) => {
  const file = path.join(ROOT, "src/app", route.replace(/^\//, ""), "route.ts");
  return /PLACEHOLDER\b/.test(readFileSync(file, "utf8"));
});
check("no scheduled route describes itself as a placeholder", stillPlaceholder, []);

// ---------------------------------------------------------------------
console.log("\n== 4. the reset cannot double-grant paid accounts ==");
// ---------------------------------------------------------------------
// The reason this route could not simply be scheduled as written: it reset
// EVERY row, while invoice.paid already resets paid accounts on their own
// billing anniversary. The behaviour is proven against a real database in
// monthly-credit-reset.itest.mjs; this is the cheap structural check that
// the route no longer does the thing that made scheduling it dangerous.
{
  const source = readFileSync(path.join(ROOT, "src/app/api/cron/reset-credits/route.ts"), "utf8");
  check(
    "it no longer loops over every user_credits row",
    /from\("user_credits"\)[\s\S]{0,80}\.select\(/.test(source),
    false
  );
  check("it goes through the guarded RPC", source.includes("reset_monthly_credits_for_unbilled"), true);
  check("and reports what it granted, so a replay reads as 0", /granted:/.test(source), true);
}
{
  // The digest must not mail a table of zeroes to everyone every Monday.
  const source = readFileSync(path.join(ROOT, "src/app/api/weekly-digest/route.ts"), "utf8");
  check(
    "the digest skips accounts with no activity",
    /every\(\(m\) => m\.count === 0\)/.test(source),
    true
  );
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
