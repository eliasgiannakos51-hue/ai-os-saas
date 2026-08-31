// THREE WAYS A PRODTEST CAN STOP BEING A TEST WITHOUT GOING RED.
//
// Found by running all 37 of them end to end rather than reading them:
//
//  1. IT CANNOT LAUNCH A BROWSER. Five launched with
//     `executablePath: process.env.CHROMIUM_PATH || undefined` while
//     thirty-two named a real path. The five died at
//     `browserType.launch: Executable doesn't exist at
//     .../chromium_headless_shell-1234/...` — which reads like a
//     Playwright install problem, not like two of our own lines
//     disagreeing. A test that cannot start a browser is not passing and
//     not failing. It is absent.
//
//  2. IT NEVER EXITS. health-probe printed "PASS — 20 checks passed, 0
//     failed" and then sat there. Measured: 671 seconds past its own
//     report, still alive, until something killed it. It calls
//     process.exit(1) on failure and nothing on success, so the only path
//     that reliably terminates is the failing one. Under a CI step with
//     no timeout that is a hung pipeline; under one with a timeout it is
//     a green test recorded as a red one.
//
//  3. IT LEAVES A PRODUCTION SERVER RUNNING. `npx next start` is npx ->
//     sh -> next-server. SIGKILL to the npx handle leaves the grandchild
//     alive and reparented to init, still holding its port and its build.
//     Measured after one full survey: THIRTEEN orphaned next-server
//     processes, the oldest 41 minutes old. pwa-audit.prodtest.mjs has
//     known this since it was written — it detaches and kills the group,
//     and says why in a comment. Twenty-three others did not.
//
// The third check is not only static. Grepping for `detached: true` is a
// wiring check and would pass on a file that detached and then killed the
// wrong thing, so the bottom of this file BUILDS THE SAME PROCESS TREE
// and proves the naive kill leaks and the group kill does not.
//
// Run: node scripts/tests/prodtest-hygiene.test.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DIR = "scripts/tests";
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".prodtest.mjs")).sort();
const src = new Map(FILES.map((f) => [f, readFileSync(`${DIR}/${f}`, "utf8")]));

check(`there are prodtests to check (${FILES.length})`, FILES.length >= 30, String(FILES.length));

// ---------------------------------------------------------------------
console.log("\n== 1. every prodtest can find a browser ==");
// The defect in its exact shape: `|| undefined` as the ONLY fallback.
// Not a ban on undefined — chromiumPath() returns undefined on a laptop
// with no /opt/pw-browsers, and that is the right answer there. A ban on
// the literal, which resolves to "let Playwright use a download that was
// never made".
const blindFallback = [...src].filter(([, s]) => /CHROMIUM_PATH\s*\|\|\s*undefined/.test(s)).map(([f]) => f);
check(
  `no prodtest falls back to undefined (${blindFallback.length})`,
  blindFallback.length === 0,
  blindFallback.join(", ") + " — resolve through lib/chromium.mjs instead"
);
// AND THE HELPER ITSELF ANSWERS, rather than being imported and unused.
const helper = "scripts/tests/lib/chromium.mjs";
check("the shared resolver exists", existsSync(helper));
const { chromiumPath } = await import("./lib/chromium.mjs");
const resolved = chromiumPath();
check(
  `it resolves to something usable here (${resolved ?? "undefined — Playwright's own"})`,
  resolved === undefined || existsSync(resolved),
  "it named a path that is not there, which is worse than naming nothing"
);
// A VALUE CHECK, not a wiring check: with the env var set it must WIN.
process.env.CHROMIUM_PATH = "/nonexistent/from-the-environment";
check(
  "CHROMIUM_PATH overrides the built-in path",
  chromiumPath() === "/nonexistent/from-the-environment",
  String(chromiumPath())
);
delete process.env.CHROMIUM_PATH;
check("...and removing it falls back again", chromiumPath() === resolved, String(chromiumPath()));

