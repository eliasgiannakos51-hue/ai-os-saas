#!/usr/bin/env node
/*
 * THE UPTIME PROBE, AGAINST A REAL PRODUCTION BUILD.
 *
 * Everything this endpoint claims is a claim about RUNTIME — that it
 * answers without a session, that it goes red when the database does,
 * that it comes back when the database does, and that hammering it does
 * not hammer the database. Not one of those can be read off the source.
 * So this runs `next build`, starts the real server against a stand-in
 * Supabase, and asks it.
 *
 * THE DENIAL-OF-SERVICE CLAIM IS MEASURED, NOT ASSERTED. The route's own
 * comment says a flood collapses to one query per five seconds. Section 4
 * makes fifty requests inside one window and counts the queries the
 * stand-in actually received. A comment that says "cached" beside code
 * that queries every time is exactly the kind of true-looking sentence
 * this project has been bitten by.
 *
 * Run: node scripts/tests/health-probe.prodtest.mjs
 */
import { startProdHarness } from "../lib/prod-harness.mjs";

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

// Must match PROBE_CACHE_MS in src/app/api/health/route.ts. Read from the
// source rather than duplicated as a number, so the two cannot drift and
// leave this test quietly measuring the wrong window.
const { readFileSync } = await import("node:fs");
const routeSrc = readFileSync("src/app/api/health/route.ts", "utf8");
const cacheMs = Number(
  (routeSrc.match(/const PROBE_CACHE_MS = ([\d_]+);/)?.[1] ?? "").replace(/_/g, "")
);
check("PROBE_CACHE_MS was read from the route source", Number.isFinite(cacheMs) && cacheMs > 0, `got ${cacheMs}`);

const harness = await startProdHarness({
  supaPort: 54348,
  tableRows: { user_onboarding: [{ user_id: "00000000-0000-0000-0000-000000000001" }] },
});
const url = `${harness.origin}/api/health`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // -------------------------------------------------------------------
  console.log("\n== 1. it answers a stranger ==");
  //
  // No cookie, no header, nothing. This is the whole point of the route:
  // a monitor has no session, and a probe behind auth measures the auth.
  const r1 = await fetch(url);
  const b1 = await r1.json();
  check("200 with no session at all", r1.status === 200, `got ${r1.status}`);
  check("says it is up", b1.ok === true && b1.db === true, JSON.stringify(b1));
  check("reports how long the probe took", typeof b1.ms === "number" && b1.ms >= 0, JSON.stringify(b1));
  check(
    "no-store, so a proxy cannot keep serving a stale verdict",
    /no-store/.test(r1.headers.get("cache-control") ?? ""),
    `Cache-Control: ${r1.headers.get("cache-control")}`
  );

  // -------------------------------------------------------------------
  console.log("\n== 2. it discloses nothing but up or down ==");
  //
  // Checked as the COMPLETE key set rather than by looking for known-bad
  // names: a test that greps for "version" passes the day somebody adds
  // "commit" or "tables". The allowed set is closed.
  const keys = Object.keys(b1).sort();
  check(
    "the body has exactly {ok, db, ms, reason, stage} and nothing else",
    JSON.stringify(keys) === JSON.stringify(["db", "ms", "ok", "reason", "stage"]),
    `keys were ${JSON.stringify(keys)}`
  );
  check("a healthy answer says so in the vocabulary", b1.reason === "ok" && b1.stage === "query", JSON.stringify(b1));
  check("no detail reaches an anonymous caller on a healthy probe", !("detail" in b1));
  const bodyText = JSON.stringify(b1);
  check(
    "no table name, no error text, no version string anywhere in the body",
    !/agent_templates|supabase|postgres|error|version|stack|[0-9]+\.[0-9]+\.[0-9]+/i.test(bodyText),
    bodyText
  );

  // -------------------------------------------------------------------
  console.log("\n== 3. it goes red when the database does — and comes back ==");
  //
  // The half of this route that only runs during an incident, which is
  // the half that has never been executed in any test in this repository
  // before now.
  harness.setTableMissing("user_onboarding", true);
  await sleep(cacheMs + 500);
  const r2 = await fetch(url);
  const b2 = await r2.json();
  check("503 when the schema is behind", r2.status === 503, `got ${r2.status}`);
  check("ok is false — the app IS broken", b2.ok === false, JSON.stringify(b2));
  // THE DISTINCTION THIS WHOLE CHANGE EXISTS FOR. Production answered
  // db:false for a missing table while the database was entirely healthy.
  // A missing table ANSWERED, so db stays true and `reason` carries it.
  check(
    "db stays TRUE — a missing table is not a dead database",
    b2.db === true,
    `db=${b2.db}; reporting false here sends the on-call engineer to a green dashboard`
  );
  check("the reason names the schema, not the network", b2.reason === "schema_missing", JSON.stringify(b2));
  check("the stage names the step that failed", b2.stage === "query", JSON.stringify(b2));
  check(
    "the failure body still discloses NOTHING an anonymous caller can map",
    JSON.stringify(Object.keys(b2).sort()) === JSON.stringify(["db", "ms", "ok", "reason", "stage"]) &&
      !/PGRST205|schema cache|user_onboarding|public\./i.test(JSON.stringify(b2)),
    JSON.stringify(b2)
  );
  // ...and verbose without the secret changes nothing.
  const rV = await fetch(url + "?verbose=1");
  const bV = await rV.json();
  check(
    "?verbose=1 without the bearer token is refused silently — same closed body",
    !("detail" in bV) && !/PGRST205|schema cache/i.test(JSON.stringify(bV)),
    JSON.stringify(bV)
  );

  harness.setTableMissing("user_onboarding", false);
  await sleep(cacheMs + 500);
  const r3 = await fetch(url);
  check(
    "recovers on its own once the database is back — the 503 is not latched",
    r3.status === 200,
    `got ${r3.status}; a probe that stays red after recovery is worse than none`
  );

  // -------------------------------------------------------------------
  console.log("\n== 4. a flood does not become a flood of queries ==");
  //
  // MEASURED. Fifty requests inside one cache window; the stand-in counts
  // how many actually reached the database.
  await sleep(cacheMs + 500);
  const before = harness.readCount("user_onboarding");
  const FLOOD = 50;
  const responses = await Promise.all(Array.from({ length: FLOOD }, () => fetch(url)));
  const queries = harness.readCount("user_onboarding") - before;
  check(`all ${FLOOD} flood requests were answered`, responses.every((r) => r.status === 200));
  // ONE. Not "fewer than fifty" — a result-only cache already gives
  // "fewer", and that is exactly the answer that looked fine here while
  // forty-five queries went out. The number that distinguishes a real
  // single-flight from a lucky race is 1.
  check(
    `${FLOOD} simultaneous requests cost ${queries} database query, not ${FLOOD}`,
    queries === 1,
    `${queries} queries — requests arriving before the first probe returns are each starting their own`
  );
  // The converse, so "cached" cannot be achieved by never querying at all:
  // after the window it MUST query again, or the probe is reporting a
  // memory of health rather than health.
  await sleep(cacheMs + 500);
  const beforeAfterWindow = harness.readCount("user_onboarding");
  await fetch(url);
  check(
    "after the window it queries the database again",
    harness.readCount("user_onboarding") > beforeAfterWindow,
    "a probe that stops querying is reporting a memory, not the system"
  );
} finally {
  await harness.cleanup();
}

console.log(`\n${failures.length === 0 ? "PASS" : "FAIL"} — ${pass} checks passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
