// THE CHECK THAT SEES WHAT THE MARKER CHECK CANNOT.
//
// check-mutation-markers.mjs looks for the SHAPES a defanged guard takes.
// It was measured at zero false positives before it shipped, which is why
// nobody bypasses it — and it is blind to a mutation that leaves no shape.
//
// Measured, not assumed. The exact mutant a killed run left in the tree
// during the session that wrote this:
//
//     -    if (stripped.length === ch.length) folded = stripped;
//     +    folded = stripped;
//
// produces `mutation-markers: clean (1274 files)` and exit 0. That guard
// is load-bearing for Korean, Thai, Hebrew, Devanagari and Arabic, and
// the deleted line looks exactly like a deliberate simplification.
//
// So this gate is about the OTHER check — check-mutation-tree.mjs — and
// every assertion below RUNS it against a tree it has been given, rather
// than reading its source.
//
// Run: node scripts/tests/mutation-tree.test.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";

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

const CHECK = "scripts/check-mutation-tree.mjs";
const MARKERS = "scripts/check-mutation-markers.mjs";

function run(script, env = {}) {
  try {
    const out = execFileSync("node", [script], {
      encoding: "utf8",
      stdio: "pipe",
      env: { ...process.env, ...env },
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout ?? "") + String(e.stderr ?? "") };
  }
}

// ---------------------------------------------------------------------
console.log("== 1. the premise: the marker check really is blind to this ==");
// IF THIS EVER GOES RED, the marker check grew a way to see a deleted
// line and half the reason for check-mutation-tree.mjs is gone. That
// would be good news, and it should be noticed rather than assumed away.
{
  const GUARD_FILE = "src/lib/text/unicode-patterns.ts";
  const GUARD = "    if (stripped.length === ch.length) folded = stripped;";
  const before = readFileSync(GUARD_FILE, "utf8");
  check("the guard the incident deleted is still there", before.includes(GUARD));
  writeFileSync(GUARD_FILE, before.replace(GUARD, "    folded = stripped;"));
  const markers = run(MARKERS);
  const tree = run(CHECK, { CI: "1" });
  writeFileSync(GUARD_FILE, before);
  check("check-mutation-markers reports CLEAN with the mutant in the tree", markers.code === 0,
    `exit ${markers.code}`);
  check("...and check-mutation-tree does not", tree.code === 1, `exit ${tree.code}`);
  check("...naming the file", /unicode-patterns\.ts/.test(tree.out), tree.out.slice(0, 200));
  check("the tree is back", readFileSync(GUARD_FILE, "utf8") === before);
}

// ---------------------------------------------------------------------
console.log("\n== 2. a killed run's sidecar ==");
{
  const clean = run(CHECK);
  check("a clean tree passes", clean.code === 0, clean.out);

  const DIR = "scripts/tests/.guard-sidecar";
  const existed = existsSync(DIR);
  if (!existed) mkdirSync(DIR, { recursive: true });
  const probe = `${DIR}/.mutation-tree-probe.json`;
  writeFileSync(probe, JSON.stringify({ file: "x", text: "y" }));
  const guard = run(CHECK);
  unlinkSync(probe);
  if (!existed) rmSync(DIR, { recursive: true, force: true });
  check("the guard scanner's sidecar fails it", guard.code === 1, `exit ${guard.code}`);
  check("...and says how to heal it", /restores from the sidecar on startup/.test(guard.out));

  const SHARED = "scripts/tests/.mutation-sidecar.json";
  check("no shared sidecar is lying around right now", !existsSync(SHARED));
  writeFileSync(SHARED, JSON.stringify({ "src/lib/nav/nav-path.ts": "whatever" }));
  const shared = run(CHECK);
  unlinkSync(SHARED);
  check("the shared sidecar fails it too", shared.code === 1, `exit ${shared.code}`);
  check("...naming the file it holds", /nav-path\.ts/.test(shared.out));
}

// ---------------------------------------------------------------------
console.log("\n== 3. a declared mutation, actually applied ==");
{
  const F = "src/lib/nav/nav-path.ts";
  const before = readFileSync(F, "utf8");
  const FROM = "  if (!known) return NAV_UNKNOWN_PATH;";
  const TO = "  if (!known) return `/dashboard/${first}`;";
  check("the anchor is real", before.includes(FROM));
  writeFileSync(F, before.replace(FROM, TO));
  const r = run(CHECK);
  writeFileSync(F, before);
  check("it is found", r.code === 1, `exit ${r.code}`);
  check("...and the suite that declares it is named", /nav-events\.mutation\.mjs/.test(r.out), r.out.slice(0, 300));
}

// ---------------------------------------------------------------------
console.log("\n== 4. dirty, and the difference CI makes ==");
// THE ONLY CHECK THAT CAN BE WRONG. A developer editing one of these
// files has a dirty tree for an ordinary reason, so it fails where the
// tree starts clean and prints loudly everywhere else. A rule with false
// positives is a rule people learn to pass with --no-verify — that is
// check-mutation-markers.mjs's own lesson and it applies here.
{
  const F = "src/lib/nav/nav-path.ts";
  const before = readFileSync(F, "utf8");
  // A change that is NOT any declared mutation, so only check 3 can see it.
  writeFileSync(F, before + "\n// a developer was here\n");
  const ci = run(CHECK, { CI: "1" });
  const local = run(CHECK, { CI: "" });
  writeFileSync(F, before);
  check("in CI a dirty mutation target fails", ci.code === 1, `exit ${ci.code}`);
  check("outside CI it does not fail", local.code === 0, `exit ${local.code}`);
  check("...but it says so, loudly", /WARNING \(not failing outside CI\)/.test(local.out), local.out.slice(0, 200));
  check("the tree is back", readFileSync(F, "utf8") === before);
}

// ---------------------------------------------------------------------
console.log("\n== 5. it is wired in, and it looked at something ==");
{
  const build = JSON.parse(readFileSync("package.json", "utf8")).scripts.build;
  check("the build runs it", build.includes("node scripts/check-mutation-tree.mjs"));
  check("...before next build, so a mutant never reaches a bundle",
    build.indexOf("check-mutation-tree") < build.indexOf("next build"));
  const clean = run(CHECK);
  // FLOORS. "No mutation is applied" is trivially true of a check that
  // parsed no mutations and found no targets.
  const declared = Number(clean.out.match(/(\d+) literal mutation/)?.[1] ?? 0);
  const targeted = Number(clean.out.match(/(\d+) file\(s\) are mutated/)?.[1] ?? 0);
  check(`it parsed the suites' mutations (${declared})`, declared >= 800, String(declared));
  check(`it resolved their target files (${targeted})`, targeted >= 100, String(targeted));
}

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`${pass} checks passed. A deleted line does not reach a bundle.`);
