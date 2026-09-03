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
  // `schema` joined the body on 2026-09-01 (66ae4c4): the canary sweep,
  // which names missing objects on purpose so a broken page can be
  // diagnosed without a secret. Everything else stays closed.
  check(
    "the body has exactly {ok, db, ms, reason, schema, stage} and nothing else",
    JSON.stringify(keys) === JSON.stringify(["db", "ms", "ok", "reason", "schema", "stage"]),
    `keys were ${JSON.stringify(keys)}`
  );
  check("the schema sweep says how many canaries it checked, and that all were found", b1.schema && b1.schema.ok === true && b1.schema.checked >= 10 && Array.isArray(b1.schema.missing) && b1.schema.missing.length === 0, JSON.stringify(b1.schema));
  check("a healthy answer says so in the vocabulary", b1.reason === "ok" && b1.stage === "query", JSON.stringify(b1));
  check("no detail reaches an anonymous caller on a healthy probe", !("detail" in b1));
  const bodyText = JSON.stringify({ ...b1, schema: undefined });
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
    "the failure body still discloses NOTHING an anonymous caller can map — outside the canary names",
    JSON.stringify(Object.keys(b2).sort()) === JSON.stringify(["db", "ms", "ok", "reason", "schema", "stage"]) &&
      !/PGRST205|schema cache|public\./i.test(JSON.stringify({ ...b2, schema: undefined })),
    JSON.stringify(b2)
  );
  check(
    "the canary sweep names the missing column and its migration, and nothing that is not a name",
    Array.isArray(b2.schema?.missing) && b2.schema.missing.some((m) => m.object === "user_onboarding.home_seen_at" && /\.sql$/.test(m.migration)) &&
      !/PGRST|schema cache|error/i.test(JSON.stringify(b2.schema)),
    JSON.stringify(b2.schema)
  );

  console.log("\n== 3b. a function that EXISTS but takes arguments is not 'missing' ==");
  // PostgREST answers a no-argument call to a function with required
  // parameters with the same words as absence — "Could not find the
  // function ... in the schema cache" — plus a hint naming the function
  // that does exist. Six canaries in production were listed as missing
  // this way while all six were working. Absence is the hintless case.
  harness.setTableFailing("rpc/search_all", true, {
    status: 404,
    body: {
      code: "PGRST202",
      message: "Could not find the function public.search_all without parameters in the schema cache",
      hint: "Perhaps you meant to call the function public.search_all(p_query, p_kinds, p_module, p_since, p_limit)",
      details: "Searched for the function public.search_all without parameters, but no matches were found in the schema cache.",
    },
  });
  harness.setTableFailing("rpc/merge_user_metadata", true, {
    status: 404,
    body: {
      code: "PGRST202",
      message: "Could not find the function public.merge_user_metadata without parameters in the schema cache",
      hint: null,
      details: "Searched for the function public.merge_user_metadata without parameters, but no matches were found in the schema cache.",
    },
  });
  await sleep(cacheMs + 500);
  const bF = await (await fetch(url)).json();
  const listed = (bF.schema?.missing ?? []).map((m) => m.object);
  check("a present function called without its arguments is NOT listed", !listed.includes("search_all()"), JSON.stringify(listed));
  check("a function that is really absent IS listed", listed.includes("merge_user_metadata()"), JSON.stringify(listed));
  harness.setTableFailing("rpc/search_all", false);
  harness.setTableFailing("rpc/merge_user_metadata", false);
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
  // TWO, not one: the probe's own read and ONE canary sweep (the column
  // canary user_onboarding.home_seen_at reads the same table). The sweep
  // used to run on every request — 51 reads for this flood — and is now
  // cached with the probe (api/health/route.ts, currentSchemaSweep).
  check(
    `${FLOOD} simultaneous requests cost ${queries} database queries (the probe and one canary sweep), not ${FLOOD}`,
    queries === 2,
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
// AND EXIT WHEN IT PASSES, which this did not.
//
// Measured: it printed "PASS — 20 checks passed, 0 failed" and then stayed
// alive for another 671 seconds, holding whatever handle the harness left
// open, until something outside killed it. The only path that reliably
// terminated was the failing one, so a green run looked like a hang and,
// under a CI step with a timeout, would be recorded as a failure.
process.exit(0);