// ---------------------------------------------------------------------
console.log("\n== 2. every prodtest ends ==");
// An explicit exit on the SUCCESS path. `if (failures.length)
// process.exit(1)` is not one: it leaves success to the event loop
// draining, and a single retained handle turns a passing test into a
// hang.
const EXPLICIT_SUCCESS_EXIT =
  /process\.exit\(\s*(0\b|[A-Za-z_$][\w$]*\s*(===|!==|>|<|>=|<=)\s*0\s*\?|[A-Za-z_$][\w$]*\.length\s*(===|>)\s*0\s*\?)/;
const neverExits = [...src].filter(([, s]) => !EXPLICIT_SUCCESS_EXIT.test(s)).map(([f]) => f);
check(
  `every prodtest exits explicitly when it passes (${FILES.length - neverExits.length}/${FILES.length})`,
  neverExits.length === 0,
  neverExits.join(", ") + " — these only terminate via the failure path"
);
// THE PATTERN MUST NOT MATCH EVERYTHING, or the check above is a
// tautology. Proved against text that has the failure exit and no other.
check(
  "...and that pattern does not accept a failure-only exit",
  !EXPLICIT_SUCCESS_EXIT.test("if (failures.length > 0) process.exit(1);"),
  "the detector accepts the very shape it exists to reject"
);
check(
  "...and does accept the ternary form",
  EXPLICIT_SUCCESS_EXIT.test("process.exit(fail === 0 ? 0 : 1);")
);

// ---------------------------------------------------------------------
console.log("\n== 3. no prodtest leaves a production server behind ==");
// COMMENTS ARE NOT CODE, AND THIS GATE PROVED IT ON ITSELF. The first
// version searched the whole file for `detached: true`. The fix it
// enforces ships with a comment explaining why the group must be killed,
// and that comment contains the words `detached: true` — so a file whose
// spawn had been stripped of the option still passed, on the strength of
// a sentence about the option. The mutation that should have gone red
// went green.
//
// So: strip line and block comments, then read the OPTIONS OBJECT of the
// server spawn itself. Nothing outside the call can vouch for the call.
function code(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}
/** The text between `spawn("npx", ["next","start"...], ` and its closing `)`. */
function serverSpawnOptions(s) {
  const at = code(s).search(/spawn\(\s*"npx"\s*,\s*\[\s*"next"\s*,\s*"start"/);
  if (at < 0) return null;
  const c = code(s);
  let i = c.indexOf("{", c.indexOf("]", at));
  if (i < 0) return null;
  const from = ++i;
  let depth = 1;
  while (i < c.length && depth > 0) {
    if (c[i] === "{") depth++;
    else if (c[i] === "}") depth--;
    i++;
  }
  return c.slice(from, i - 1);
}
const spawnsServer = [...src].filter(([, s]) => /spawn\(\s*"npx"\s*,\s*\[\s*"next"\s*,\s*"start"/.test(code(s)));
check(`prodtests that start a server (${spawnsServer.length})`, spawnsServer.length > 15, String(spawnsServer.length));
// AND THE EXTRACTOR FINDS SOMETHING, or every check below inspects "".
const noOptions = spawnsServer.filter(([, s]) => !(serverSpawnOptions(s) || "").includes("env")).map(([f]) => f);
check(
  `the spawn options were located in all of them (${spawnsServer.length - noOptions.length}/${spawnsServer.length})`,
  noOptions.length === 0,
  noOptions.join(", ") + " — an empty slice agrees with any rule"
);
const notDetached = spawnsServer.filter(([, s]) => !/detached:\s*true/.test(serverSpawnOptions(s) || "")).map(([f]) => f);
check(
  `all of them detach it (${spawnsServer.length - notDetached.length}/${spawnsServer.length})`,
  notDetached.length === 0,
  notDetached.join(", ")
);
const noGroupKill = spawnsServer.filter(([, s]) => !/process\.kill\(\s*-\s*server\.pid/.test(code(s))).map(([f]) => f);
check(
  `all of them kill the process GROUP (${spawnsServer.length - noGroupKill.length}/${spawnsServer.length})`,
  noGroupKill.length === 0,
  noGroupKill.join(", ") + " — killing the npx handle orphans next-server"
);

// ---------------------------------------------------------------------
console.log("\n== 4. and that is not a spelling rule — the leak, reproduced ==");
// Two identical process trees (a wrapper shell that spawns a long-lived
// grandchild, exactly the shape `npx next start` makes). One killed the
// way twenty-three prodtests killed it, one killed the way pwa-audit
// does. If the naive kill did NOT leak here, this whole section is
// asserting nothing and says so.
// A ZOMBIE IS NOT ALIVE, and process.kill(pid, 0) cannot tell the
// difference — it succeeds on any pid still in the table, reaped or not.
// The first version of this check used it and reported the group kill as
// having failed when the grandchild was sitting there as
// `[sleep] <defunct>`. Under a normal init that window is milliseconds;
// this container's pid 1 does not reap, so it is forever, and the check
// would have been permanently wrong about a fix that works.
//
// /proc/<pid>/stat's third field is the state. Z is dead-and-unreaped.
function alive(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    // The comm field is parenthesised and may contain spaces; state is
    // the first character after the closing paren.
    const state = stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
    return state !== "Z";
  } catch {
    return false; // gone from the table entirely
  }
}
async function tree() {
  // sh -c 'sleep 300 & echo $!; wait' — the child pid on stdout, so the
  // grandchild is addressable. Mirrors npx -> sh -> next-server.
  const p = spawn("sh", ["-c", "sleep 300 & echo $!; wait"], { stdio: ["ignore", "pipe", "ignore"], detached: true });
  const kid = await new Promise((r) => p.stdout.once("data", (d) => r(Number(String(d).trim()))));
  return { wrapper: p, grandchild: kid };
}

const naive = await tree();
naive.wrapper.kill("SIGKILL");            // what 23 prodtests did
await sleep(400);
const leaked = alive(naive.grandchild);
check(
  `the naive kill DOES leak the grandchild (pid ${naive.grandchild} alive: ${leaked})`,
  leaked === true,
  "the leak did not reproduce, so check 3 above is defending against nothing on this platform"
);
try { process.kill(naive.grandchild, "SIGKILL"); } catch { /* tidy up */ }

const grouped = await tree();
try { process.kill(-grouped.wrapper.pid, "SIGKILL"); } catch { grouped.wrapper.kill("SIGKILL"); }
await sleep(400);
const reaped = !alive(grouped.grandchild);
check(
  `the group kill reaps it (pid ${grouped.grandchild} gone: ${reaped})`,
  reaped === true,
  "detached + process.kill(-pid) did not clean up either — the recommended fix does not work here"
);
try { process.kill(grouped.grandchild, "SIGKILL"); } catch { /* already gone */ }

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
