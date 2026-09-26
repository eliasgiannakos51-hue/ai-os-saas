// A SILENT PROBE THAT CANNOT REPORT ITS OWN SILENCE.
//
// api/nav/track swallows every error on purpose — the route says so and
// the reason is sound: a missed navigation costs one row out of a
// ninety-day window, an error toast on a page that rendered perfectly
// costs the reader's trust. The cost of that decision is that
// nav_events can stop filling and NOTHING ANYWHERE SAYS SO.
//
// It did. On 2026-09-11 the newest row was four days old; the owner
// found it by running a query by hand, and the only reason the question
// got asked at all was that a redesign phase was blocked on the data.
//
// THE ONE DISTINCTION THIS WHOLE FILE IS ABOUT: zero rows has two
// causes. Nobody opened the dashboard, or every insert was refused.
// A probe that reports "no navigation" for both is the same useless
// shape as the health route's old function sweep, which named six
// functions missing while all six existed. So the verdict is computed
// against a SECOND table that ordinary use writes and that does not go
// through api/nav/track — and only the combination "the product is in
// use AND navigation is not being recorded" is a fault.
//
// Run: node scripts/tests/nav-freshness.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const FRESH = "src/lib/health/nav-freshness.ts";
const HEALTH = "src/app/api/health/route.ts";
const mod = await loadTs(FRESH);
const src = stripComments(readFileSync(FRESH, "utf8"));
const health = stripComments(readFileSync(HEALTH, "utf8"));

console.log("== 1. the threshold, and that it is a constant ==");
ok(`the window is a named constant (${mod.NAV_STALE_HOURS}h)`, typeof mod.NAV_STALE_HOURS === "number");
ok("...and it is 48 hours, as asked", mod.NAV_STALE_HOURS === 48);

console.log("\n== 2. the verdict tells the two causes apart ==");
// The whole point. A probe that cannot separate these is a probe that
// cries wolf every weekend, and one that gets muted.
ok("it reads a SECOND table, not just nav_events",
  /from\("nav_events"\)|newestAt\(supabase, "nav_events"\)/.test(src) && /rate_limit_log/.test(src),
  "with one table, 'nobody came' and 'every insert failed' are the same reading");
ok("...and that table is not written through api/nav/track",
  !/rate_limit_log/.test(stripComments(readFileSync("src/app/api/nav/track/route.ts", "utf8"))),
  "a comparison table that the tracker itself writes proves nothing — both columns would go silent together");
