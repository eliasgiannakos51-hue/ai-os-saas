// HOW OLD IS THE THING THAT IS ACTUALLY SERVING?
//
// THE FAILURE, 2026-09-25: production was FORTY DAYS behind main. Every
// gate green, every commit pushed, /api/health reporting a healthy
// schema — every instrument telling the truth about a DIFFERENT BUILD
// from the one running. A redeploy with the cache disabled fixed it in a
// minute, and nothing anywhere would have said so.
//
// THE NUMBER IS JUDGED, NOT JUST PRINTED. docs/shapes.md records what a
// figure measured and never asserted is worth: schema-canaries derived
// what the newest migrations add, printed it, and asserted nothing — and
// three screens went dark while /api/health said `missing: []`. So an
// ancient deployment fails `ok`, rather than adding a field beside it.
//
// Run: node scripts/tests/deployment-age.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

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

const { deploymentAge, DEPLOYMENT_STALE_AFTER_DAYS, DEPLOYMENT_ANCIENT_AFTER_DAYS } =
  await loadTs("src/lib/health/deployment-age.ts");

const NOW = new Date("2026-09-25T12:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

console.log("== 1. the thresholds are the ones the incident argued for ==");
check(`stale at ${DEPLOYMENT_STALE_AFTER_DAYS} days`, DEPLOYMENT_STALE_AFTER_DAYS === 7);
check(`ancient at ${DEPLOYMENT_ANCIENT_AFTER_DAYS} days`, DEPLOYMENT_ANCIENT_AFTER_DAYS === 30);
check("...and stale comes before ancient", DEPLOYMENT_STALE_AFTER_DAYS < DEPLOYMENT_ANCIENT_AFTER_DAYS);

console.log("\n== 2. every rung, including the one that actually happened ==");
const at = (n) => deploymentAge({ NEXT_PUBLIC_BUILD_COMMIT_DATE: daysAgo(n) }, NOW);
for (const [days, level] of [[0, "ok"], [6, "ok"], [7, "stale"], [29, "stale"], [30, "ancient"], [40, "ancient"]]) {
  const r = at(days);
  check(`${String(days).padStart(2)} days old -> ${level}`, r.known && r.level === level, JSON.stringify(r));
}
check("the real one, forty days, reports its own age", at(40).ageDays === 40, String(at(40).ageDays));
// FLOORED, NOT ROUNDED. Six days and twenty-three hours is six days; a
// threshold that rounds up fires a day early and gets ignored.
check(
  "six days and twenty-three hours is still six days",
  deploymentAge({ NEXT_PUBLIC_BUILD_COMMIT_DATE: new Date(NOW.getTime() - (6 * 86_400_000 + 23 * 3_600_000)).toISOString() }, NOW).ageDays === 6
);

console.log("\n== 3. a missing stamp is UNKNOWN, never 'fresh' ==");
// THE DIRECTION MATTERS. An instrument that under-states staleness still
// eventually shouts; one that reports an unstamped build as new is the
// thing that let forty days pass.
const none = deploymentAge({}, NOW);
check("no stamp at all is not known", none.known === false && none.reason === "no_stamp");
check("...and it says what to do about it", /next\.config\.mjs/.test(none.detail), none.detail);
check("an unparseable stamp is also unknown", deploymentAge({ NEXT_PUBLIC_BUILD_COMMIT_DATE: "last tuesday" }, NOW).known === false);
check(
  "the BUILD time is used when there is no commit date",
  deploymentAge({ NEXT_PUBLIC_BUILD_AT: daysAgo(12) }, NOW).source === "build"
);
check(
  "...and it says so, because a cached build re-stamps it while serving old code",
  /LOWER bound/.test(deploymentAge({ NEXT_PUBLIC_BUILD_AT: daysAgo(12) }, NOW).detail)
);
check(
  "the commit date wins when both are present",
  deploymentAge({ NEXT_PUBLIC_BUILD_COMMIT_DATE: daysAgo(40), NEXT_PUBLIC_BUILD_AT: daysAgo(0) }, NOW).ageDays === 40,
  "a cached build stamps BUILD_AT as now while serving month-old code — the commit date is the honest one"
);

console.log("\n== 4. the stamp is actually baked, and by the build ==");
const config = stripComments(readFileSync("next.config.mjs", "utf8"));
check("next.config bakes the commit date", /NEXT_PUBLIC_BUILD_COMMIT_DATE: BUILD_COMMIT_DATE/.test(config));
check("...from git, at build time", /git", \["log", "-1", "--format=%cI"\]/.test(config));
check("...and a build time beside it", /NEXT_PUBLIC_BUILD_AT: new Date\(\)\.toISOString\(\)/.test(config));
// A THROW HERE WOULD BREAK EVERY BUILD ON A HOST WITHOUT GIT.
check("a missing git does not break the build", /catch \{\s*return "";/.test(config));

console.log("\n== 5. /api/health judges it rather than printing it ==");
const route = stripComments(readFileSync("src/app/api/health/route.ts", "utf8"));
check("the route asks", /deploymentAge\(process\.env\)/.test(route));
check("...and reports the age and the level", /age_days: age\.ageDays/.test(route) && /level: age\.level/.test(route));
check(
  "an ancient deployment makes the whole probe NOT ok",
  /age\.level === "ancient"[\s\S]{0,120}?body\.ok = false/.test(route),
  "a field beside `ok: true` is how forty days passed unnoticed"
);
check(
  "...with a reason a monitor can match on",
  /deployment_ancient/.test(route)
);
// THE EXACT DATE IS NOT FOR EVERYONE. The age is what a monitor alarms
// on; the provenance is one more thing an unauthenticated probe does not
// need.
check(
  "an unauthorised caller gets the level, not the detail",
  /if \(authorised\) body\.deployment = \{ \.\.\.\(body\.deployment as object\), detail: age\.detail \}/.test(route)
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
