// EVERY DATABASE FUNCTION THE APP CALLS, AND WHETHER ANYTHING WOULD SAY
// SO IF IT WERE NOT THERE.
//
// WHAT THIS WAS WRITTEN FOR, 2026-09-11. api/search/route.ts calls
// `search_all_localized`. The health endpoint's canary list named
// `search_all` — the five-argument forwarder the route stopped calling
// when 20260914000000_search_index_locale.sql shipped. So the probe was
// watching a function nothing calls while the one every ⌘K query depends
// on went unwatched, and if that migration had never been pasted into the
// SQL editor every search would 500 while /api/health reported ok.
//
// A sweep for the general case found the specific one was not rare:
// 36 distinct RPCs are called from src/ and 27 of them had no canary.
//
// WHY A SEPARATE GATE FROM schema-canaries.test.mjs. That one derives
// what the newest TWELVE migrations add, and says plainly in its own
// header that objects older than the window can be missing and invisible
// to it. `search_all_localized` is from 20260914 — outside the window on
// the day the sweep ran. Age is the wrong question for a function: the
// right one is whether src CALLS it, which does not decay.
//
// BOTH WAYS, like lib/absent-on-purpose.mjs. An RPC with no canary and no
// exemption goes red; an exemption for an RPC nothing calls any more goes
// red; and a function canary for something src never calls goes red. A
// list that only fails in one direction rots in the other, which is
// precisely how `search_all` came to be the one being watched.
//
// Run: node scripts/tests/rpc-canaries.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

// ---------------------------------------------------------------------
// RPCs THAT NEED NO CANARY, AND THE REASON EACH ONE DOES NOT.
//
// Exactly one reason is accepted today and it is a real one: the function
// is part of the BASELINE schema. A database missing the baseline is not a
// database one canary behind — nothing in the product works at all, the
// health probe's own user_onboarding read fails first, and `db` goes
// false. A canary there would report a state no user can reach.
//
// This is NOT a place to put "probably fine". Anything added after the
// baseline can be missing while everything else works, which is the exact
// condition a canary exists for.
// ---------------------------------------------------------------------
const BASELINE = "part of the baseline schema — a database without it fails the health probe's own read first, so `db` goes false and no canary is needed";
const RPC_NEEDS_NO_CANARY = {
  claim_activation_run: BASELINE,
  consume_free_chat: BASELINE,
  delete_user_file_objects: BASELINE,
  prune_integration_sync_log: BASELINE,
  record_production_error: BASELINE,
  record_site_view: BASELINE,
  release_expired_reservations: BASELINE,
  release_free_chat: BASELINE,
  release_reservation: BASELINE,
  reserve_credits: BASELINE,
};

// ---------------------------------------------------------------------
// CANARIES FOR FUNCTIONS src DOES NOT CALL, and why they stay.
// ---------------------------------------------------------------------
const CANARY_WITHOUT_CALLER = {
  search_all:
    "the five-argument forwarder 20260914 left behind. api/search calls " +
    "search_all_localized now, but unified-search.dbtest.mjs re-runs the " +
    "20260824 migration to prove it is safe to apply twice, and that file " +
    "re-creates this signature — so its absence is still a real signal.",
};

// ---------------------------------------------------------------------
// The RPCs src actually calls, read out of the tree.
// ---------------------------------------------------------------------
const SRC = "src";
const walk = (dir) => readdirSync(dir).flatMap((e) => {
  const p = `${dir}/${e}`;
  return statSync(p).isDirectory() ? walk(p) : (/\.tsx?$/.test(p) ? [p] : []);
});
const files = walk(SRC);
const calledIn = new Map();
for (const f of files) {
  for (const m of readFileSync(f, "utf8").matchAll(/\.rpc\(\s*"([a-z0-9_]+)"/g)) {
    if (!calledIn.has(m[1])) calledIn.set(m[1], []);
    calledIn.get(m[1]).push(f);
  }
}
const called = [...calledIn.keys()].sort();

const { SCHEMA_CANARIES } = await loadTs("src/lib/health/schema-canaries.ts");
const canaried = new Set(SCHEMA_CANARIES.filter((c) => c.kind === "function").map((c) => c.fn));

console.log("== 1. the call sites are read, not assumed ==");
ok(`src/ calls database functions by name (${called.length} distinct, across ${files.length} files)`, called.length > 20,
  `parsed: ${called.slice(0, 6).join(", ")}…`);
ok("...including the one this gate was written for", called.includes("search_all_localized"),
  "api/search/route.ts no longer calls search_all_localized — if the route changed, this gate's\n" +
    "        reason for existing changed with it and the header needs rewriting.");
ok(`there are function canaries to check against (${canaried.size})`, canaried.size > 5);

console.log("\n== 2. every RPC the app calls is watched, or says why not ==");
for (const fn of called) {
  const has = canaried.has(fn);
  const exempt = Object.prototype.hasOwnProperty.call(RPC_NEEDS_NO_CANARY, fn);
  ok(
    `${fn}`,
    has || exempt,
    `src calls ${fn}() and nothing would report it missing.\n` +
      `        called from: ${calledIn.get(fn).slice(0, 2).join(", ")}\n` +
      `        Add a canary to src/lib/health/schema-canaries.ts saying what a user loses,\n` +
      `        or add it to RPC_NEEDS_NO_CANARY here with the reason it needs none.`
  );
  if (exempt) {
    ok(`  …and its exemption carries a reason`, RPC_NEEDS_NO_CANARY[fn].length > 40);
    ok(`  …and it is not ALSO a canary`, !has,
      `${fn} is both exempted here and canaried in schema-canaries.ts — one of the two is wrong.`);
  }
}

console.log("\n== 2b. and no exemption outlives the call it excuses ==");
for (const fn of Object.keys(RPC_NEEDS_NO_CANARY)) {
  ok(`${fn} is still called by src`, calledIn.has(fn),
    `RPC_NEEDS_NO_CANARY excuses ${fn}, which src no longer calls — drop the entry.`);
}

console.log("\n== 3. and no canary outlives the call it watches ==");
// The failure that produced this file. search_all stayed a canary for
// eighteen days after the route stopped calling it, and the list looked
// complete the whole time.
for (const c of SCHEMA_CANARIES.filter((x) => x.kind === "function")) {
  const declared = Object.prototype.hasOwnProperty.call(CANARY_WITHOUT_CALLER, c.fn);
  ok(
    `${c.fn} is called by src, or says why it is watched anyway`,
    calledIn.has(c.fn) || declared,
    `${c.fn} is a canary and src never calls it. Either the code moved on — as it did from\n` +
      `        search_all to search_all_localized — or the canary is for something else; say which in\n` +
      `        CANARY_WITHOUT_CALLER.`
  );
}
for (const fn of Object.keys(CANARY_WITHOUT_CALLER)) {
  ok(`${fn}'s exception is still needed`, !calledIn.has(fn),
    `CANARY_WITHOUT_CALLER says src does not call ${fn}, but it does — drop the entry.`);
  ok(`  …and it carries a reason`, CANARY_WITHOUT_CALLER[fn].length > 40);
}

console.log(`\n${failures.length ? "FAILED" : "ALL PASS"}: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length ? 1 : 0);