ok("an unanswerable question reads as unchecked, never as ok",
  /catch \{[\s\S]{0,120}verdict: "unchecked"/.test(src),
  "the health route's own history: a probe that guesses is worse than one that abstains");

console.log("\n== 3. it is wired in, and it does not page anybody ==");
ok("the health route reports it", /body\.nav = await navFreshness\(/.test(health));
{
  // ANCHORED ON THE BLOCK, NOT ON A WORD. `probe.dbAnswered` also appears
  // where the probe is built, two hundred lines earlier, so an indexOf
  // against that word was satisfied by an assignment placed ANYWHERE
  // after it — including outside the guard. The mutation suite put one
  // before the block and this check did not move.
  const guard = health.indexOf("if (probe.dbAnswered) {");
  const assignments = [...health.matchAll(/body\.nav = /g)].map((m) => m.index);
  // TWO IS CORRECT, not one: the call and the catch that answers
  // "unchecked" when it throws. What matters is not how many there are
  // but that EVERY one of them is inside the guard.
  ok(`...the assignments were found (${assignments.length})`, assignments.length >= 1);
  ok("...only when the database actually answered",
    guard > 0 && assignments.every((at) => at > guard),
    "asking a database that did not answer produces a false absence");
}
ok("...and it does not touch ok or the status code",
  !/body\.nav[\s\S]{0,200}probe\.ok =/.test(health) && /status: probe\.ok \? 200 : 503/.test(health),
  "a quiet weekend is not an outage — that is how the last version of this endpoint lost its meaning");
ok("...on its own client, so it cannot disturb the probe's ms",
  /navFreshness\(createAdminClient\(\)\)/.test(health));

console.log("\n== 4. the arithmetic ==");
{
  // EXECUTED, NOT RE-IMPLEMENTED. This block used to carry its own copy
  // of the four branches and compare that copy against itself, which
  // agreed no matter what the module did — the mutation suite deleted
  // the STALE branch from the source and every case here still passed.
  // navVerdict is exported for exactly this.
  ok("the verdict is an exported pure function this file can run", typeof mod.navVerdict === "function");
  const cases = [
    ["navigation recent", 2, 1, "ok"],
    ["navigation recent, nothing else", 2, null, "ok"],
    ["in use, navigation four days old — THE FAULT", 96, 1, "STALE"],
    ["in use, navigation never — THE FAULT", null, 3, "STALE"],
    ["nobody came", 96, 96, "quiet"],
    ["nothing at all", null, null, "unchecked"],
  ];
  for (const [label, nav, act, want] of cases) {
    const got = mod.navVerdict(nav, act);
    ok(`${label} -> ${want}`, got === want, `got ${got}`);
  }

  // A NULL THAT CAME FROM A REFUSAL IS NOT A NULL THAT CAME FROM AN EMPTY
  // TABLE, and the difference is the whole value of this probe. Before
  // 2026-09-26 newestAt() returned null for both, so a database that
  // refused the read reported "quiet" — nobody came — which is the
  // calmest possible way to be wrong. Live production was reading exactly
  // that shape.
  const refused = [
    // THE DISCRIMINATING ONE, and the first version of this table did not
    // have it. With nav and activity both null the fall-through already
    // answers "unchecked", so removing the guard changes nothing and the
    // mutation reads as MISSED. An OLD navigation row plus a refused
    // activity read is the case where the guard is the only thing between
    // the answer and a confident "nobody came".
    ["navigation old, activity read refused", 96, null, { nav: true, activity: false }, "unchecked"],
    ["activity read refused, no navigation", null, null, { nav: true, activity: false }, "unchecked"],
    ["navigation read refused, no activity", null, null, { nav: false, activity: true }, "unchecked"],
    ["both refused", null, null, { nav: false, activity: false }, "unchecked"],
    ["both asked, both empty — genuinely quiet", null, null, { nav: true, activity: true }, "unchecked"],
    ["both asked, both old — genuinely quiet", 96, 96, { nav: true, activity: true }, "quiet"],
    // A refusal must not be able to HIDE the fault either: recent activity
    // with no navigation row is STALE whether or not the nav read worked.
    ["in use, navigation read refused — still THE FAULT", null, 3, { nav: false, activity: true }, "STALE"],
    // ...nor manufacture one: a recent navigation row is proof on its own.
    ["navigation recent, activity read refused", 2, null, { nav: true, activity: false }, "ok"],
  ];
  for (const [label, nav, act, asked, want] of refused) {
    const got = mod.navVerdict(nav, act, asked);
    ok(`${label} -> ${want}`, got === want, `got ${got}`);
  }

  // AND THE READER THAT FEEDS IT. The pure function can only be right if
  // something tells it the truth about what was asked.
  ok(
    "newestAt separates a refused read from an empty table",
    /if \(error\) return \{ ageHours: null, asked: false \}/.test(src) &&
      /if \(!data\) return \{ ageHours: null, asked: true \}/.test(src),
    "one null for two opposite facts is what produced the wrong verdict"
  );
  // THE COMPARISON HAS TO RANGE OVER ACTIVITY THAT COULD HAVE PRODUCED A
  // NAVIGATION ROW. A rejected password writes rate_limit_log and never
  // reaches a dashboard page, so counting it turns one wrong login into
  // "the tracker is broken" — which is what production reported on
  // 2026-09-26 after a test harness typed one.
  ok(
    "the activity comparison excludes what a signed-out stranger can write",
    /ANONYMOUS_SCOPES/.test(src) && /excludeScopes: ANONYMOUS_SCOPES/.test(src),
    "otherwise a failed login is indistinguishable from a broken tracker"
  );
  ok(
    "...and the excluded list is the one the routes actually write",
    (() => {
      const names = [...src.matchAll(/ANONYMOUS_SCOPES = \[([^\]]+)\]/g)][0]?.[1] ?? "";
      const declared = [...names.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
      // THE POPULATION IS THE ROUTES, so the check reads the routes.
      const written = [];
      for (const f of ["src/app/api/auth/login/route.ts", "src/app/api/auth/device-check/route.ts"]) {
        const r = readFileSync(f, "utf8");
        for (const m of r.matchAll(/SCOPE = "([a-z_]+)"|scope: "([a-z_]+)"/g)) written.push(m[1] ?? m[2]);
      }
      return written.length > 0 && written.every((w) => declared.includes(w));
    })(),
    "a scope added to an anonymous route and not to the list walks straight back in"
  );
  ok(
    "...and the report carries which reads happened",
    /asked: \{ nav:/.test(src),
    "a reader of /api/health has to be able to tell a quiet product from a blind probe"
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
